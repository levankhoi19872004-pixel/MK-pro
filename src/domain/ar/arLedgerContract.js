'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const {
  normalizeAccountingAmount,
  validateArLedgerContract,
  assertValidArLedgerContract,
  isCanonicalArDebtLedger
} = require('./arLedgerValidator');

function clean(value = '') {
  return String(value ?? '').trim();
}

function amountFromOrder(order = {}, context = {}) {
  return Math.max(0, Math.round(toNumber(
    context.amount
    ?? order.debtBeforeCollection
    ?? order.totalAmount
    ?? order.amount
    ?? order.grandTotal
    ?? order.payableAmount
    ?? order.debtAmount
    ?? order.debt
    ?? 0
  )));
}

function sourceIdFromOrder(order = {}) {
  return clean(order.salesOrderId || order.sourceId || order.orderId || order.id || order._id || order.code || order.orderCode);
}

function sourceCodeFromOrder(order = {}) {
  return clean(order.salesOrderCode || order.sourceCode || order.orderCode || order.code || order.id || order._id || sourceIdFromOrder(order));
}

function actorFromContext(context = {}, fallback = 'system') {
  const actor = context.accountant || context.createdBy || context.accountingConfirmedBy || context.user;
  if (typeof actor === 'string') return clean(actor) || fallback;
  return clean(actor?.code || actor?.id || actor?.name || actor?.email || fallback) || fallback;
}

function auditEvent(action, context = {}, extra = {}) {
  return {
    action,
    at: context.now || dateUtil.nowIso(),
    by: actorFromContext(context),
    phase: 'phase79-clean-ar-sale-canonical-posting',
    ...extra
  };
}

function buildArSaleLedger(order = {}, context = {}) {
  const now = context.now || dateUtil.nowIso();
  const ts = context.timestamp || String(Date.now());
  const sourceId = sourceIdFromOrder(order);
  const sourceCode = sourceCodeFromOrder(order);
  const amount = amountFromOrder(order, context);
  const actor = actorFromContext(context, clean(order.accountingConfirmedBy) || 'system');
  const accountingBatchId = clean(context.accountingBatchId) || `ACC-${sourceId}-${ts}`;
  const ledger = {
    account: 'AR',
    category: 'AR-SALE',
    ledgerType: 'AR-SALE',
    entryType: 'normal',
    type: 'ar_sale',
    sourceType: 'salesOrder',
    sourceId,
    sourceCode,
    refType: 'SALES_ORDER',
    refId: sourceId,
    refCode: sourceCode,
    orderId: sourceId,
    orderCode: sourceCode,
    salesOrderId: sourceId,
    salesOrderCode: sourceCode,
    customerId: clean(order.customerId),
    customerCode: clean(order.customerCode || order.customerId),
    customerName: clean(order.customerName),
    salesStaffCode: clean(order.salesStaffCode || order.salesmanCode || order.nvbhCode),
    salesStaffName: clean(order.salesStaffName || order.salesmanName || order.nvbhName),
    deliveryStaffCode: clean(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
    deliveryStaffName: clean(order.deliveryStaffName || order.deliveryName || order.nvghName),
    masterOrderId: clean(order.masterOrderId || order.deliveryMasterId),
    masterOrderCode: clean(order.masterOrderCode || order.deliveryMasterCode),
    accountingBatchId,
    idempotencyKey: clean(context.idempotencyKey) || `AR-SALE:salesOrder:${sourceId}`,
    accountingStatus: 'confirmed',
    accountingConfirmed: true,
    accountingConfirmedBy: actor,
    debit: amount,
    credit: 0,
    amount,
    direction: 'debit',
    amountField: 'debit',
    active: true,
    reversed: false,
    status: 'posted',
    source: 'phase79_arPosting.service',
    date: dateUtil.toDateOnly(context.date || order.deliveryDate || order.date || order.orderDate || now, dateUtil.todayVN()),
    id: clean(context.id) || `AR-SALE-${sourceCode}-ACC-${sourceId}-${ts}`,
    code: clean(context.code) || `AR-SALE-${sourceCode}-ACC-${sourceId}-${ts}`,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
    note: clean(context.note) || `Phase79 canonical AR-SALE đơn bán ${sourceCode || sourceId}`,
    auditTrail: [
      ...(Array.isArray(order.auditTrail) ? order.auditTrail : []),
      auditEvent('build_ar_sale_canonical', { ...context, now }, { sourceId, sourceCode, amount, accountingBatchId })
    ]
  };
  return ledger;
}

function buildArSaleReversalLedger(originalLedger = {}, context = {}) {
  const now = context.now || dateUtil.nowIso();
  const ts = context.timestamp || String(Date.now());
  const sourceId = clean(originalLedger.sourceId || originalLedger.salesOrderId || originalLedger.orderId);
  const sourceCode = clean(originalLedger.sourceCode || originalLedger.salesOrderCode || originalLedger.orderCode || sourceId);
  const originalLedgerId = clean(originalLedger.id || originalLedger._id || originalLedger.code);
  const amount = Math.max(0, Math.round(toNumber(context.amount ?? originalLedger.debit ?? originalLedger.amount)));
  const actor = actorFromContext(context, clean(originalLedger.accountingConfirmedBy) || 'system');
  const accountingBatchId = clean(context.accountingBatchId) || `REV-${sourceId}-${ts}`;
  return {
    account: 'AR',
    category: 'AR-SALE-REVERSAL',
    ledgerType: 'AR-SALE-REVERSAL',
    entryType: 'reversal',
    type: 'ar_sale_reversal',
    sourceType: 'salesOrder',
    sourceId,
    sourceCode,
    refType: 'AR_LEDGER_REVERSAL',
    refId: originalLedgerId,
    refCode: clean(originalLedger.code || originalLedger.id),
    orderId: clean(originalLedger.orderId || originalLedger.salesOrderId || sourceId),
    orderCode: clean(originalLedger.orderCode || originalLedger.salesOrderCode || sourceCode),
    salesOrderId: clean(originalLedger.salesOrderId || originalLedger.orderId || sourceId),
    salesOrderCode: clean(originalLedger.salesOrderCode || originalLedger.orderCode || sourceCode),
    customerId: clean(originalLedger.customerId),
    customerCode: clean(originalLedger.customerCode || originalLedger.customerId),
    customerName: clean(originalLedger.customerName),
    salesStaffCode: clean(originalLedger.salesStaffCode || originalLedger.salesmanCode || originalLedger.nvbhCode),
    salesStaffName: clean(originalLedger.salesStaffName || originalLedger.salesmanName || originalLedger.nvbhName),
    deliveryStaffCode: clean(originalLedger.deliveryStaffCode || originalLedger.deliveryCode || originalLedger.nvghCode),
    deliveryStaffName: clean(originalLedger.deliveryStaffName || originalLedger.deliveryName || originalLedger.nvghName),
    masterOrderId: clean(originalLedger.masterOrderId),
    masterOrderCode: clean(originalLedger.masterOrderCode),
    reversedLedgerId: originalLedgerId,
    originalLedgerId,
    originalLedgerCode: clean(originalLedger.code || originalLedger.id),
    reversalOf: originalLedgerId,
    reversalReason: clean(context.reason) || 'reverse AR-SALE',
    accountingBatchId,
    idempotencyKey: `AR-SALE-REVERSAL:salesOrder:${sourceId}:${originalLedgerId}`,
    accountingStatus: 'confirmed',
    accountingConfirmed: true,
    accountingConfirmedBy: actor,
    debit: 0,
    credit: amount,
    amount,
    direction: 'credit',
    amountField: 'credit',
    active: true,
    reversed: false,
    status: 'posted',
    source: 'phase79_arPosting.service',
    sourceCategory: 'AR-SALE',
    sourceAction: 'reverse',
    date: dateUtil.toDateOnly(context.date || originalLedger.date || now, dateUtil.todayVN()),
    id: clean(context.id) || `AR-SALE-REVERSAL-${sourceCode}-${accountingBatchId}`,
    code: clean(context.code) || `AR-SALE-REVERSAL-${sourceCode}-${accountingBatchId}`,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
    note: clean(context.note) || `Phase79 đảo AR-SALE ${originalLedger.code || originalLedger.id || originalLedgerId}`,
    auditTrail: [
      ...(Array.isArray(originalLedger.auditTrail) ? originalLedger.auditTrail : []),
      auditEvent('build_ar_sale_reversal_canonical', { ...context, now }, { sourceId, sourceCode, amount, originalLedgerId, accountingBatchId })
    ]
  };
}

module.exports = {
  buildArSaleLedger,
  buildArSaleReversalLedger,
  validateArLedgerContract,
  assertValidArLedgerContract,
  normalizeAccountingAmount,
  isCanonicalArDebtLedger
};
