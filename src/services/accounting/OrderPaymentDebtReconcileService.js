'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const arLedgerReadService = require('../arLedgerRead.service');
const arPostingService = require('../arPosting.service');
const { normalizeAccountingAmount } = require('../../domain/ar/arLedgerValidator');
const { ACTIVE_DEBT_INCREASE_CATEGORIES } = require('../../domain/ar/arDebtCategoryRegistry');
const {
  resolveCanonicalArOrderIdentity,
  buildCanonicalArOrderLookupKeys
} = require('../../domain/ar/arOrderIdentity');
const OrderPaymentAllocationService = require('./OrderPaymentAllocationService');
const closeoutQueryAudit = require('../../observability/closeoutQueryAudit');

const ACTIVE_EXCLUDED_STATUSES = ['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'removed', 'superseded'];
const DEFAULT_ZERO_TOLERANCE = 1000;

function clean(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const amount = Number(toNumber(value));
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount);
}

function safeToken(value = '') {
  return clean(value).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'UNKNOWN';
}

function upper(value = '') {
  return clean(value).toUpperCase();
}

function normalizeZeroTolerance(value, fallback = DEFAULT_ZERO_TOLERANCE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function activeArFilter(extra = {}) {
  return {
    ...extra,
    active: { $ne: false },
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    status: { $nin: ACTIVE_EXCLUDED_STATUSES }
  };
}

function allocationIdentity(allocation = {}) {
  return clean(allocation.allocationCode || allocation.idempotencyKey || allocation._id || allocation.id || allocation.orderCode || allocation.orderId);
}

function orderCodeOf(allocation = {}, order = {}) {
  return clean(allocation.orderCode || order.orderCode || order.code || order.salesOrderCode || order.documentCode || order.invoiceCode);
}

function orderIdOf(allocation = {}, order = {}) {
  return clean(allocation.orderId || order.orderId || order.id || order._id || order.salesOrderId || orderCodeOf(allocation, order));
}

function customerCodeOf(allocation = {}, order = {}) {
  return clean(allocation.customerCode || order.customerCode);
}

function orderLedgerKeys(allocationOrOrder = {}, extraKeys = []) {
  return buildCanonicalArOrderLookupKeys({
    order: allocationOrOrder,
    allocation: allocationOrOrder,
    extraOrderKeys: extraKeys
  });
}

function buildArOrderMatch(orderCode, customerCode, options = {}) {
  const keys = orderLedgerKeys({ orderCode }, options.keys || []);
  const or = keys.length ? [
    { orderCode: { $in: keys } },
    { salesOrderCode: { $in: keys } },
    { sourceCode: { $in: keys } },
    { refCode: { $in: keys } },
    { referenceCode: { $in: keys } },
    { orderId: { $in: keys } },
    { salesOrderId: { $in: keys } },
    { sourceId: { $in: keys } },
    { refId: { $in: keys } },
    { referenceId: { $in: keys } }
  ] : [{ _id: { $exists: false } }];
  const match = activeArFilter({ $or: or });
  if (clean(customerCode)) match.customerCode = clean(customerCode);
  return match;
}

function computeExpectedDebtFromAllocation(allocation = {}, options = {}) {
  const zeroTolerance = normalizeZeroTolerance(options.zeroTolerance ?? allocation.zeroTolerance, DEFAULT_ZERO_TOLERANCE);
  const breakdown = typeof OrderPaymentAllocationService.computeDebtBreakdown === 'function'
    ? OrderPaymentAllocationService.computeDebtBreakdown(allocation, { zeroTolerance })
    : (() => {
      const rawDebtAmount = money(allocation.receivableAmount)
        - money(allocation.cashAmount)
        - money(allocation.bankAmount)
        - money(allocation.rewardAmount)
        - money(allocation.returnAmount);
      const expectedDebtAmount = Math.abs(rawDebtAmount) <= zeroTolerance ? 0 : Math.max(0, rawDebtAmount);
      return { rawDebtAmount, normalizedDebtAmount: expectedDebtAmount, debtAmount: expectedDebtAmount, zeroTolerance, zeroToleranceApplied: rawDebtAmount !== expectedDebtAmount, zeroToleranceAdjustmentAmount: rawDebtAmount - expectedDebtAmount };
    })();
  return {
    rawDebtAmount: money(breakdown.rawDebtAmount),
    expectedDebtAmount: money(breakdown.normalizedDebtAmount),
    normalizedDebtAmount: money(breakdown.normalizedDebtAmount),
    debtAmount: money(breakdown.debtAmount),
    zeroTolerance,
    zeroToleranceApplied: Boolean(breakdown.zeroToleranceApplied),
    zeroToleranceAdjustmentAmount: money(breakdown.zeroToleranceAdjustmentAmount)
  };
}

function firstMoney(source = {}, keys = [], fallback = 0) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source || {}, key)
      && source[key] !== undefined
      && source[key] !== null
      && clean(source[key]) !== '') return money(source[key]);
  }
  return money(fallback);
}

function computeExpectedDebtFromCloseout(closeout = {}, options = {}) {
  const zeroTolerance = normalizeZeroTolerance(options.zeroTolerance ?? closeout.zeroTolerance, DEFAULT_ZERO_TOLERANCE);
  const allocationLike = {
    receivableAmount: firstMoney(closeout, ['receivableAmount', 'originalAmount', 'saleAmount', 'deliveredAmount', 'totalAmount', 'amount'], options.receivableAmount),
    cashAmount: firstMoney(closeout, ['cashAmount', 'cashCollectedAmount', 'cashReceivedAmount', 'paidCashAmount'], options.cashAmount),
    bankAmount: firstMoney(closeout, ['bankAmount', 'bankTransferAmount', 'transferAmount', 'paidBankAmount'], options.bankAmount),
    rewardAmount: firstMoney(closeout, ['rewardAmount', 'offsetAmount', 'bonusAmount', 'allowanceAmount', 'rewardOffsetAmount'], options.rewardAmount),
    returnAmount: firstMoney(closeout, ['returnAmount', 'returnedAmount', 'actualReturnAmount', 'returnAmountFromReturnOrders'], options.returnAmount),
    zeroTolerance
  };
  return computeExpectedDebtFromAllocation(allocationLike, { zeroTolerance });
}

function allocationFromCloseout(order = {}, closeout = {}, options = {}) {
  const expected = computeExpectedDebtFromCloseout(closeout, options);
  const sourceType = clean(options.sourceType || closeout.sourceType || 'delivery_closeout');
  const sourceId = clean(options.sourceId || closeout.sourceId || closeout.id || closeout.closeoutId || closeout.code || closeout.closeoutCode || order.orderId || order.id || order._id || order.orderCode || order.code);
  const sourceCode = clean(options.sourceCode || closeout.sourceCode || closeout.code || closeout.closeoutCode || sourceId);
  const sourceVersion = Number(options.sourceVersion || closeout.sourceVersion || closeout.closeoutVersion || closeout.version || 1) || 1;
  const orderCode = orderCodeOf(closeout, order);
  const orderId = orderIdOf(closeout, order);
  return {
    allocationCode: clean(options.allocationCode || closeout.allocationCode || `DCO-RECONCILE-${orderCode || orderId}-${sourceVersion}`),
    idempotencyKey: clean(options.allocationIdempotencyKey || closeout.allocationIdempotencyKey || `DCO-RECONCILE:${orderCode || orderId}:${sourceType}:${sourceId}:v${sourceVersion}`),
    orderId,
    orderCode,
    customerCode: customerCodeOf(closeout, order),
    customerName: clean(closeout.customerName || order.customerName),
    salesStaffCode: clean(closeout.salesStaffCode || order.salesStaffCode || order.salesmanCode),
    salesStaffName: clean(closeout.salesStaffName || order.salesStaffName || order.salesmanName),
    deliveryStaffCode: clean(closeout.deliveryStaffCode || order.deliveryStaffCode || order.deliveryCode),
    deliveryStaffName: clean(closeout.deliveryStaffName || order.deliveryStaffName || order.deliveryName),
    deliveryDate: clean(closeout.deliveryDate || order.deliveryDate || order.orderDate || order.date),
    sourceType,
    sourceId,
    sourceCode,
    sourceVersion,
    receivableAmount: firstMoney(closeout, ['receivableAmount', 'originalAmount', 'saleAmount', 'deliveredAmount', 'totalAmount', 'amount'], order.totalAmount || order.amount || order.total),
    cashAmount: firstMoney(closeout, ['cashAmount', 'cashCollectedAmount', 'cashReceivedAmount', 'paidCashAmount'], 0),
    bankAmount: firstMoney(closeout, ['bankAmount', 'bankTransferAmount', 'transferAmount', 'paidBankAmount'], 0),
    rewardAmount: firstMoney(closeout, ['rewardAmount', 'offsetAmount', 'bonusAmount', 'allowanceAmount', 'rewardOffsetAmount'], 0),
    returnAmount: firstMoney(closeout, ['returnAmount', 'returnedAmount', 'actualReturnAmount', 'returnAmountFromReturnOrders'], 0),
    rawDebtAmount: expected.rawDebtAmount,
    normalizedDebtAmount: expected.expectedDebtAmount,
    debtAmount: expected.expectedDebtAmount,
    zeroTolerance: expected.zeroTolerance,
    zeroToleranceApplied: expected.zeroToleranceApplied,
    zeroToleranceAdjustmentAmount: expected.zeroToleranceAdjustmentAmount,
    status: 'posted'
  };
}

function sumCanonicalArBalance(rows = []) {
  return (rows || []).reduce((sum, row) => {
    const normalized = normalizeAccountingAmount(row);
    return money(sum + money(normalized.debit) - money(normalized.credit));
  }, 0);
}

function excludedOpeningDebit(details = {}) {
  return (details.excludedLedgers || []).find((row) => (
    ACTIVE_DEBT_INCREASE_CATEGORIES.includes(upper(row.category || row.ledgerType))
    && money(row.debit) > money(row.credit)
    && row.accountingConfirmed === true
    && clean(row.accountingStatus).toLowerCase() === 'confirmed'
    && row.active === true
    && row.reversed !== true
  )) || null;
}

function hasCanonicalLookupAnomaly(details = {}, expectedDebtAmount = 0, zeroTolerance = DEFAULT_ZERO_TOLERANCE) {
  return money(details.currentArBalance) === 0
    && money(expectedDebtAmount) > normalizeZeroTolerance(zeroTolerance, DEFAULT_ZERO_TOLERANCE)
    && Boolean(excludedOpeningDebit(details));
}

async function getCurrentOrderArBalanceDetails(identityInput = {}, customerCode = '', options = {}) {
  const identity = resolveCanonicalArOrderIdentity({
    ...(identityInput && typeof identityInput === 'object' ? identityInput : {}),
    extraOrderKeys: options.extraOrderKeys || options.keys || identityInput.extraOrderKeys || []
  });
  const readOptions = {
    session: options.session,
    limit: Math.max(1, Math.min(2000, Number(options.limit || 2000))),
    sort: { customerCode: 1, orderCode: 1, date: 1, createdAt: 1, _id: 1 }
  };
  const inspection = identity.lookupKeys.length
    ? await arLedgerReadService.inspectActiveDebtReadModelLedgersByOrderKeys(
      identity.lookupKeys,
      { customerCode, status: 'all' },
      readOptions
    )
    : {
      lookupKeys: [],
      rawMatchedLedgerCount: 0,
      rawActiveConfirmedLedgerCount: 0,
      canonicalMatchedLedgerCount: 0,
      excludedLedgerCount: 0,
      canonicalLedgers: [],
      rawActiveConfirmedLedgers: [],
      excludedLedgers: []
    };
  const currentArBalance = sumCanonicalArBalance(inspection.canonicalLedgers || []);
  return {
    ...inspection,
    identity,
    lookupKeys: identity.lookupKeys,
    ignoredSourceAliases: identity.ignoredSourceAliases,
    sourceAliasesMatchingBusinessIdentity: identity.sourceAliasesMatchingBusinessIdentity || [],
    currentArBalance
  };
}

async function getCurrentOrderArBalance(orderCode, customerCode, options = {}) {
  const identityInput = options.identityInput && typeof options.identityInput === 'object'
    ? options.identityInput
    : { identity: { orderCode }, extraOrderKeys: options.keys || [] };
  const details = await getCurrentOrderArBalanceDetails(identityInput, customerCode, options);
  return options.includeDiagnostics ? details : details.currentArBalance;
}

function debtAdjustmentIdempotencyKey(allocation = {}, expectedDebtAmount = 0) {
  const orderToken = safeToken(allocation.orderCode || allocation.orderId || allocation.sourceCode || allocation.sourceId);
  const allocationToken = safeToken(allocationIdentity(allocation));
  const version = safeToken(`v${Number(allocation.sourceVersion || allocation.version || 1) || 1}`);
  return `AR-DEBT-ADJUSTMENT:DEBT-RECONCILE:${orderToken}:${allocationToken}:${money(expectedDebtAmount)}:${version}`;
}

async function findActiveDebtAdjustmentByKey(idempotencyKey, options = {}) {
  if (!clean(idempotencyKey)) return null;
  const rows = await arLedgerReadService.getCanonicalLedgersByRawMatch(
    activeArFilter({ idempotencyKey: clean(idempotencyKey), category: 'AR-DEBT-ADJUSTMENT' }),
    { session: options.session, limit: 1, filters: { status: 'all' } }
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function buildDebtAdjustmentLedger({ allocation = {}, order = {}, currentArBalance = 0, expectedDebtAmount = 0, diff = null, deltaDebt = null } = {}, options = {}) {
  const resolvedDeltaDebt = money(deltaDebt === null || deltaDebt === undefined
    ? (diff === null || diff === undefined
      ? money(expectedDebtAmount) - money(currentArBalance)
      : -money(diff))
    : deltaDebt);
  const amountDiff = money(currentArBalance) - money(expectedDebtAmount);
  const amount = Math.abs(resolvedDeltaDebt);
  if (amount <= 0) return null;
  const isDebit = resolvedDeltaDebt > 0;
  const now = options.now || dateUtil.nowIso();
  const orderCode = orderCodeOf(allocation, order);
  const orderId = orderIdOf(allocation, order);
  const customerCode = customerCodeOf(allocation, order);
  const sourceVersion = Number(allocation.sourceVersion || allocation.version || 1) || 1;
  const allocationRef = allocationIdentity(allocation);
  const idempotencyKey = clean(options.idempotencyKey || debtAdjustmentIdempotencyKey(allocation, expectedDebtAmount));
  const token = safeToken(`${orderCode || orderId}-${allocationRef}-${money(expectedDebtAmount)}-v${sourceVersion}`);
  const direction = isDebit ? 'debit' : 'credit';
  return {
    id: `AR-DEBT-ADJUSTMENT-DEBT-RECONCILE-${token}`,
    code: `AR-DEBT-ADJUSTMENT-${safeToken(orderCode || orderId)}-${safeToken(allocationRef)}-v${sourceVersion}`,
    idempotencyKey,
    date: dateUtil.toDateOnly(options.date || allocation.deliveryDate || order.deliveryDate || now),
    account: 'AR',
    category: 'AR-DEBT-ADJUSTMENT',
    ledgerType: 'AR-DEBT-ADJUSTMENT',
    entryType: 'normal',
    type: 'ar_debt_reconcile',
    source: clean(options.source || 'order_payment_debt_reconcile_service'),
    sourceType: clean(options.sourceType || allocation.sourceType || 'ORDER_PAYMENT_DEBT_RECONCILE'),
    sourceId: clean(options.sourceId || allocation.sourceId || allocationRef || orderId),
    sourceCode: clean(options.sourceCode || allocation.sourceCode || orderCode || allocationRef),
    sourceModel: clean(options.sourceModel || allocation.sourceModel || 'orderPaymentAllocations'),
    refType: clean(options.refType || allocation.refType || 'ORDER_PAYMENT_ALLOCATION'),
    refId: clean(options.refId || allocationRef),
    refCode: clean(options.refCode || allocation.allocationCode || orderCode || allocationRef),
    orderId,
    orderCode,
    salesOrderId: orderId,
    salesOrderCode: orderCode,
    customerCode,
    customerName: clean(allocation.customerName || order.customerName),
    salesStaffCode: clean(allocation.salesStaffCode || order.salesStaffCode || order.salesmanCode),
    salesStaffName: clean(allocation.salesStaffName || order.salesStaffName || order.salesmanName),
    salesmanCode: clean(allocation.salesStaffCode || order.salesmanCode || order.salesStaffCode),
    salesmanName: clean(allocation.salesStaffName || order.salesmanName || order.salesStaffName),
    deliveryStaffCode: clean(allocation.deliveryStaffCode || order.deliveryStaffCode || order.deliveryCode),
    deliveryStaffName: clean(allocation.deliveryStaffName || order.deliveryStaffName || order.deliveryName),
    deliveryDate: dateUtil.toDateOnly(allocation.deliveryDate || order.deliveryDate || now),
    debit: isDebit ? amount : 0,
    credit: isDebit ? 0 : amount,
    amount,
    direction,
    amountField: direction,
    active: true,
    reversed: false,
    status: 'posted',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingConfirmedBy: clean(options.actor || 'backfill-order-payment-allocations'),
    createdBy: clean(options.actor || 'backfill-order-payment-allocations'),
    createdAt: now,
    updatedAt: now,
    accountingBatchId: clean(options.accountingBatchId || `AR-DEBT-RECONCILE-${safeToken(orderCode || orderId)}-v${sourceVersion}`),
    allocationCode: clean(allocation.allocationCode),
    allocationId: clean(allocation.id || allocation._id || allocation.allocationCode),
    note: clean(options.note || `Đối chiếu công nợ theo orderPaymentAllocation ${orderCode}: current=${money(currentArBalance)}, expected=${money(expectedDebtAmount)}, diff=${amountDiff}`),
    reason: clean(options.reason || 'order payment debt reconcile'),
    metadata: {
      allocationCode: clean(allocation.allocationCode),
      allocationIdempotencyKey: clean(allocation.idempotencyKey),
      currentArBalance: money(currentArBalance),
      expectedDebtAmount: money(expectedDebtAmount),
      diff: amountDiff,
      deltaDebt: resolvedDeltaDebt,
      zeroTolerance: normalizeZeroTolerance(options.zeroTolerance, DEFAULT_ZERO_TOLERANCE),
      rawDebtAmount: money(options.rawDebtAmount),
      normalizedDebtAmount: money(expectedDebtAmount),
      zeroToleranceAdjustmentAmount: money(money(options.rawDebtAmount) - money(expectedDebtAmount)),
      reconcileSourceType: clean(options.sourceType || allocation.sourceType),
      reconcileSourceId: clean(options.sourceId || allocation.sourceId),
      reconcileSourceCode: clean(options.sourceCode || allocation.sourceCode)
    }
  };
}

function diagnosticFromReconcile({
  order = {},
  allocation = {},
  expected = {},
  balanceDetails = {},
  currentArBalance = 0,
  deltaDebt = 0,
  action = '',
  skipReason = '',
  idempotencyKey = '',
  suggestedFix = ''
} = {}) {
  const identity = balanceDetails.identity || resolveCanonicalArOrderIdentity({ order, allocation });
  return {
    orderCode: identity.orderCode || orderCodeOf(allocation, order),
    orderId: identity.orderId || orderIdOf(allocation, order),
    customerCode: customerCodeOf(allocation, order),
    customerName: clean(allocation.customerName || order.customerName),
    salesStaffCode: clean(allocation.salesStaffCode || order.salesStaffCode || order.salesmanCode),
    deliveryStaffCode: clean(allocation.deliveryStaffCode || order.deliveryStaffCode || order.deliveryCode),
    deliveryDate: dateUtil.toDateOnly(allocation.deliveryDate || order.deliveryDate || order.orderDate || order.date),
    lookupKeys: balanceDetails.lookupKeys || identity.lookupKeys || [],
    ignoredSourceAliases: balanceDetails.ignoredSourceAliases || identity.ignoredSourceAliases || [],
    sourceAliasesMatchingBusinessIdentity: balanceDetails.sourceAliasesMatchingBusinessIdentity || identity.sourceAliasesMatchingBusinessIdentity || [],
    rawMatchedLedgerCount: Number(balanceDetails.rawMatchedLedgerCount || 0),
    rawActiveConfirmedLedgerCount: Number(balanceDetails.rawActiveConfirmedLedgerCount || 0),
    canonicalMatchedLedgerCount: Number(balanceDetails.canonicalMatchedLedgerCount || 0),
    excludedLedgerCount: Number(balanceDetails.excludedLedgerCount || 0),
    excludedLedgers: (balanceDetails.excludedLedgers || []).map((row) => ({
      ledgerId: clean(row.ledgerId),
      category: clean(row.category),
      sourceType: clean(row.sourceType),
      exclusionReason: clean(row.exclusionReason),
      exclusionReasons: Array.isArray(row.exclusionReasons) ? row.exclusionReasons : []
    })),
    receivableAmount: money(allocation.receivableAmount),
    cashAmount: money(allocation.cashAmount),
    bankAmount: money(allocation.bankAmount),
    rewardAmount: money(allocation.rewardAmount),
    returnAmount: money(allocation.returnAmount),
    expectedDebtAmount: money(expected.expectedDebtAmount),
    rawDebtAmount: money(expected.rawDebtAmount),
    normalizedDebtAmount: money(expected.normalizedDebtAmount ?? expected.expectedDebtAmount),
    debtAmount: money(expected.debtAmount ?? expected.expectedDebtAmount),
    zeroToleranceAdjustmentAmount: money(expected.zeroToleranceAdjustmentAmount),
    currentArBalance: money(currentArBalance),
    currentArBalanceBeforePosting: money(currentArBalance),
    deltaDebt: money(deltaDebt),
    diff: money(currentArBalance) - money(expected.expectedDebtAmount),
    action: clean(action),
    skipReason: clean(skipReason),
    idempotencyKey: clean(idempotencyKey),
    zeroTolerance: Number(expected.zeroTolerance || 0),
    zeroToleranceApplied: Boolean(expected.zeroToleranceApplied),
    sourceVersion: Number(allocation.sourceVersion || allocation.version || 0),
    suggestedFix: clean(suggestedFix)
  };
}

function emitReconcileDiagnostic(result = {}, logger) {
  if (typeof logger === 'function' && result && result.diagnostic) {
    try { logger(result.diagnostic); } catch (_) { /* diagnostics must never break accounting */ }
  }
  return result;
}

async function reconcileOneOrder({
  order = {},
  allocation = {},
  closeout = null,
  apply = false,
  session = null,
  zeroTolerance = DEFAULT_ZERO_TOLERANCE,
  actor = 'backfill-order-payment-allocations',
  sourceType = '',
  sourceId = '',
  sourceCode = '',
  sourceModel = '',
  refType = '',
  refId = '',
  refCode = '',
  idempotencyKey: forcedIdempotencyKey = '',
  note = '',
  reason = '',
  accountingBatchId = '',
  diagnosticLogger = null
} = {}) {
  closeoutQueryAudit.updateCardinality({ addDebtReconcile: 1 });
  const effectiveAllocation = allocation && Object.keys(allocation).length
    ? { ...allocation }
    : allocationFromCloseout(order, closeout || {}, { zeroTolerance, sourceType, sourceId, sourceCode });
  if (sourceType && !effectiveAllocation.sourceType) effectiveAllocation.sourceType = sourceType;
  if (sourceId && !effectiveAllocation.sourceId) effectiveAllocation.sourceId = sourceId;
  if (sourceCode && !effectiveAllocation.sourceCode) effectiveAllocation.sourceCode = sourceCode;

  const expected = closeout && !allocation
    ? computeExpectedDebtFromCloseout(closeout, { zeroTolerance })
    : computeExpectedDebtFromAllocation(effectiveAllocation, { zeroTolerance });
  const normalizedTolerance = normalizeZeroTolerance(zeroTolerance, DEFAULT_ZERO_TOLERANCE);
  const identityInput = { order, allocation: effectiveAllocation };
  let balanceDetails = await closeoutQueryAudit.withCloseoutAuditStage('order.debt.initialBalance', () => getCurrentOrderArBalanceDetails(
    identityInput,
    customerCodeOf(effectiveAllocation, order),
    { session }
  ));
  let currentArBalance = money(balanceDetails.currentArBalance);
  let deltaDebt = money(expected.expectedDebtAmount - currentArBalance);
  const idempotencyKey = clean(forcedIdempotencyKey || debtAdjustmentIdempotencyKey(effectiveAllocation, expected.expectedDebtAmount));
  const existing = await closeoutQueryAudit.withCloseoutAuditStage('order.debt.initialIdempotency', () => findActiveDebtAdjustmentByKey(idempotencyKey, { session }));

  const buildDiagnostic = (action, skipReason = '', suggestedFix = '') => diagnosticFromReconcile({
    order,
    allocation: effectiveAllocation,
    expected,
    balanceDetails,
    currentArBalance,
    deltaDebt,
    action,
    skipReason,
    idempotencyKey,
    suggestedFix
  });

  // Accounting safety guard: a positive expected debt must never be posted as
  // a full adjustment when the business order identity could not be resolved.
  // This protects against future identity-contract regressions even if the
  // category reader itself is otherwise healthy.
  if (!(balanceDetails.lookupKeys || []).length
    && money(expected.expectedDebtAmount) > normalizedTolerance) {
    return emitReconcileDiagnostic({
      needsAdjustment: false,
      manualReviewRequired: true,
      skipReason: 'CANONICAL_AR_ORDER_IDENTITY_UNRESOLVED',
      zeroToleranceApplied: expected.zeroToleranceApplied,
      currentArBalance,
      expectedDebtAmount: expected.expectedDebtAmount,
      deltaDebt,
      diff: -deltaDebt,
      action: 'manual-review',
      diagnostic: buildDiagnostic('manual-review', 'CANONICAL_AR_ORDER_IDENTITY_UNRESOLVED', 'Không dựng được orderId/orderCode canonical. Đã chặn post toàn bộ expected debt để tránh nhân đôi công nợ.')
    }, diagnosticLogger);
  }

  if (hasCanonicalLookupAnomaly(balanceDetails, expected.expectedDebtAmount, normalizedTolerance)) {
    return emitReconcileDiagnostic({
      needsAdjustment: false,
      manualReviewRequired: true,
      skipReason: 'CANONICAL_AR_LOOKUP_EXCLUDED_EXISTING_LEDGER',
      zeroToleranceApplied: expected.zeroToleranceApplied,
      currentArBalance,
      expectedDebtAmount: expected.expectedDebtAmount,
      deltaDebt,
      diff: -deltaDebt,
      action: 'manual-review',
      diagnostic: buildDiagnostic('manual-review', 'CANONICAL_AR_LOOKUP_EXCLUDED_EXISTING_LEDGER', 'Raw AR lookup thấy opening debit hợp lệ nhưng canonical lookup loại ledger. Không post full expected debt; cần sửa contract hoặc reversal/repost theo quy trình kế toán.')
    }, diagnosticLogger);
  }

  if (existing) {
    if (Math.abs(deltaDebt) <= normalizedTolerance) {
      return emitReconcileDiagnostic({
        needsAdjustment: false,
        skippedAlreadyReconciled: true,
        skipReason: 'IDEMPOTENCY_KEY_EXISTS_AND_BALANCE_OK',
        zeroToleranceApplied: expected.zeroToleranceApplied,
        currentArBalance,
        expectedDebtAmount: expected.expectedDebtAmount,
        deltaDebt,
        diff: -deltaDebt,
        action: 'skip',
        ledger: existing,
        diagnostic: buildDiagnostic('skip', 'IDEMPOTENCY_KEY_EXISTS_AND_BALANCE_OK', 'Đã có AR-DEBT-ADJUSTMENT idempotent và AR balance nằm trong tolerance.')
      }, diagnosticLogger);
    }
    return emitReconcileDiagnostic({
      needsAdjustment: false,
      manualReviewRequired: true,
      skipReason: 'IDEMPOTENCY_KEY_EXISTS_BUT_BALANCE_STILL_DIFF',
      zeroToleranceApplied: expected.zeroToleranceApplied,
      currentArBalance,
      expectedDebtAmount: expected.expectedDebtAmount,
      deltaDebt,
      diff: -deltaDebt,
      action: 'manual-review',
      ledger: existing,
      diagnostic: buildDiagnostic('manual-review', 'IDEMPOTENCY_KEY_EXISTS_BUT_BALANCE_STILL_DIFF', 'Đã tồn tại idempotencyKey AR-DEBT-ADJUSTMENT nhưng AR balance vẫn lệch. Cần kiểm tra ledger trùng/sai hoặc reverse/repost theo quy trình kế toán.')
    }, diagnosticLogger);
  }

  if (Math.abs(deltaDebt) <= normalizedTolerance) {
    return emitReconcileDiagnostic({
      needsAdjustment: false,
      skippedAlreadyFixed: true,
      skipped: true,
      skipReason: 'NO_DEBT_DELTA',
      zeroToleranceApplied: expected.zeroToleranceApplied,
      currentArBalance,
      expectedDebtAmount: expected.expectedDebtAmount,
      deltaDebt,
      diff: -deltaDebt,
      action: 'skip',
      diagnostic: buildDiagnostic('skip', 'NO_DEBT_DELTA', 'Canonical AR balance đã khớp expectedDebtAmount trong Debt Zero Tolerance.')
    }, diagnosticLogger);
  }

  const actionForDelta = () => (deltaDebt > 0 ? 'create-debit' : 'create-credit');
  if (!apply) {
    const ledger = buildDebtAdjustmentLedger({
      allocation: effectiveAllocation,
      order,
      currentArBalance,
      expectedDebtAmount: expected.expectedDebtAmount,
      deltaDebt
    }, { zeroTolerance: normalizedTolerance, actor, rawDebtAmount: expected.rawDebtAmount, session, sourceType, sourceId, sourceCode, sourceModel, refType, refId, refCode, note, reason, accountingBatchId, idempotencyKey });
    const action = actionForDelta();
    return emitReconcileDiagnostic({
      needsAdjustment: true,
      dryRun: true,
      zeroToleranceApplied: expected.zeroToleranceApplied,
      currentArBalance,
      expectedDebtAmount: expected.expectedDebtAmount,
      deltaDebt,
      diff: -deltaDebt,
      action,
      ledger,
      diagnostic: buildDiagnostic(action, '', `${action === 'create-credit' ? 'Tạo credit' : 'Tạo debit'} AR-DEBT-ADJUSTMENT delta ${Math.abs(deltaDebt)}.`)
    }, diagnosticLogger);
  }

  // Accounting safety guard: re-read in the same Mongo session immediately
  // before posting so a stale preflight cannot create a full target-debt entry.
  balanceDetails = await closeoutQueryAudit.withCloseoutAuditStage('order.debt.safetyBalance', () => getCurrentOrderArBalanceDetails(
    identityInput,
    customerCodeOf(effectiveAllocation, order),
    { session }
  ));
  currentArBalance = money(balanceDetails.currentArBalance);
  deltaDebt = money(expected.expectedDebtAmount - currentArBalance);

  if (hasCanonicalLookupAnomaly(balanceDetails, expected.expectedDebtAmount, normalizedTolerance)) {
    return emitReconcileDiagnostic({
      needsAdjustment: false,
      manualReviewRequired: true,
      skipReason: 'CANONICAL_AR_LOOKUP_EXCLUDED_EXISTING_LEDGER',
      zeroToleranceApplied: expected.zeroToleranceApplied,
      currentArBalance,
      expectedDebtAmount: expected.expectedDebtAmount,
      deltaDebt,
      diff: -deltaDebt,
      action: 'manual-review',
      diagnostic: buildDiagnostic('manual-review', 'CANONICAL_AR_LOOKUP_EXCLUDED_EXISTING_LEDGER', 'Safety re-read thấy opening debit bị canonical policy loại. Đã chặn post AR-DEBT-ADJUSTMENT.')
    }, diagnosticLogger);
  }

  if (Math.abs(deltaDebt) <= normalizedTolerance) {
    return emitReconcileDiagnostic({
      needsAdjustment: false,
      skippedAlreadyFixed: true,
      skipped: true,
      skipReason: 'NO_DEBT_DELTA',
      zeroToleranceApplied: expected.zeroToleranceApplied,
      currentArBalance,
      expectedDebtAmount: expected.expectedDebtAmount,
      deltaDebt,
      diff: -deltaDebt,
      action: 'skip',
      diagnostic: buildDiagnostic('skip', 'NO_DEBT_DELTA', 'Safety re-read xác nhận canonical AR balance đã khớp expectedDebtAmount.')
    }, diagnosticLogger);
  }

  const existingBeforePost = await closeoutQueryAudit.withCloseoutAuditStage('order.debt.prePostIdempotency', () => findActiveDebtAdjustmentByKey(idempotencyKey, { session }));
  if (existingBeforePost) {
    return emitReconcileDiagnostic({
      needsAdjustment: false,
      manualReviewRequired: true,
      skipReason: 'IDEMPOTENCY_KEY_APPEARED_BEFORE_POST',
      currentArBalance,
      expectedDebtAmount: expected.expectedDebtAmount,
      deltaDebt,
      diff: -deltaDebt,
      action: 'manual-review',
      ledger: existingBeforePost,
      diagnostic: buildDiagnostic('manual-review', 'IDEMPOTENCY_KEY_APPEARED_BEFORE_POST', 'Một reconcile khác đã tạo cùng idempotencyKey trong lúc xử lý. Không post thêm ledger.')
    }, diagnosticLogger);
  }

  const ledger = buildDebtAdjustmentLedger({
    allocation: effectiveAllocation,
    order,
    currentArBalance,
    expectedDebtAmount: expected.expectedDebtAmount,
    deltaDebt
  }, { zeroTolerance: normalizedTolerance, actor, rawDebtAmount: expected.rawDebtAmount, session, sourceType, sourceId, sourceCode, sourceModel, refType, refId, refCode, note, reason, accountingBatchId, idempotencyKey });
  const action = actionForDelta();
  const saved = await closeoutQueryAudit.withCloseoutAuditStage('order.debt.adjustmentPost', () => arPostingService.postArLedgerEntry(ledger, { session, actor }));
  const afterDetails = await closeoutQueryAudit.withCloseoutAuditStage('order.debt.afterBalance', () => getCurrentOrderArBalanceDetails(
    identityInput,
    customerCodeOf(effectiveAllocation, order),
    { session }
  ));
  const afterBalance = money(afterDetails.currentArBalance);
  return emitReconcileDiagnostic({
    needsAdjustment: true,
    posted: true,
    zeroToleranceApplied: expected.zeroToleranceApplied,
    currentArBalance,
    afterBalance,
    expectedDebtAmount: expected.expectedDebtAmount,
    deltaDebt,
    diff: -deltaDebt,
    action,
    ledger: saved || ledger,
    diagnostic: buildDiagnostic(action, '', `Đã tạo AR-DEBT-ADJUSTMENT ${action === 'create-credit' ? 'credit' : 'debit'} delta ${Math.abs(deltaDebt)}.`)
  }, diagnosticLogger);
}

async function reconcileManyOrders(filters = {}, options = {}) {
  const results = [];
  for (const item of Array.isArray(filters.orders) ? filters.orders : []) {
    results.push(await reconcileOneOrder({ ...item, ...options }));
  }
  return results;
}

async function reconcileOrderDebt(input = {}) {
  return reconcileOneOrder(input);
}

module.exports = {
  DEFAULT_ZERO_TOLERANCE,
  computeExpectedDebtFromAllocation,
  computeExpectedDebtFromCloseout,
  getCurrentOrderArBalance,
  getCurrentOrderArBalanceDetails,
  buildDebtAdjustmentLedger,
  reconcileOneOrder,
  reconcileOrderDebt,
  reconcileManyOrders,
  debtAdjustmentIdempotencyKey,
  findActiveDebtAdjustmentByKey,
  _internal: {
    clean,
    money,
    safeToken,
    activeArFilter,
    buildArOrderMatch,
    orderLedgerKeys,
    sumCanonicalArBalance,
    excludedOpeningDebit,
    hasCanonicalLookupAnomaly,
    resolveCanonicalArOrderIdentity,
    buildCanonicalArOrderLookupKeys,
    allocationFromCloseout,
    diagnosticFromReconcile,
    orderCodeOf,
    customerCodeOf
  }
};
