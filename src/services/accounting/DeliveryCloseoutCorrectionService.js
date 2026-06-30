'use strict';

const crypto = require('node:crypto');
const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const orderRepository = require('../../repositories/orderRepository');
const returnOrderRepository = require('../../repositories/returnOrderRepository');
const inventoryStockService = require('../inventoryStock.service');
const InventoryPostingService = require('../../domain/posting/InventoryPostingService');
const { withMongoTransaction } = require('../../utils/transaction.util');
const { findReturnOrdersForDeliveryChildren } = require('../master-order/masterOrderReturn.impl');
const DeliveryCloseoutService = require('./DeliveryCloseoutService');
const ArDebtAdjustmentPostingService = require('./ArDebtAdjustmentPostingService');

function clean(value = '') { return String(value ?? '').trim(); }
function money(value) { const n = Number(toNumber(value)); return Number.isFinite(n) ? Math.round(n) : 0; }
function shortHash(value = '') { return crypto.createHash('sha1').update(clean(value)).digest('hex').slice(0, 10); }

function correctionId(order = {}, action = 'correction', reason = '') {
  const sourceId = DeliveryCloseoutService.orderId(order) || DeliveryCloseoutService.orderCode(order);
  return `DCO-${action}-${sourceId}-${shortHash(`${sourceId}:${action}:${reason}`)}`;
}

function assertConfirmedCloseout(order = {}) {
  if (!order.deliveryCloseout || order.deliveryCloseout.status !== 'accounting_confirmed') {
    const err = new Error('Chỉ được chạy correction flow khi deliveryCloseout đã accounting_confirmed.');
    err.code = 'DELIVERY_CLOSEOUT_NOT_CONFIRMED';
    throw err;
  }
  return order.deliveryCloseout;
}

function normalizeReturnOrderPayload(order = {}, payload = {}, action = 'add_return', options = {}) {
  const now = options.now || dateUtil.nowIso();
  const sourceId = DeliveryCloseoutService.orderId(order);
  const sourceCode = DeliveryCloseoutService.orderCode(order) || sourceId;
  const id = clean(payload.id || payload.code || correctionId(order, action, payload.reason || options.reason || now));
  return {
    ...payload,
    id,
    code: clean(payload.code || id),
    sourceModel: 'returnOrders',
    sourceType: 'returnOrder',
    correctionType: action,
    correctionReason: clean(payload.reason || options.reason || ''),
    orderId: clean(payload.orderId || payload.salesOrderId || sourceId),
    orderCode: clean(payload.orderCode || payload.salesOrderCode || sourceCode),
    salesOrderId: clean(payload.salesOrderId || payload.orderId || sourceId),
    salesOrderCode: clean(payload.salesOrderCode || payload.orderCode || sourceCode),
    masterOrderId: clean(payload.masterOrderId || order.masterOrderId || order.deliveryMasterId),
    masterOrderCode: clean(payload.masterOrderCode || order.masterOrderCode || order.deliveryMasterCode),
    customerId: clean(payload.customerId || order.customerId),
    customerCode: clean(payload.customerCode || order.customerCode),
    customerName: clean(payload.customerName || order.customerName),
    deliveryStaffCode: clean(payload.deliveryStaffCode || order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
    deliveryStaffName: clean(payload.deliveryStaffName || order.deliveryStaffName || order.deliveryName || order.nvghName),
    salesStaffCode: clean(payload.salesStaffCode || order.salesStaffCode || order.salesmanCode || order.nvbhCode),
    salesStaffName: clean(payload.salesStaffName || order.salesStaffName || order.salesmanName || order.nvbhName),
    amount: Math.abs(money(payload.amount ?? payload.returnAmount ?? payload.totalAmount)),
    returnAmount: Math.abs(money(payload.returnAmount ?? payload.amount ?? payload.totalAmount)),
    totalAmount: Math.abs(money(payload.totalAmount ?? payload.returnAmount ?? payload.amount)),
    returnStatus: payload.returnStatus || 'active',
    accountingStatus: payload.accountingStatus || 'confirmed_for_closeout_correction',
    warehouseReceiveStatus: payload.warehouseReceiveStatus || (action === 'add_return' ? 'received' : 'correction_out'),
    date: payload.date || order.deliveryDate || order.date || dateUtil.todayVN(),
    documentDate: payload.documentDate || payload.date || dateUtil.todayVN(),
    createdAt: payload.createdAt || now,
    updatedAt: now,
    createdBy: clean(options.actor || payload.createdBy || 'accountant'),
    updatedBy: clean(options.actor || payload.updatedBy || 'accountant')
  };
}

async function checkStockCanReduce(items = []) {
  const result = await inventoryStockService.checkAvailableForItems(items);
  if (!result.enough) {
    const err = new Error('Không đủ tồn kho để giảm hàng trả đã nhập thừa.');
    err.code = 'RETURN_CORRECTION_REDUCE_STOCK_SHORTAGE';
    err.shortages = result.shortages;
    throw err;
  }
  return result;
}

async function rebuildConfirmedCloseoutVersion(order = {}, returnOrders = [], options = {}) {
  const oldCloseout = assertConfirmedCloseout(order);
  const computed = DeliveryCloseoutService.buildCloseout(order, returnOrders, [], {
    actor: options.actor,
    status: 'accounting_confirmed',
    version: Number(oldCloseout.version || 0) + 1
  });
  const confirmed = DeliveryCloseoutService.confirmCloseout(order, computed, { actor: options.actor || 'accountant' });
  confirmed.status = 'accounting_confirmed';
  confirmed.correctionOfVersion = oldCloseout.version;
  confirmed.reason = clean(options.reason || 'delivery closeout correction');
  return confirmed;
}

function buildUpdatedOrder(order = {}, closeout = {}) {
  const finalDebt = DeliveryCloseoutService.positiveMoney(closeout.finalDebtAmount);
  return {
    ...order,
    deliveryCloseout: closeout,
    debtAmount: finalDebt,
    debt: finalDebt,
    arBalance: finalDebt,
    arStatus: finalDebt > 0 ? 'ar_debt_opened' : 'paid',
    lifecycleStatus: finalDebt > 0 ? 'ar_debt_opened' : 'paid',
    updatedAt: dateUtil.nowIso()
  };
}

async function correctionSession(input = {}, options = {}) {
  const actor = clean(options.actor || input.correctedBy || input.userName || 'accountant');
  const reason = clean(input.reason || options.reason || 'delivery closeout correction');
  const orderRef = clean(input.orderId || input.orderCode || input.salesOrderId || input.salesOrderCode || input.id || input.code);
  const order = await orderRepository.findByIdOrCode(orderRef);
  if (!order) return { error: 'Không tìm thấy salesOrder để correction deliveryCloseout', status: 404 };
  const oldCloseout = assertConfirmedCloseout(order);
  const action = clean(input.action || input.type || 'add_return').toLowerCase();
  if (!['add_return', 'reduce_return'].includes(action)) {
    return { error: 'Correction action không hợp lệ. Chỉ hỗ trợ add_return hoặc reduce_return.', status: 400 };
  }

  let correctionReturnOrder = normalizeReturnOrderPayload(order, input.returnOrder || input, action, { actor, reason });
  if (action === 'reduce_return') {
    correctionReturnOrder.amount = -Math.abs(money(correctionReturnOrder.amount || correctionReturnOrder.returnAmount));
    correctionReturnOrder.returnAmount = correctionReturnOrder.amount;
    correctionReturnOrder.totalAmount = correctionReturnOrder.amount;
    await checkStockCanReduce(correctionReturnOrder.items || input.items || []);
  }

  let result;
  await withMongoTransaction(async (session) => {
    await returnOrderRepository.upsert(correctionReturnOrder, { session });
    if (action === 'add_return') {
      await InventoryPostingService.postReturnIn(correctionReturnOrder, { session });
    } else {
      await InventoryPostingService.postAdjustment({ ...correctionReturnOrder, items: correctionReturnOrder.items || input.items || [] }, 'OUT', { session });
    }

    const returnOrders = await findReturnOrdersForDeliveryChildren([order]);
    const mergedReturnOrders = [...returnOrders, correctionReturnOrder];
    const newCloseout = await rebuildConfirmedCloseoutVersion(order, mergedReturnOrders, { actor, reason });
    const oldDebt = money(oldCloseout.finalDebtAmount);
    const newDebt = money(newCloseout.finalDebtAmount);
    const deltaDebt = newDebt - oldDebt;
    const updatedOrder = buildUpdatedOrder(order, newCloseout);
    await orderRepository.upsert(updatedOrder, { session });

    const adjustment = await ArDebtAdjustmentPostingService.postAdjustment(updatedOrder, {
      orderId: DeliveryCloseoutService.orderId(order),
      orderCode: DeliveryCloseoutService.orderCode(order),
      deliveryCloseoutVersion: newCloseout.version,
      deliveryCloseoutHash: newCloseout.calculationHash,
      oldFinalDebtAmount: oldDebt,
      newFinalDebtAmount: newDebt,
      deltaDebt,
      returnOrderIds: Array.isArray(newCloseout.returnOrderIds) ? newCloseout.returnOrderIds : [],
      reason,
      correctedBy: actor,
      correctedAt: dateUtil.nowIso()
    }, { session, actor });

    result = {
      orderId: DeliveryCloseoutService.orderId(order),
      orderCode: DeliveryCloseoutService.orderCode(order),
      action,
      returnOrder: correctionReturnOrder,
      oldCloseout,
      newCloseout,
      deltaDebt,
      arDebtAdjustment: adjustment,
      message: deltaDebt === 0
        ? 'Correction không làm đổi công nợ.'
        : `Correction đã tạo AR-DEBT-ADJUSTMENT ${deltaDebt > 0 ? 'debit' : 'credit'} ${Math.abs(deltaDebt)}.`
    };
  });
  return result;
}

async function addReturn(input = {}, options = {}) {
  return correctionSession({ ...input, action: 'add_return' }, options);
}

async function reduceReturn(input = {}, options = {}) {
  return correctionSession({ ...input, action: 'reduce_return' }, options);
}

module.exports = {
  correctionSession,
  addReturn,
  reduceReturn,
  normalizeReturnOrderPayload,
  rebuildConfirmedCloseoutVersion,
  checkStockCanReduce,
  _internal: { correctionId, money, assertConfirmedCloseout, buildUpdatedOrder }
};
