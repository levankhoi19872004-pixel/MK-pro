'use strict';

const dateUtil = require('../../../utils/date.util');
const orderRepository = require('../../../repositories/orderRepository');
const paymentRepository = require('../../../repositories/paymentRepository');
const fundLedgerRepository = require('../../../repositories/fundLedgerRepository');
const { findReturnOrdersForDeliveryChildren } = require('../../master-order/masterOrderReturn.impl');
const { compactDeliveryOrderKeys } = require('../../master-order/masterOrderIdentity.util');
const DeliveryCloseoutService = require('../DeliveryCloseoutService');
const OrderPaymentAllocationService = require('../OrderPaymentAllocationService');
const OrderPaymentDebtReconcileService = require('../OrderPaymentDebtReconcileService');
const closeoutQueryAudit = require('../../../observability/closeoutQueryAudit');

const CLOSEOUT_ORDER_PROJECTION = [
  'id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderId', 'salesOrderCode',
  'date', 'orderDate', 'deliveryDate', 'createdAt', 'updatedAt',
  'customerId', 'customerCode', 'customerName', 'customerPhone', 'customerAddress', 'phone', 'address',
  'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName', 'nvbhCode', 'nvbhName',
  'deliveryStaffCode', 'deliveryStaffName', 'deliveryCode', 'deliveryName', 'nvghCode', 'nvghName',
  'status', 'deliveryStatus', 'accountingStatus', 'accountingConfirmed', 'accountingLocked',
  'cashClosed', 'cashSubmitted', 'dayLocked', 'periodLocked', 'settlementClosed', 'editLocked', 'deliveryLocked',
  'totalAmount', 'subtotal', 'discountAmount', 'finalAmount', 'payableAmount', 'debtBeforeCollection', 'debtAmount', 'debt', 'arBalance',
  'paidAmount', 'cashCollected', 'cashAmount', 'bankCollected', 'bankAmount', 'transferAmount',
  'returnAmount', 'returnedAmount', 'returnAmountFromReturnOrders', 'syncedReturnAmountFromReturnOrders',
  'rewardAmount', 'bonusAmount', 'allowanceAmount', 'promotionRewardAmount', 'displayRewardAmount', 'bonusReturnAmount', 'rewardOffsetAmount', 'promotionOffsetAmount', 'offsetAmount', 'debtOffsetAmount',
  'paymentAllocations', 'deliveryPayment', 'deliveryPayments', 'payments', 'items', 'lines', 'products',
  'masterOrderId', 'masterOrderCode', 'deliveryMasterId', 'deliveryMasterCode', 'masterId', 'masterCode',
  'deliveryCloseout', 'version', 'note', 'deliveryNote'
].join(' ');

function clean(value = '') {
  return String(value ?? '').trim();
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => clean(value))
    .filter(Boolean))];
}

function normalizeCloseoutCommand(body = {}, helpers = {}) {
  const selectedOrderIds = typeof helpers.normalizeOrderIds === 'function'
    ? helpers.normalizeOrderIds(body)
    : unique([...(Array.isArray(body.orderIds) ? body.orderIds : []), ...(Array.isArray(body.selectedOrderIds) ? body.selectedOrderIds : [])]);
  const date = dateUtil.toDateOnly(body.date || body.deliveryDate || dateUtil.todayVN());
  const actor = clean(body.confirmedBy || body.userName || body.accountantName || 'accountant');
  const reason = clean(body.reason || body.note || 'Chot so giao hang cuoi ngay');
  return {
    body,
    date,
    selectedOrderIds,
    actor,
    confirmedBy: actor,
    reason,
    deliveryStaffCode: clean(body.deliveryStaffCode || body.delivery || body.nvghCode),
    implementation: 'canonical-context-v1'
  };
}

async function loadOrders(command = {}, options = {}) {
  if (!command.selectedOrderIds.length) return [];
  return orderRepository.findManyByIdentity(command.selectedOrderIds, {
    session: options.session,
    limit: Math.max(1, command.selectedOrderIds.length),
    projection: options.projection || CLOSEOUT_ORDER_PROJECTION
  });
}

function groupReturnOrdersBySalesOrder(returnOrders = [], orders = []) {
  const result = new Map();
  for (const order of Array.isArray(orders) ? orders : []) {
    for (const key of compactDeliveryOrderKeys(order)) result.set(key, []);
  }
  for (const row of Array.isArray(returnOrders) ? returnOrders : []) {
    const rowKeys = unique([
      row.orderId,
      row.salesOrderId,
      row.sourceOrderId,
      row.deliveryOrderId,
      row.orderCode,
      row.salesOrderCode,
      row.sourceOrderCode,
      row.deliveryOrderCode
    ]);
    for (const key of rowKeys) {
      if (!result.has(key)) continue;
      result.get(key).push(row);
    }
  }
  return result;
}

function returnOrdersForOrder(order = {}, returnByKey = new Map()) {
  const used = new Set();
  const rows = [];
  for (const key of compactDeliveryOrderKeys(order)) {
    for (const row of returnByKey.get(key) || []) {
      const rowKey = clean(row.id || row.code || row._id || JSON.stringify(row));
      if (used.has(rowKey)) continue;
      used.add(rowKey);
      rows.push(row);
    }
  }
  return rows;
}

function buildCloseoutPreview(order = {}, returnOrders = [], context = {}, helpers = {}) {
  const existingCloseout = order.deliveryCloseout || {};
  const closeout = DeliveryCloseoutService.buildCloseout(order, returnOrders, [], {
    actor: context.command.actor,
    status: existingCloseout.status || 'pending_accounting',
    reason: context.command.reason
  });
  return typeof helpers.attachCloseoutScope === 'function'
    ? helpers.attachCloseoutScope(closeout, order, {
      closeoutScope: context.closeoutScope,
      closeoutScopeHash: context.closeoutScopeHash,
      selectedOrderCodes: context.selectedOrderCodes,
      selectedSalesStaffCodes: context.selectedSalesStaffCodes
    })
    : closeout;
}

function collectWriterIdempotencyKeys(context = {}, helpers = {}) {
  const returnByKey = groupReturnOrdersBySalesOrder(context.returnOrders, context.pendingConfirmOrders);
  const arKeys = [];
  const fundKeys = [];
  const previews = [];

  for (const order of context.pendingConfirmOrders || []) {
    const returnOrders = returnOrdersForOrder(order, returnByKey);
    const closeout = buildCloseoutPreview(order, returnOrders, context, helpers);
    const allocation = OrderPaymentAllocationService.buildAllocationFromCloseout(order, closeout, {
      actor: context.command.actor,
      confirmedBy: context.command.actor,
      date: context.command.date,
      accountingBatchId: `OPA-ACC-${DeliveryCloseoutService.orderId(order) || DeliveryCloseoutService.orderCode(order)}`,
      closeoutScopeHash: clean(closeout.closeoutScopeHash || closeout.scopeHash),
      closeoutScope: closeout.closeoutScope || 'selected_orders',
      note: context.command.reason,
      skipReadModelRebuild: true
    });
    const arRows = OrderPaymentAllocationService.buildArLedgerRows(allocation, {});
    arKeys.push(...arRows.map((row) => row.idempotencyKey));
    if (Number(allocation.cashAmount || 0) > 0) fundKeys.push(`FUND:OPA:${allocation.idempotencyKey}:cash`);
    if (Number(allocation.bankAmount || 0) > 0) fundKeys.push(`FUND:OPA:${allocation.idempotencyKey}:bank`);

    const expected = OrderPaymentDebtReconcileService.computeExpectedDebtFromAllocation(allocation, {
      zeroTolerance: OrderPaymentAllocationService.DEFAULT_ZERO_TOLERANCE || 1000
    });
    arKeys.push(OrderPaymentDebtReconcileService.debtAdjustmentIdempotencyKey(allocation, expected.expectedDebtAmount));
    previews.push({ orderId: DeliveryCloseoutService.orderId(order), orderCode: DeliveryCloseoutService.orderCode(order), allocationIdempotencyKey: allocation.idempotencyKey });
  }

  return {
    arIdempotencyKeys: unique(arKeys),
    fundIdempotencyKeys: unique(fundKeys),
    previews
  };
}

function mapByIdempotency(rows = []) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = clean(row.idempotencyKey);
    if (key && !map.has(key)) map.set(key, row);
  }
  return map;
}

async function preloadWriterIdempotency(context = {}, helpers = {}, options = {}) {
  const keys = collectWriterIdempotencyKeys(context, helpers);
  const [existingArLedgers, existingFundLedgers] = await Promise.all([
    keys.arIdempotencyKeys.length
      ? closeoutQueryAudit.withCloseoutAuditStage('context.existingArLedgers', () => paymentRepository.findAll({
        idempotencyKey: { $in: keys.arIdempotencyKeys },
        active: { $ne: false },
        reversed: { $ne: true },
        isDeleted: { $ne: true },
        deleted: { $ne: true }
      }, {
        session: options.session,
        limit: Math.max(1, keys.arIdempotencyKeys.length),
        projection: 'id code idempotencyKey category ledgerType debit credit amount active reversed status accountingConfirmed accountingStatus'
      }))
      : [],
    keys.fundIdempotencyKeys.length
      ? closeoutQueryAudit.withCloseoutAuditStage('context.existingFundLedgers', () => fundLedgerRepository.findAll({
        idempotencyKey: { $in: keys.fundIdempotencyKeys }
      }, {
        session: options.session,
        limit: Math.max(1, keys.fundIdempotencyKeys.length),
        projection: 'id code idempotencyKey fundType account direction amount status active'
      }))
      : []
  ]);

  return {
    ...keys,
    existingArLedgers,
    existingFundLedgers,
    existingArLedgerByIdempotencyKey: mapByIdempotency(existingArLedgers),
    existingFundLedgerByIdempotencyKey: mapByIdempotency(existingFundLedgers)
  };
}

async function loadCanonicalCloseoutContext(commandInput = {}, options = {}) {
  const helpers = options.helpers || {};
  const command = commandInput && commandInput.selectedOrderIds
    ? commandInput
    : normalizeCloseoutCommand(commandInput, helpers);
  closeoutQueryAudit.updateCardinality({ selectedOrderCount: command.selectedOrderIds.length });

  const orders = await closeoutQueryAudit.withCloseoutAuditStage('context.orders', () => loadOrders(command, options));
  const selectedOrderCodes = typeof helpers.resolveSelectedOrderCodes === 'function'
    ? helpers.resolveSelectedOrderCodes(orders, command.selectedOrderIds)
    : unique(orders.map((order) => order.orderCode || order.code || order.id)).sort();
  const selectedSalesStaffCodes = typeof helpers.resolveSelectedSalesStaffCodes === 'function'
    ? helpers.resolveSelectedSalesStaffCodes(orders, command.body)
    : unique(orders.map((order) => order.salesStaffCode || order.salesmanCode || order.nvbhCode)).sort();
  const closeoutScope = typeof helpers.buildCloseoutScopeKey === 'function'
    ? helpers.buildCloseoutScopeKey({
      date: command.date,
      deliveryStaffCode: command.deliveryStaffCode,
      selectedOrderCodes,
      selectedSalesStaffCodes
    })
    : { scopeHash: '', scopeType: 'selected_orders', selectedOrderCodes, selectedSalesStaffCodes };
  const isAccountingConfirmed = helpers.isAccountingConfirmed || (() => false);
  const alreadyConfirmedOrders = orders.filter(isAccountingConfirmed);
  const pendingConfirmOrders = orders.filter((order) => !isAccountingConfirmed(order));
  closeoutQueryAudit.updateCardinality({
    alreadyConfirmedOrderCount: alreadyConfirmedOrders.length,
    pendingOrderCount: pendingConfirmOrders.length
  });

  const returnOrders = pendingConfirmOrders.length
    ? await closeoutQueryAudit.withCloseoutAuditStage('context.returnOrders', () => findReturnOrdersForDeliveryChildren(pendingConfirmOrders, options))
    : [];
  closeoutQueryAudit.updateCardinality({ returnOrderCount: returnOrders.length });

  const context = {
    command,
    closeout: closeoutScope,
    closeoutScope,
    closeoutScopeHash: closeoutScope.scopeHash,
    deliveryStaff: {
      code: command.deliveryStaffCode
    },
    orders,
    orderIds: unique(orders.map((order) => order.id || order._id)),
    orderCodes: unique(orders.map((order) => order.orderCode || order.code || order.salesOrderCode)),
    selectedOrderCodes,
    selectedSalesStaffCodes,
    alreadyConfirmedOrders,
    pendingConfirmOrders,
    returnOrders,
    returnByKey: groupReturnOrdersBySalesOrder(returnOrders, pendingConfirmOrders),
    paymentAllocations: [],
    deliveryAdjustments: [],
    existingArLedgers: [],
    existingFundLedgers: [],
    existingInventoryImpacts: [],
    existingIdempotencyKeys: new Set(),
    calculatedTotals: {},
    metadata: {
      implementation: 'canonical-context-v1',
      loadedAt: dateUtil.nowIso()
    }
  };

  context.writerIdempotency = await preloadWriterIdempotency(context, helpers, options);
  context.existingArLedgers = context.writerIdempotency.existingArLedgers;
  context.existingFundLedgers = context.writerIdempotency.existingFundLedgers;
  context.existingIdempotencyKeys = new Set([
    ...context.existingArLedgers.map((row) => clean(row.idempotencyKey)).filter(Boolean),
    ...context.existingFundLedgers.map((row) => clean(row.idempotencyKey)).filter(Boolean)
  ]);

  return context;
}

module.exports = {
  CLOSEOUT_ORDER_PROJECTION,
  normalizeCloseoutCommand,
  loadCanonicalCloseoutContext,
  preloadWriterIdempotency,
  collectWriterIdempotencyKeys,
  groupReturnOrdersBySalesOrder,
  returnOrdersForOrder,
  _internal: {
    clean,
    unique,
    mapByIdempotency,
    buildCloseoutPreview
  }
};
