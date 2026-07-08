'use strict';

const crypto = require('node:crypto');
const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const paymentRepository = require('../../repositories/paymentRepository');
const arDebtReadModel = require('../arDebtReadModel.service');
const DeliveryCloseoutService = require('./DeliveryCloseoutService');
const OrderPaymentDebtReconcileService = require('./OrderPaymentDebtReconcileService');

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
  const side = adjustmentSide(context.deltaDebt ?? context.debtAdjustmentAmount);
  if (side.amount <= 0) return null;
  const salesOrderId = clean(DeliveryCloseoutService.orderId(order) || context.orderId || context.salesOrderId);
  const salesOrderCode = clean(DeliveryCloseoutService.orderCode(order) || context.orderCode || context.salesOrderCode || salesOrderId);
  if (!salesOrderId) {
    const err = new Error('Không thể sinh AR-DEBT-ADJUSTMENT vì thiếu orderId.');
    err.code = 'AR_DEBT_ADJUSTMENT_MISSING_ORDER_ID';
    throw err;
  }
  const sourceType = clean(options.sourceType || context.sourceType || (context.correctionId ? 'DELIVERY_CLOSEOUT_CORRECTION' : 'SALES_ORDER_DELIVERY_CLOSEOUT_CORRECTION'));
  const sourceId = clean(options.sourceId || context.sourceId || context.correctionId || salesOrderId);
  const sourceCode = clean(options.sourceCode || context.sourceCode || context.correctionCode || salesOrderCode);
  const version = clean(context.deliveryCloseoutVersion || context.version || 'v0');
  const reason = clean(context.reason || options.reason || 'delivery closeout correction');
  const reasonHash = shortHash(`${sourceId}:${salesOrderId}:${version}:${money(context.deltaDebt ?? context.debtAdjustmentAmount)}:${reason}`);
  const now = options.now || dateUtil.nowIso();
  return {
    id: clean(context.ledgerId || `AR-DEBT-ADJUSTMENT-${sourceId}-${version}-${reasonHash}`),
    code: clean(context.ledgerCode || `AR-DEBT-ADJUSTMENT-${sourceCode}-${version}-${reasonHash}`),
    idempotencyKey: clean(context.idempotencyKey || `AR-DEBT-ADJUSTMENT:${sourceId}:${salesOrderId}:${version}:${money(context.deltaDebt ?? context.debtAdjustmentAmount)}:${reasonHash}`),
    date: dateUtil.toDateOnly(options.date || context.correctedAt || now),
    account: 'AR',
    category: 'AR-DEBT-ADJUSTMENT',
    ledgerType: 'AR-DEBT-ADJUSTMENT',
    entryType: 'normal',
    sourceType,
    sourceId,
    sourceCode,
    sourceModel: 'deliveryCloseoutCorrections',
    refType: sourceType,
    refId: sourceId,
    refCode: sourceCode,
    orderId: salesOrderId,
    orderCode: salesOrderCode,
    salesOrderId,
    salesOrderCode,
    correctionId: clean(context.correctionId || sourceId),
    correctionCode: clean(context.correctionCode || sourceCode),
    originalCloseoutId: clean(context.originalCloseoutId),
    originalCloseoutCode: clean(context.originalCloseoutCode),
    newCloseoutId: clean(context.newCloseoutId),
    newCloseoutCode: clean(context.newCloseoutCode),
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
    deltaDebt: money(context.deltaDebt ?? context.debtAdjustmentAmount),
    debtAdjustmentAmount: money(context.debtAdjustmentAmount ?? context.deltaDebt),
    returnAdjustmentAmount: money(context.returnAdjustmentAmount),
    cashAdjustmentAmount: money(context.cashAdjustmentAmount),
    returnOrderIds: Array.isArray(context.returnOrderIds) ? context.returnOrderIds : [],
    reason,
    correctedBy: clean(context.correctedBy || options.actor || 'accountant'),
    correctedAt: clean(context.correctedAt || now),
    createdAt: now,
    updatedAt: now,
    createdBy: clean(context.correctedBy || options.actor || 'accountant'),
    note: clean(options.note || `Điều chỉnh công nợ sau correction chốt giao hàng ${salesOrderCode}: delta=${money(context.deltaDebt ?? context.debtAdjustmentAmount)}`)
  };
}


function buildReconcileAllocationFromContext(order = {}, context = {}, options = {}) {
  const salesOrderId = clean(DeliveryCloseoutService.orderId(order) || context.orderId || context.salesOrderId);
  const salesOrderCode = clean(DeliveryCloseoutService.orderCode(order) || context.orderCode || context.salesOrderCode || salesOrderId);
  const sourceType = clean(options.sourceType || context.sourceType || (context.correctionId ? 'DELIVERY_CLOSEOUT_CORRECTION' : 'SALES_ORDER_DELIVERY_CLOSEOUT_CORRECTION'));
  const sourceId = clean(options.sourceId || context.sourceId || context.correctionId || salesOrderId);
  const sourceCode = clean(options.sourceCode || context.sourceCode || context.correctionCode || salesOrderCode);
  const sourceVersion = Number(context.deliveryCloseoutVersion || context.version || 1) || 1;
  const allocation = context.reconcileAllocation && typeof context.reconcileAllocation === 'object'
    ? { ...context.reconcileAllocation }
    : {};
  return {
    allocationCode: clean(allocation.allocationCode || context.allocationCode || context.correctionId || sourceId || salesOrderCode),
    idempotencyKey: clean(allocation.idempotencyKey || context.allocationIdempotencyKey || `DCO-RECONCILE:${salesOrderCode}:${sourceType}:${sourceId}:v${sourceVersion}`),
    orderId: clean(allocation.orderId || salesOrderId),
    orderCode: clean(allocation.orderCode || salesOrderCode),
    customerCode: clean(allocation.customerCode || order.customerCode),
    customerName: clean(allocation.customerName || order.customerName),
    salesStaffCode: clean(allocation.salesStaffCode || order.salesStaffCode || order.salesmanCode || order.nvbhCode),
    salesStaffName: clean(allocation.salesStaffName || order.salesStaffName || order.salesmanName || order.nvbhName),
    deliveryStaffCode: clean(allocation.deliveryStaffCode || order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
    deliveryStaffName: clean(allocation.deliveryStaffName || order.deliveryStaffName || order.deliveryName || order.nvghName),
    deliveryDate: clean(allocation.deliveryDate || order.deliveryDate || order.orderDate || order.date || context.correctedAt),
    sourceType,
    sourceId,
    sourceCode,
    sourceVersion,
    receivableAmount: money(allocation.receivableAmount ?? context.receivableAmount ?? context.saleAmount ?? context.originalAmount ?? order.totalAmount ?? order.amount ?? order.total),
    cashAmount: money(allocation.cashAmount ?? context.cashAmount ?? context.newCashAmount),
    bankAmount: money(allocation.bankAmount ?? context.bankAmount ?? context.newBankAmount),
    rewardAmount: money(allocation.rewardAmount ?? context.rewardAmount ?? context.newRewardAmount),
    returnAmount: money(allocation.returnAmount ?? context.returnAmount ?? context.newReturnAmount),
    rawDebtAmount: money(allocation.rawDebtAmount ?? context.rawDebtAmount),
    normalizedDebtAmount: money(allocation.normalizedDebtAmount ?? context.newFinalDebtAmount ?? context.debtAmount),
    debtAmount: money(allocation.debtAmount ?? context.newFinalDebtAmount ?? context.debtAmount),
    zeroTolerance: money(allocation.zeroTolerance ?? context.zeroTolerance ?? options.zeroTolerance ?? 1000),
    status: 'posted'
  };
}

async function postAdjustmentByDebtReconcile(order = {}, context = {}, options = {}) {
  const allocation = buildReconcileAllocationFromContext(order, context, options);
  const sourceType = clean(options.sourceType || context.sourceType || allocation.sourceType || 'DELIVERY_CLOSEOUT_CORRECTION');
  const sourceId = clean(options.sourceId || context.sourceId || context.correctionId || allocation.sourceId);
  const sourceCode = clean(options.sourceCode || context.sourceCode || context.correctionCode || allocation.sourceCode);
  const result = await OrderPaymentDebtReconcileService.reconcileOrderDebt({
    order,
    allocation,
    apply: options.apply !== false,
    session: options.session,
    zeroTolerance: options.zeroTolerance || context.zeroTolerance || 1000,
    actor: context.correctedBy || options.actor || 'accountant',
    sourceType,
    sourceId,
    sourceCode,
    sourceModel: clean(options.sourceModel || context.sourceModel || 'deliveryCloseoutCorrections'),
    refType: sourceType,
    refId: clean(context.correctionId || sourceId),
    refCode: clean(context.correctionCode || sourceCode),
    idempotencyKey: clean(context.debtReconcileIdempotencyKey || ''),
    accountingBatchId: clean(options.accountingBatchId || `AR-DEBT-RECONCILE-${sourceId}-${allocation.sourceVersion || 1}`),
    reason: clean(context.reason || options.reason || 'delivery closeout correction debt reconcile'),
    note: clean(options.note || `Đối chiếu công nợ sau correction ${sourceCode}: current AR vs expected debt`)
  });
  return {
    posted: result.posted === true,
    idempotent: result.skippedAlreadyReconciled === true,
    skipped: result.skippedAlreadyFixed === true || result.skippedAlreadyReconciled === true,
    reason: result.skippedAlreadyFixed ? 'already_balanced' : (result.skippedAlreadyReconciled ? 'already_reconciled' : ''),
    entry: result.ledger,
    reconcile: result
  };
}

async function postAdjustment(order = {}, context = {}, options = {}) {
  if (options.reconcileDebt === true || context.reconcileDebt === true || context.reconcileAllocation) {
    return postAdjustmentByDebtReconcile(order, context, options);
  }
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
    await arDebtReadModel.rebuildDebtForSource(entry.salesOrderId || entry.orderId || entry.sourceId, { ...options, dryRun: options.dryRunReadModel === true });
  }
  return { posted: true, entry: saved || entry };
}

module.exports = {
  buildAdjustmentLedger,
  postAdjustment,
  _internal: { money, adjustmentSide, shortHash, buildReconcileAllocationFromContext }
};
