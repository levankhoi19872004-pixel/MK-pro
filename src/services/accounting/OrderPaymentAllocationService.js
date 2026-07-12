'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const OrderPaymentAllocation = require('../../models/OrderPaymentAllocation');
const paymentRepository = require('../../repositories/paymentRepository');
const arPostingService = require('../arPosting.service');
const fundService = require('../fundService');
const DeliveryCloseoutService = require('./DeliveryCloseoutService');
const closeoutQueryAudit = require('../../observability/closeoutQueryAudit');

const ACTIVE_LEDGER_STATUSES = ['void', 'voided', 'cancelled', 'canceled', 'deleted', 'reversed'];
const DEFAULT_ZERO_TOLERANCE = 1000;
const NON_NEGATIVE_AMOUNT_FIELDS = ['receivableAmount', 'cashAmount', 'bankAmount', 'rewardAmount', 'returnAmount'];
const DEBT_AMOUNT_FIELDS = ['rawDebtAmount', 'normalizedDebtAmount', 'debtAmount', 'zeroToleranceAdjustmentAmount'];


const CLOSEOUT_CASH_FIELDS = ['cashAmount', 'cashCollectedAmount', 'cashReceivedAmount', 'paymentCashAmount', 'paidCashAmount', 'paidCash', 'collectedCash', 'deliveryCashAmount', 'collectedCashAmount', 'cashCollected', 'cash'];
const CLOSEOUT_BANK_FIELDS = ['bankAmount', 'transferAmount', 'bankTransferAmount', 'paymentTransferAmount', 'paymentBankAmount', 'paidBankAmount', 'paidTransferAmount', 'collectedBankAmount', 'deliveryBankAmount', 'bankCollectedAmount', 'collectedTransferAmount', 'collectedTransfer', 'transferCollected', 'bankCollected', 'bank'];
const CLOSEOUT_REWARD_FIELDS = ['offsetAmount', 'rewardAmount', 'bonusAmount', 'allowanceAmount', 'promotionRewardAmount', 'displayRewardAmount', 'bonusReturnAmount', 'rewardOffsetAmount', 'promotionOffsetAmount', 'debtOffsetAmount', 'deliveryOffsetAmount', 'otherOffsetAmount'];
const CLOSEOUT_RETURN_FIELDS = ['returnedAmount', 'returnAmount', 'returnOrderAmount', 'actualReturnAmount', 'returnAmountFromReturnOrders', 'syncedReturnAmountFromReturnOrders'];
const CLOSEOUT_RECEIVABLE_FIELDS = ['originalAmount', 'receivableAmount', 'totalAmount', 'finalAmount', 'payableAmount', 'debtBeforeCollection'];
const CLOSEOUT_DEBT_FIELDS = ['finalDebtAmount', 'debtAmount', 'remainingDebt', 'remainingDebtAmount', 'debt', 'arBalance'];

function hasOwnMoneyValue(source = {}, field = '') {
  return Object.prototype.hasOwnProperty.call(source || {}, field)
    && source[field] !== undefined
    && source[field] !== null
    && String(source[field]).trim() !== '';
}

function pickFirstPositiveMoney(sources = [], fields = []) {
  for (const source of Array.isArray(sources) ? sources : []) {
    if (!source || typeof source !== 'object') continue;
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
      const amount = positiveMoney(source[field]);
      if (amount > 0) return amount;
    }
  }
  return 0;
}

function pickAuthoritativeMoney(sources = [], fields = [], fallback = 0) {
  for (const source of Array.isArray(sources) ? sources : []) {
    if (!source || typeof source !== 'object') continue;
    for (const field of fields) {
      if (!hasOwnMoneyValue(source, field)) continue;
      const amount = money(source[field]);
      if (Number.isFinite(amount)) return amount;
    }
  }
  return money(fallback);
}

function hasAuthoritativeMoney(sources = [], fields = []) {
  for (const source of Array.isArray(sources) ? sources : []) {
    if (!source || typeof source !== 'object') continue;
    for (const field of fields) {
      if (!hasOwnMoneyValue(source, field)) continue;
      const amount = money(source[field]);
      if (Number.isFinite(amount)) return true;
    }
  }
  return false;
}

function pickFirstFiniteMoney(sources = [], fields = []) {
  for (const source of Array.isArray(sources) ? sources : []) {
    if (!source || typeof source !== 'object') continue;
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
      const amount = money(source[field]);
      if (Number.isFinite(amount)) return amount;
    }
  }
  return null;
}

function clean(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const amount = Number(toNumber(value));
  if (!Number.isFinite(amount)) return NaN;
  return Math.round(amount);
}

function positiveMoney(value) {
  const amount = money(value);
  if (!Number.isFinite(amount)) return NaN;
  return Math.max(0, amount);
}

function normalizeZeroTolerance(value, fallback = DEFAULT_ZERO_TOLERANCE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function normalizeDebtAmount(rawDebtAmount, zeroTolerance = DEFAULT_ZERO_TOLERANCE) {
  const raw = money(rawDebtAmount);
  const tolerance = normalizeZeroTolerance(zeroTolerance);
  if (Math.abs(raw) <= tolerance) return 0;
  return Math.max(0, raw);
}

function computeDebtBreakdown(amounts = {}, options = {}) {
  const zeroTolerance = normalizeZeroTolerance(options.zeroTolerance ?? options.tolerance ?? amounts.zeroTolerance, DEFAULT_ZERO_TOLERANCE);
  const rawDebtAmount = money(amounts.rawDebtAmount ?? (money(amounts.receivableAmount)
    - money(amounts.cashAmount)
    - money(amounts.bankAmount)
    - money(amounts.rewardAmount)
    - money(amounts.returnAmount)));
  const normalizedDebtAmount = money(amounts.normalizedDebtAmount ?? normalizeDebtAmount(rawDebtAmount, zeroTolerance));
  const debtAmount = money(amounts.debtAmount ?? normalizedDebtAmount);
  const zeroToleranceAdjustmentAmount = money(rawDebtAmount - normalizedDebtAmount);
  return {
    rawDebtAmount,
    normalizedDebtAmount,
    debtAmount,
    zeroTolerance,
    zeroToleranceApplied: rawDebtAmount !== normalizedDebtAmount,
    zeroToleranceAdjustmentAmount
  };
}

function orderId(order = {}) {
  return clean(DeliveryCloseoutService.orderId(order) || order.salesOrderId || order.orderId || order._id || order.id);
}

function orderCode(order = {}) {
  return clean(DeliveryCloseoutService.orderCode(order) || order.salesOrderCode || order.orderCode || order.documentCode || order.invoiceCode || order.code);
}

function orderSourceIdentity(order = {}) {
  return orderId(order) || orderCode(order);
}

function safeToken(value = '') {
  return clean(value).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'UNKNOWN';
}

function actorOf(options = {}, fallback = 'system') {
  const actor = options.actor || options.confirmedBy || options.createdBy || options.user || fallback;
  if (typeof actor === 'string') return clean(actor) || fallback;
  return clean(actor.code || actor.id || actor.name || actor.email || fallback) || fallback;
}

function allocationIdentity(order = {}, closeout = {}, options = {}) {
  const sourceId = clean(options.sourceId || orderSourceIdentity(order));
  const sourceCode = clean(options.sourceCode || orderCode(order) || sourceId);
  const sourceVersion = Number(options.sourceVersion || closeout.version || 1) || 1;
  const scopeHash = clean(options.closeoutScopeHash || closeout.closeoutScopeHash || closeout.scopeHash || 'noscope');
  const orderToken = safeToken(sourceCode || sourceId);
  return {
    sourceId,
    sourceCode,
    sourceVersion,
    allocationCode: clean(options.allocationCode || `OPA-${orderToken}-v${sourceVersion}`),
    idempotencyKey: clean(options.idempotencyKey || `OPA:${sourceId || sourceCode}:delivery_closeout:${scopeHash}:v${sourceVersion}`)
  };
}

function diagnosticPayload(allocation = {}, extra = {}) {
  return {
    orderCode: clean(allocation.orderCode),
    customerCode: clean(allocation.customerCode),
    receivableAmount: money(allocation.receivableAmount),
    cashAmount: money(allocation.cashAmount),
    bankAmount: money(allocation.bankAmount),
    rewardAmount: money(allocation.rewardAmount),
    returnAmount: money(allocation.returnAmount),
    rawDebtAmount: money(allocation.rawDebtAmount),
    normalizedDebtAmount: money(allocation.normalizedDebtAmount),
    debtAmount: money(allocation.debtAmount),
    zeroTolerance: Number(allocation.zeroTolerance || 0),
    zeroToleranceApplied: Boolean(allocation.zeroToleranceApplied),
    zeroToleranceAdjustmentAmount: money(allocation.zeroToleranceAdjustmentAmount),
    sourceId: clean(allocation.sourceId),
    sourceType: clean(allocation.sourceType),
    sourceVersion: Number(allocation.sourceVersion || 0),
    idempotencyKey: clean(allocation.idempotencyKey),
    ...extra
  };
}

function allocationError(code, message, allocation = {}, extra = {}) {
  const err = new Error(message);
  err.code = code;
  err.severity = 'P0';
  err.diagnostic = diagnosticPayload(allocation, extra);
  err.data = { diagnostic: err.diagnostic };
  return err;
}

function validateAllocation(allocation = {}, options = {}) {
  const zeroTolerance = normalizeZeroTolerance(options.zeroTolerance ?? options.tolerance ?? allocation.zeroTolerance, DEFAULT_ZERO_TOLERANCE);
  for (const field of NON_NEGATIVE_AMOUNT_FIELDS) {
    const value = money(allocation[field]);
    if (!Number.isFinite(value)) {
      throw allocationError('ORDER_PAYMENT_ALLOCATION_AMOUNT_INVALID', `orderPaymentAllocation field ${field} không phải số hợp lệ.`, allocation, { field, value: allocation[field] });
    }
    if (value < 0) {
      throw allocationError('ORDER_PAYMENT_ALLOCATION_AMOUNT_NEGATIVE', `orderPaymentAllocation field ${field} không được âm.`, allocation, { field, value });
    }
  }

  for (const field of DEBT_AMOUNT_FIELDS) {
    if (allocation[field] === undefined || allocation[field] === null || allocation[field] === '') continue;
    const value = money(allocation[field]);
    if (!Number.isFinite(value)) {
      throw allocationError('ORDER_PAYMENT_ALLOCATION_AMOUNT_INVALID', `orderPaymentAllocation field ${field} không phải số hợp lệ.`, allocation, { field, value: allocation[field] });
    }
  }

  const expectedBreakdown = computeDebtBreakdown(allocation, { zeroTolerance });
  const rawDebtAmount = money(allocation.rawDebtAmount ?? expectedBreakdown.rawDebtAmount);
  const normalizedDebtAmount = money(allocation.normalizedDebtAmount ?? expectedBreakdown.normalizedDebtAmount);
  const debtAmount = money(allocation.debtAmount);
  const zeroToleranceAdjustmentAmount = money(allocation.zeroToleranceAdjustmentAmount ?? (rawDebtAmount - normalizedDebtAmount));

  const rawDiff = money(money(allocation.receivableAmount)
    - money(allocation.cashAmount)
    - money(allocation.bankAmount)
    - money(allocation.rewardAmount)
    - money(allocation.returnAmount)
    - rawDebtAmount);
  if (rawDiff !== 0) {
    throw allocationError(
      'ORDER_PAYMENT_ALLOCATION_RAW_INVARIANT_FAILED',
      'Sai invariant phân bổ thô: receivableAmount phải bằng cashAmount + bankAmount + rewardAmount + returnAmount + rawDebtAmount.',
      allocation,
      { rawDebtAmount, normalizedDebtAmount, zeroTolerance, zeroToleranceAdjustmentAmount, diff: rawDiff }
    );
  }

  const normalizedDiff = money(debtAmount - normalizedDebtAmount);
  if (normalizedDiff !== 0) {
    throw allocationError(
      'ORDER_PAYMENT_ALLOCATION_NORMALIZED_DEBT_MISMATCH',
      'Sai nợ nghiệp vụ: debtAmount phải bằng normalizedDebtAmount sau Debt Zero Tolerance.',
      allocation,
      { rawDebtAmount, normalizedDebtAmount, debtAmount, zeroTolerance, zeroToleranceAdjustmentAmount, diff: normalizedDiff }
    );
  }

  const adjustmentDiff = money(zeroToleranceAdjustmentAmount - (rawDebtAmount - normalizedDebtAmount));
  if (adjustmentDiff !== 0) {
    throw allocationError(
      'ORDER_PAYMENT_ALLOCATION_ZERO_TOLERANCE_ADJUSTMENT_MISMATCH',
      'Sai phần điều chỉnh Debt Zero Tolerance: zeroToleranceAdjustmentAmount phải bằng rawDebtAmount - normalizedDebtAmount.',
      allocation,
      { rawDebtAmount, normalizedDebtAmount, debtAmount, zeroTolerance, zeroToleranceAdjustmentAmount, diff: adjustmentDiff }
    );
  }

  if (!clean(allocation.idempotencyKey)) {
    throw allocationError('ORDER_PAYMENT_ALLOCATION_MISSING_IDEMPOTENCY_KEY', 'Thiếu idempotencyKey cho orderPaymentAllocation.', allocation);
  }
  if (!clean(allocation.orderCode) && !clean(allocation.orderId)) {
    throw allocationError('ORDER_PAYMENT_ALLOCATION_MISSING_ORDER_IDENTITY', 'Thiếu orderId/orderCode cho orderPaymentAllocation.', allocation);
  }
  if (!clean(allocation.customerCode)) {
    throw allocationError('ORDER_PAYMENT_ALLOCATION_MISSING_CUSTOMER_CODE', 'Thiếu customerCode cho orderPaymentAllocation.', allocation);
  }
  return true;
}

function buildAllocationFromCloseout(order = {}, closeout = {}, options = {}) {
  const now = options.now || dateUtil.nowIso();
  const actor = actorOf(options, clean(closeout.confirmedBy || closeout.createdBy || 'accountant'));
  const identity = allocationIdentity(order, closeout, options);
  const sourceObjects = [closeout, order];
  const receivableAmount = pickAuthoritativeMoney(sourceObjects, CLOSEOUT_RECEIVABLE_FIELDS);
  let cashAmount = pickAuthoritativeMoney(sourceObjects, CLOSEOUT_CASH_FIELDS);
  const bankAmount = pickAuthoritativeMoney(sourceObjects, CLOSEOUT_BANK_FIELDS);
  const rewardAmount = pickAuthoritativeMoney(sourceObjects, CLOSEOUT_REWARD_FIELDS);
  const returnAmount = pickAuthoritativeMoney(sourceObjects, CLOSEOUT_RETURN_FIELDS);

  // Final-state closeout/version fields are authoritative even when the value is 0.
  // Only legacy closeouts that do not contain explicit cash/bank fields may fall back
  // to a collectedAmount-style aggregate. This prevents correction versions with
  // cashAmount: 0 / bankAmount: 0 from being overwritten by stale order values.
  const closeoutHasExplicitCashOrBank = hasAuthoritativeMoney([closeout], CLOSEOUT_CASH_FIELDS)
    || hasAuthoritativeMoney([closeout], CLOSEOUT_BANK_FIELDS);
  if (!closeoutHasExplicitCashOrBank && cashAmount <= 0 && bankAmount <= 0) {
    cashAmount = pickFirstPositiveMoney(sourceObjects, ['collectedAmount', 'paidAmount', 'paymentAmount', 'deliveryCollectedAmount']);
  }

  const rawDebtAmount = money(receivableAmount - cashAmount - bankAmount - rewardAmount - returnAmount);
  const zeroTolerance = normalizeZeroTolerance(options.zeroTolerance ?? options.tolerance ?? closeout.zeroTolerance, DEFAULT_ZERO_TOLERANCE);
  const normalizedDebtAmount = normalizeDebtAmount(rawDebtAmount, zeroTolerance);
  const debtAmount = normalizedDebtAmount;
  const zeroToleranceAdjustmentAmount = money(rawDebtAmount - normalizedDebtAmount);
  const zeroToleranceApplied = rawDebtAmount !== normalizedDebtAmount;
  const explicitDebtAmount = pickFirstFiniteMoney(sourceObjects, CLOSEOUT_DEBT_FIELDS);
  if (explicitDebtAmount !== null && Math.abs(money(explicitDebtAmount) - normalizedDebtAmount) > zeroTolerance) {
    const preview = {
      orderCode: orderCode(order) || identity.sourceCode,
      orderId: orderId(order) || identity.sourceId,
      customerCode: clean(order.customerCode || closeout.customerCode),
      sourceType: clean(options.sourceType || 'delivery_closeout'),
      sourceId: identity.sourceId,
      sourceVersion: identity.sourceVersion,
      receivableAmount,
      cashAmount,
      bankAmount,
      rewardAmount,
      returnAmount,
      rawDebtAmount,
      normalizedDebtAmount,
      debtAmount,
      zeroTolerance,
      zeroToleranceApplied,
      zeroToleranceAdjustmentAmount,
      idempotencyKey: identity.idempotencyKey
    };
    throw allocationError('ORDER_PAYMENT_ALLOCATION_EXPLICIT_DEBT_CONFLICT', 'finalDebtAmount/debtAmount trong closeout lệch với normalizedDebtAmount sau Debt Zero Tolerance.', preview, {
      explicitDebtAmount: money(explicitDebtAmount),
      diff: money(money(explicitDebtAmount) - normalizedDebtAmount)
    });
  }
  const allocation = {
    allocationCode: identity.allocationCode,
    orderId: orderId(order) || identity.sourceId,
    orderCode: orderCode(order) || identity.sourceCode,
    customerCode: clean(order.customerCode || closeout.customerCode),
    customerName: clean(order.customerName || closeout.customerName),
    salesStaffCode: clean(order.salesStaffCode || order.salesmanCode || order.nvbhCode),
    salesStaffName: clean(order.salesStaffName || order.salesmanName || order.nvbhName),
    deliveryStaffCode: clean(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
    deliveryStaffName: clean(order.deliveryStaffName || order.deliveryName || order.nvghName),
    deliveryDate: dateUtil.toDateOnly(options.date || order.deliveryDate || order.date || order.orderDate || closeout.deliveryDate || now),
    sourceType: clean(options.sourceType || 'delivery_closeout'),
    sourceId: identity.sourceId,
    sourceCode: identity.sourceCode,
    sourceVersion: identity.sourceVersion,
    receivableAmount,
    cashAmount,
    bankAmount,
    rewardAmount,
    returnAmount,
    rawDebtAmount,
    normalizedDebtAmount,
    debtAmount,
    zeroTolerance,
    zeroToleranceApplied,
    zeroToleranceAdjustmentAmount,
    status: clean(options.status || closeout.status || 'posted'),
    postedArLedgerIds: Array.isArray(options.postedArLedgerIds) ? options.postedArLedgerIds : [],
    postedFundLedgerIds: Array.isArray(options.postedFundLedgerIds) ? options.postedFundLedgerIds : [],
    idempotencyKey: identity.idempotencyKey,
    closeoutScopeHash: clean(options.closeoutScopeHash || closeout.closeoutScopeHash || closeout.scopeHash),
    closeoutScope: clean(options.closeoutScope || closeout.closeoutScope || 'selected_orders'),
    calculationHash: clean(closeout.calculationHash),
    sourceHash: clean(closeout.sourceHash),
    metadata: {
      ...(options.metadata && typeof options.metadata === 'object' ? options.metadata : {}),
      source: 'salesOrders.deliveryCloseout',
      invariant: 'raw: receivableAmount = cashAmount + bankAmount + rewardAmount + returnAmount + rawDebtAmount; business: debtAmount = normalizedDebtAmount',
      rawDebtAmount,
      normalizedDebtAmount,
      zeroTolerance,
      zeroToleranceApplied,
      zeroToleranceAdjustmentAmount
    },
    createdBy: actor,
    updatedBy: actor,
    createdAt: now,
    updatedAt: now
  };
  validateAllocation(allocation, options);
  return allocation;
}

async function upsertAllocation(allocation = {}, options = {}) {
  validateAllocation(allocation, options);
  const now = options.now || dateUtil.nowIso();
  const actor = actorOf(options, allocation.updatedBy || allocation.createdBy || 'system');
  const { createdAt, createdBy, _id, __v, ...businessFields } = allocation || {};
  const update = {
    ...businessFields,
    updatedAt: now,
    updatedBy: actor
  };
  const insertOnly = {
    createdAt: createdAt || now,
    createdBy: createdBy || actor
  };
  // MongoDB rejects the same path being present in $set and $setOnInsert.
  // Keep immutable audit fields insert-only and update mutable audit fields with updated*.
  delete update.createdAt;
  delete update.createdBy;
  const query = OrderPaymentAllocation.findOneAndUpdate(
    { idempotencyKey: allocation.idempotencyKey },
    { $set: update, $setOnInsert: insertOnly },
    { upsert: true, new: true, setDefaultsOnInsert: true, session: options.session }
  );
  return closeoutQueryAudit.withCloseoutAuditStage('order.allocation.upsert', () => (query.lean ? query.lean() : query));
}

async function findActiveArByIdempotency(idempotencyKey, options = {}) {
  const key = clean(idempotencyKey);
  if (!key) return null;
  if (options.existingArLedgerByIdempotencyKey instanceof Map) {
    return options.existingArLedgerByIdempotencyKey.get(key) || null;
  }
  const rows = await paymentRepository.findAll({
    idempotencyKey: key,
    active: { $ne: false },
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    status: { $nin: ACTIVE_LEDGER_STATUSES }
  }, { ...options, limit: 2 });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function baseArLedger(allocation = {}, extra = {}, options = {}) {
  const now = options.now || dateUtil.nowIso();
  const actor = actorOf(options, allocation.postedBy || allocation.updatedBy || allocation.createdBy || 'accountant');
  const orderIdentity = clean(allocation.orderId || allocation.orderCode || allocation.sourceId || allocation.sourceCode);
  const orderCodeValue = clean(allocation.orderCode || allocation.sourceCode || orderIdentity);
  const category = clean(extra.category).toUpperCase();
  const amount = positiveMoney(extra.amount);
  const isDebit = clean(extra.direction).toLowerCase() === 'debit';
  const batchId = clean(options.accountingBatchId || allocation.accountingBatchId || `OPA-AR-${safeToken(allocation.allocationCode || allocation.idempotencyKey)}`);
  return {
    id: clean(extra.id),
    code: clean(extra.code || extra.id),
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    type: clean(extra.type),
    sourceType: 'ORDER_PAYMENT_ALLOCATION',
    sourceId: orderIdentity,
    sourceCode: orderCodeValue,
    refType: 'ORDER_PAYMENT_ALLOCATION',
    refId: clean(allocation.allocationCode || allocation.idempotencyKey),
    refCode: clean(allocation.allocationCode || orderCodeValue),
    orderId: clean(allocation.orderId || orderIdentity),
    orderCode: orderCodeValue,
    salesOrderId: clean(allocation.orderId || orderIdentity),
    salesOrderCode: orderCodeValue,
    customerCode: clean(allocation.customerCode),
    customerName: clean(allocation.customerName),
    salesStaffCode: clean(allocation.salesStaffCode),
    salesStaffName: clean(allocation.salesStaffName),
    salesmanCode: clean(allocation.salesStaffCode),
    salesmanName: clean(allocation.salesStaffName),
    deliveryStaffCode: clean(allocation.deliveryStaffCode),
    deliveryStaffName: clean(allocation.deliveryStaffName),
    deliveryDate: dateUtil.toDateOnly(allocation.deliveryDate || now),
    date: dateUtil.toDateOnly(allocation.deliveryDate || now),
    debit: isDebit ? amount : 0,
    credit: isDebit ? 0 : amount,
    amount,
    direction: isDebit ? 'debit' : 'credit',
    amountField: isDebit ? 'debit' : 'credit',
    active: true,
    reversed: false,
    status: 'posted',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingConfirmedBy: actor,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
    source: 'order_payment_allocation_service',
    accountingBatchId: batchId,
    idempotencyKey: clean(extra.idempotencyKey),
    allocationCode: clean(allocation.allocationCode),
    allocationId: clean(allocation.id || allocation._id || allocation.allocationCode),
    closeoutScopeHash: clean(allocation.closeoutScopeHash),
    note: clean(extra.note),
    method: clean(extra.method),
    paymentMethod: clean(extra.method),
    metadata: {
      allocationCode: clean(allocation.allocationCode),
      allocationIdempotencyKey: clean(allocation.idempotencyKey),
      rawDebtAmount: money(allocation.rawDebtAmount),
      normalizedDebtAmount: money(allocation.normalizedDebtAmount ?? allocation.debtAmount),
      invariantDebtAmount: money(allocation.debtAmount),
      zeroTolerance: Number(allocation.zeroTolerance || DEFAULT_ZERO_TOLERANCE),
      zeroToleranceApplied: Boolean(allocation.zeroToleranceApplied),
      zeroToleranceAdjustmentAmount: money(allocation.zeroToleranceAdjustmentAmount)
    }
  };
}

function buildArLedgerRows(allocation = {}, options = {}) {
  validateAllocation(allocation, options);
  const token = safeToken(allocation.allocationCode || allocation.idempotencyKey || allocation.orderCode || allocation.orderId);
  const prefix = `OPA:${allocation.idempotencyKey}`;
  const rows = [];
  const push = (suffix, amount, direction, category, type, note, method = '') => {
    const normalized = positiveMoney(amount);
    if (normalized <= 0) return;
    rows.push(baseArLedger(allocation, {
      id: `${category}-${token}`,
      code: `${category}-${safeToken(allocation.orderCode || token)}`,
      idempotencyKey: `${prefix}:${suffix}`,
      amount: normalized,
      direction,
      category,
      type,
      method,
      note
    }, options));
  };
  push('AR-SALE', allocation.receivableAmount, 'debit', 'AR-SALE', 'ar_sale', `Ghi nhận phải thu đơn ${allocation.orderCode}`);
  push('AR-RECEIPT-CASH', allocation.cashAmount, 'credit', 'AR-RECEIPT-CASH', 'ar_receipt_cash', `Ghi nhận tiền mặt đơn ${allocation.orderCode}`, 'cash');
  push('AR-RECEIPT-BANK', allocation.bankAmount, 'credit', 'AR-RECEIPT-BANK', 'ar_receipt_bank', `Ghi nhận chuyển khoản đơn ${allocation.orderCode}`, 'transfer');
  push('AR-REWARD-ALLOWANCE', allocation.rewardAmount, 'credit', 'AR-REWARD-ALLOWANCE', 'ar_reward_allowance', `Cấn trừ công nợ trả thưởng đơn ${allocation.orderCode}`);
  push('AR-RETURN', allocation.returnAmount, 'credit', 'AR-RETURN', 'ar_return', `Cấn trừ công nợ hàng trả đơn ${allocation.orderCode}`);
  return rows;
}

async function postArLedgersFromAllocation(allocation = {}, options = {}) {
  const rows = closeoutQueryAudit.withCloseoutAuditStage('order.ar.buildRows', () => buildArLedgerRows(allocation, options));
  closeoutQueryAudit.updateCardinality({ addGeneratedArRows: rows.length });
  const posted = [];
  const postingResults = [];
  for (const row of rows) {
    const existed = await closeoutQueryAudit.withCloseoutAuditStage('order.ar.idempotency', () => findActiveArByIdempotency(row.idempotencyKey, options));
    if (existed) {
      if (money(existed.debit) !== money(row.debit) || money(existed.credit) !== money(row.credit)) {
        throw allocationError('ORDER_PAYMENT_ALLOCATION_AR_LEDGER_CONFLICT', 'AR ledger từ orderPaymentAllocation đã tồn tại nhưng khác số tiền.', allocation, {
          ledgerId: clean(existed.id || existed.code || existed._id),
          idempotencyKey: row.idempotencyKey,
          existingDebit: money(existed.debit),
          existingCredit: money(existed.credit),
          expectedDebit: money(row.debit),
          expectedCredit: money(row.credit)
        });
      }
      posted.push(existed);
      postingResults.push({
        idempotencyKey: row.idempotencyKey,
        category: row.category,
        created: false,
        alreadyExists: true,
        reasonCode: 'ALREADY_EXISTS',
        entry: existed
      });
      continue;
    }
    const saved = await closeoutQueryAudit.withCloseoutAuditStage('order.ar.post', () => arPostingService.postArLedgerEntry(row, options));
    const entry = saved || row;
    posted.push(entry);
    postingResults.push({
      idempotencyKey: row.idempotencyKey,
      category: row.category,
      created: true,
      alreadyExists: false,
      reasonCode: 'POSTED',
      entry
    });
  }
  posted.postingResults = postingResults;
  posted.expectedArLedgers = rows;
  return posted;
}

async function postFundLedgersFromAllocation(allocation = {}, options = {}) {
  const posted = [];
  const postOne = async (fundType, amount) => {
    const normalized = positiveMoney(amount);
    if (normalized <= 0) return;
    closeoutQueryAudit.updateCardinality({ addFundPath: 1 });
    const stageName = fundType === 'bank' ? 'order.fund.bank.post' : 'order.fund.cash.post';
    const result = await closeoutQueryAudit.withCloseoutAuditStage(stageName, () => fundService.postFundLedger({
      date: allocation.deliveryDate || dateUtil.todayVN(),
      fundType,
      direction: 'in',
      account: fundType === 'bank' ? 'BANK' : 'CASH',
      amount: normalized,
      sourceType: 'ORDER_PAYMENT_ALLOCATION',
      sourceId: clean(allocation.allocationCode || allocation.idempotencyKey),
      sourceCode: clean(allocation.allocationCode || allocation.orderCode),
      refType: 'SALES_ORDER',
      refId: clean(allocation.orderId || allocation.sourceId),
      refCode: clean(allocation.orderCode || allocation.sourceCode),
      referenceType: 'ORDER_PAYMENT_ALLOCATION',
      referenceId: clean(allocation.allocationCode || allocation.idempotencyKey),
      referenceCode: clean(allocation.allocationCode || allocation.orderCode),
      deliveryDate: allocation.deliveryDate,
      deliveryStaffCode: allocation.deliveryStaffCode,
      deliveryStaffName: allocation.deliveryStaffName,
      salesStaffCode: allocation.salesStaffCode,
      salesStaffName: allocation.salesStaffName,
      customerCode: allocation.customerCode,
      customerName: allocation.customerName,
      createdBy: actorOf(options, allocation.updatedBy || allocation.createdBy || 'accountant'),
      idempotencyKey: `FUND:OPA:${allocation.idempotencyKey}:${fundType}`,
      note: `${fundType === 'bank' ? 'Chuyển khoản' : 'Tiền mặt'} từ phân bổ thanh toán đơn ${allocation.orderCode}`
    }, options));
    posted.push(result && result.ledger ? result.ledger : result);
  };
  await postOne('cash', allocation.cashAmount);
  await postOne('bank', allocation.bankAmount);
  return posted.filter(Boolean);
}

async function updatePostedRefs(allocation = {}, arLedgers = [], fundLedgers = [], options = {}) {
  const idempotencyKey = clean(allocation.idempotencyKey);
  if (!idempotencyKey) return allocation;
  const postedArLedgerIds = Array.from(new Set((arLedgers || []).map((row) => clean(row.id || row.code || row._id)).filter(Boolean)));
  const postedFundLedgerIds = Array.from(new Set((fundLedgers || []).map((row) => clean(row.id || row.code || row._id)).filter(Boolean)));
  const now = options.now || dateUtil.nowIso();
  const query = OrderPaymentAllocation.findOneAndUpdate(
    { idempotencyKey },
    {
      $set: {
        postedArLedgerIds,
        postedFundLedgerIds,
        status: 'posted',
        postedAt: now,
        postedBy: actorOf(options, allocation.updatedBy || allocation.createdBy || 'accountant'),
        updatedAt: now
      }
    },
    { new: true, session: options.session }
  );
  return closeoutQueryAudit.withCloseoutAuditStage('order.allocation.updatePostedRefs', () => (query.lean ? query.lean() : query));
}

async function postAllocation(allocation = {}, options = {}) {
  const saved = await upsertAllocation({ ...allocation, status: 'posted' }, options);
  const arLedgers = await postArLedgersFromAllocation(saved, options);
  const fundLedgers = await postFundLedgersFromAllocation(saved, options);
  const updated = await updatePostedRefs(saved, arLedgers, fundLedgers, options);
  return {
    allocation: updated || saved,
    arLedgers,
    fundLedgers,
    arPostingResults: arLedgers.postingResults || [],
    expectedArLedgers: arLedgers.expectedArLedgers || []
  };
}

async function buildAndPostFromCloseout(order = {}, closeout = {}, options = {}) {
  const allocation = closeoutQueryAudit.withCloseoutAuditStage('order.allocation.build', () => buildAllocationFromCloseout(order, closeout, options));
  return postAllocation(allocation, options);
}

function allocationOrderKeys(allocation = {}) {
  return Array.from(new Set([
    allocation.orderId,
    allocation.orderCode,
    allocation.sourceId,
    allocation.sourceCode
  ].map(clean).filter(Boolean)));
}

async function findLatestAllocationsForOrderKeys(keys = [], options = {}) {
  const values = Array.from(new Set((Array.isArray(keys) ? keys : []).map(clean).filter(Boolean)));
  if (!values.length) return [];
  const filter = {
    status: { $nin: ['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted'] },
    $or: [
      { orderId: { $in: values } },
      { orderCode: { $in: values } },
      { sourceId: { $in: values } },
      { sourceCode: { $in: values } }
    ]
  };
  const query = OrderPaymentAllocation.find(filter).sort({ sourceVersion: -1, postedAt: -1, updatedAt: -1, createdAt: -1 }).limit(Math.max(1, Math.min(5000, Number(options.limit || 5000))));
  if (options.session && typeof query.session === 'function') query.session(options.session);
  if (typeof query.lean === 'function') query.lean();
  return query;
}

function buildAllocationLookup(allocations = []) {
  const lookup = new Map();
  for (const allocation of Array.isArray(allocations) ? allocations : []) {
    for (const key of allocationOrderKeys(allocation)) {
      if (!lookup.has(key)) lookup.set(key, allocation);
    }
  }
  return lookup;
}

module.exports = {
  DEFAULT_ZERO_TOLERANCE,
  normalizeDebtAmount,
  computeDebtBreakdown,
  buildAllocationFromCloseout,
  validateAllocation,
  upsertAllocation,
  buildArLedgerRows,
  postArLedgersFromAllocation,
  postFundLedgersFromAllocation,
  postAllocation,
  buildAndPostFromCloseout,
  findLatestAllocationsForOrderKeys,
  buildAllocationLookup,
  allocationOrderKeys,
  _internal: {
    money,
    positiveMoney,
    normalizeZeroTolerance,
    normalizeDebtAmount,
    computeDebtBreakdown,
    diagnosticPayload,
    allocationError,
    allocationIdentity,
    safeToken,
    pickFirstPositiveMoney,
    pickAuthoritativeMoney,
    hasAuthoritativeMoney,
    pickFirstFiniteMoney,
    baseArLedger,
    findActiveArByIdempotency
  }
};
