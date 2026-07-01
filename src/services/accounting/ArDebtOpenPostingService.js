'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const { normalizeDebtAmount } = require('../../constants/finance.constants');
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

function idSeed(order = {}) {
  return clean(DeliveryCloseoutService.orderId(order) || DeliveryCloseoutService.orderCode(order));
}

function buildDebtOpenLedger(order = {}, closeout = {}, options = {}) {
  const amount = normalizeDebtAmount(closeout.finalDebtAmount);
  const sourceId = idSeed(order);
  const sourceCode = clean(DeliveryCloseoutService.orderCode(order) || sourceId);
  if (!sourceId) {
    const err = new Error('Không thể sinh AR-DEBT-OPEN vì salesOrder thiếu id/code ổn định.');
    err.code = 'AR_DEBT_OPEN_MISSING_ORDER_ID';
    throw err;
  }
  if (amount <= 0) return null;

  const now = options.now || dateUtil.nowIso();
  const accountingBatchId = clean(options.accountingBatchId || `AR-DEBT-OPEN-${sourceId}`);
  return {
    id: `AR-DEBT-OPEN-${sourceId}`,
    code: `AR-DEBT-OPEN-${sourceCode}`,
    idempotencyKey: `AR-DEBT-OPEN:${sourceId}`,
    date: dateUtil.toDateOnly(options.date || order.deliveryDate || order.date || now),
    account: 'AR',
    category: 'AR-DEBT-OPEN',
    ledgerType: 'AR-DEBT-OPEN',
    entryType: 'normal',
    sourceType: 'SALES_ORDER_DELIVERY_CLOSEOUT',
    sourceId,
    sourceCode,
    refType: 'SALES_ORDER_DELIVERY_CLOSEOUT',
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
    debit: amount,
    credit: 0,
    amount,
    direction: 'debit',
    amountField: 'debit',
    status: 'posted',
    active: true,
    reversed: false,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingBatchId,
    deliveryCloseoutVersion: closeout.version,
    deliveryCloseoutHash: closeout.calculationHash,
    originalAmount: money(closeout.originalAmount),
    returnedAmount: money(closeout.returnedAmount),
    cashAmount: money(closeout.cashAmount),
    bankAmount: money(closeout.bankAmount),
    rewardAmount: money(closeout.rewardAmount || closeout.offsetAmount),
    collectedAmount: money(closeout.collectedAmount),
    rawFinalDebtAmount: money(closeout.rawFinalDebtAmount),
    finalDebtAmount: amount,
    returnOrderIds: Array.isArray(closeout.returnOrderIds) ? closeout.returnOrderIds : [],
    paymentIds: Array.isArray(closeout.paymentIds) ? closeout.paymentIds : [],
    createdAt: now,
    updatedAt: now,
    createdBy: clean(options.actor || order.accountingConfirmedBy || 'accountant'),
    note: clean(options.note || `Mở công nợ cuối cùng từ chốt giao hàng ${sourceCode}`)
  };
}

async function findExisting(idempotencyKey, options = {}) {
  const rows = await paymentRepository.findAll({
    idempotencyKey,
    active: true,
    reversed: { $ne: true },
    category: 'AR-DEBT-OPEN'
  }, { ...options, limit: 5 });
  return Array.isArray(rows) ? rows : [];
}

async function postDebtOpen(order = {}, closeout = {}, options = {}) {
  const amount = normalizeDebtAmount(closeout.finalDebtAmount);
  if (amount < 0) {
    return {
      posted: false,
      exception: true,
      reason: 'overpayment_final_debt_negative',
      overpaymentAmount: Math.abs(amount)
    };
  }
  if (amount === 0) {
    return { posted: false, skipped: true, reason: 'zero_final_debt' };
  }

  const entry = buildDebtOpenLedger(order, closeout, options);
  const existing = await findExisting(entry.idempotencyKey, options);
  if (existing.length) {
    const sameAmount = existing.find((row) => money(row.debit) === amount);
    if (sameAmount) return { posted: false, idempotent: true, entry: sameAmount };
    const err = new Error('AR-DEBT-OPEN đã tồn tại nhưng khác số tiền. Không được sửa in-place; phải dùng correction flow.');
    err.code = 'AR_DEBT_OPEN_AMOUNT_CONFLICT_REQUIRES_CORRECTION';
    err.existing = existing.map((row) => ({ id: row.id, code: row.code, debit: money(row.debit), idempotencyKey: row.idempotencyKey }));
    err.expectedAmount = amount;
    throw err;
  }

  const saved = await paymentRepository.upsert(entry, options);
  if (options.skipReadModelRebuild !== true) {
    await arDebtReadModel.rebuildDebtForSource(entry.sourceId, { ...options, dryRun: options.dryRunReadModel === true });
  }
  return { posted: true, entry: saved || entry };
}

module.exports = {
  buildDebtOpenLedger,
  postDebtOpen,
  _internal: { money, normalizeDebtAmount, idSeed, findExisting }
};
