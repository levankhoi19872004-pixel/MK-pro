'use strict';

const crypto = require('node:crypto');
const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const paymentRepository = require('../../repositories/paymentRepository');
const arDebtReadModel = require('../arDebtReadModel.service');
const DeliveryCloseoutService = require('./DeliveryCloseoutService');

function clean(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const amount = Number(toNumber(value));
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount);
}

function shortHash(value = '') {
  return crypto.createHash('sha1').update(clean(value)).digest('hex').slice(0, 12);
}

function adjustmentSide(deltaDebt) {
  const delta = money(deltaDebt);
  if (delta > 0) return { debit: delta, credit: 0, direction: 'debit', amountField: 'debit', amount: delta };
  if (delta < 0) return { debit: 0, credit: Math.abs(delta), direction: 'credit', amountField: 'credit', amount: Math.abs(delta) };
  return { debit: 0, credit: 0, direction: '', amountField: '', amount: 0 };
}

function buildAdjustmentLedger(order = {}, context = {}, options = {}) {
  const side = adjustmentSide(context.deltaDebt);
  if (side.amount <= 0) return null;
  const sourceId = clean(DeliveryCloseoutService.orderId(order) || context.orderId || context.sourceId);
  const sourceCode = clean(DeliveryCloseoutService.orderCode(order) || context.orderCode || sourceId);
  if (!sourceId) {
    const err = new Error('Không thể sinh AR-DEBT-ADJUSTMENT vì thiếu orderId.');
    err.code = 'AR_DEBT_ADJUSTMENT_MISSING_ORDER_ID';
    throw err;
  }
  const version = clean(context.deliveryCloseoutVersion || context.version || 'v0');
  const reason = clean(context.reason || options.reason || 'delivery closeout correction');
  const reasonHash = shortHash(`${sourceId}:${version}:${money(context.deltaDebt)}:${reason}`);
  const now = options.now || dateUtil.nowIso();
  return {
    id: `AR-DEBT-ADJUSTMENT-${sourceId}-${version}-${reasonHash}`,
    code: `AR-DEBT-ADJUSTMENT-${sourceCode}-${version}-${reasonHash}`,
    idempotencyKey: `AR-DEBT-ADJUSTMENT:${sourceId}:${version}:${money(context.deltaDebt)}:${reasonHash}`,
    date: dateUtil.toDateOnly(options.date || context.correctedAt || now),
    account: 'AR',
    category: 'AR-DEBT-ADJUSTMENT',
    ledgerType: 'AR-DEBT-ADJUSTMENT',
    entryType: 'normal',
    sourceType: 'SALES_ORDER_DELIVERY_CLOSEOUT_CORRECTION',
    sourceId,
    sourceCode,
    refType: 'SALES_ORDER_DELIVERY_CLOSEOUT_CORRECTION',
    refId: sourceId,
    refCode: sourceCode,
    orderId: sourceId,
    orderCode: sourceCode,
    salesOrderId: sourceId,
    salesOrderCode: sourceCode,
    customerId: clean(order.customerId),
    customerCode: clean(order.customerCode),
    customerName: clean(order.customerName),
    salesStaffCode: clean(order.salesStaffCode || order.salesmanCode || order.nvbhCode),
    salesStaffName: clean(order.salesStaffName || order.salesmanName || order.nvbhName),
    salesmanCode: clean(order.salesmanCode || order.salesStaffCode || order.nvbhCode),
    salesmanName: clean(order.salesmanName || order.salesStaffName || order.nvbhName),
    deliveryStaffCode: clean(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
    deliveryStaffName: clean(order.deliveryStaffName || order.deliveryName || order.nvghName),
    masterOrderId: clean(order.masterOrderId || order.deliveryMasterId),
    masterOrderCode: clean(order.masterOrderCode || order.deliveryMasterCode),
    debit: side.debit,
    credit: side.credit,
    amount: side.amount,
    direction: side.direction,
    amountField: side.amountField,
    status: 'posted',
    active: true,
    reversed: false,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingBatchId: clean(options.accountingBatchId || `AR-DEBT-ADJUSTMENT-${sourceId}-${version}`),
    deliveryCloseoutVersion: context.deliveryCloseoutVersion || context.version || '',
    deliveryCloseoutHash: clean(context.deliveryCloseoutHash || context.calculationHash),
    oldFinalDebtAmount: money(context.oldFinalDebtAmount),
    newFinalDebtAmount: money(context.newFinalDebtAmount),
    deltaDebt: money(context.deltaDebt),
    returnOrderIds: Array.isArray(context.returnOrderIds) ? context.returnOrderIds : [],
    reason,
    correctedBy: clean(context.correctedBy || options.actor || 'accountant'),
    correctedAt: clean(context.correctedAt || now),
    createdAt: now,
    updatedAt: now,
    createdBy: clean(context.correctedBy || options.actor || 'accountant'),
    note: clean(options.note || `Điều chỉnh công nợ sau correction chốt giao hàng ${sourceCode}: delta=${money(context.deltaDebt)}`)
  };
}

async function postAdjustment(order = {}, context = {}, options = {}) {
  const entry = buildAdjustmentLedger(order, context, options);
  if (!entry) return { posted: false, skipped: true, reason: 'zero_delta' };
  const existing = await paymentRepository.findAll({
    idempotencyKey: entry.idempotencyKey,
    active: true,
    reversed: { $ne: true },
    category: 'AR-DEBT-ADJUSTMENT'
  }, { ...options, limit: 5 });
  if (Array.isArray(existing) && existing.length) return { posted: false, idempotent: true, entry: existing[0] };
  const saved = await paymentRepository.upsert(entry, options);
  if (options.skipReadModelRebuild !== true) {
    await arDebtReadModel.rebuildDebtForSource(entry.sourceId, { ...options, dryRun: options.dryRunReadModel === true });
  }
  return { posted: true, entry: saved || entry };
}

module.exports = {
  buildAdjustmentLedger,
  postAdjustment,
  _internal: { money, adjustmentSide, shortHash }
};
