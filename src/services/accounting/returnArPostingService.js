'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
function paymentRepository() {
  return require('../../repositories/paymentRepository');
}
function returnOrderRepository() {
return require('../../repositories/returnOrderRepository');
}
function auditService() {
return require('../auditService');
}
const {
  pickSalesStaffCode,
  pickSalesStaffName,
  pickDeliveryStaffCode,
  pickDeliveryStaffName
} = require('../../domain/staff/staffIdentity');

const AR_RETURN_TYPE = 'ar_return';
const AR_RETURN_LEDGER_TYPE = 'AR-RETURN';
const RETURN_ORDER_SOURCE_TYPE = 'returnOrder';
const RETURN_ORDER_SOURCE_MODEL = 'returnOrders';
const INACTIVE_STATUSES = Object.freeze([
  'cancelled',
  'canceled',
  'void',
  'deleted',
  'removed',
  'duplicate_cancelled',
  'cleared'
]);
const CONFIRMED_ACCOUNTING_STATUSES = Object.freeze(['confirmed', 'locked', 'posted', 'accounting_confirmed']);

function cleanString(value = '') {
  return String(value || '').trim();
}

function lower(value = '') {
  return cleanString(value).toLowerCase();
}

function uniqueNonEmpty(values = []) {
  return [...new Set((values || []).map(cleanString).filter(Boolean))];
}

function normalizeAmount(value) {
  return Math.max(0, Math.round(toNumber(value)));
}

function resolveReturnOrderKey(returnOrder = {}) {
  return cleanString(
    returnOrder.returnOrderCode
    || returnOrder.code
    || returnOrder.returnOrderId
    || returnOrder.id
    || returnOrder._id
    || returnOrder.sourceCode
    || returnOrder.sourceId
  );
}

function returnOrderIdentityKeys(returnOrder = {}) {
  return uniqueNonEmpty([
    returnOrder.id,
    returnOrder._id,
    returnOrder.code,
    returnOrder.returnOrderId,
    returnOrder.returnOrderCode,
    returnOrder.sourceId,
    returnOrder.sourceCode
  ]);
}

function salesOrderIdentityKeys(returnOrder = {}) {
  return uniqueNonEmpty([
    returnOrder.salesOrderId,
    returnOrder.salesOrderCode,
    returnOrder.orderId,
    returnOrder.orderCode,
    returnOrder.sourceOrderId,
    returnOrder.sourceOrderCode,
    returnOrder.deliveryOrderId,
    returnOrder.deliveryOrderCode,
    returnOrder.refId,
    returnOrder.refCode
  ]);
}

function isInactiveReturnOrder(returnOrder = {}) {
  const statuses = [
    returnOrder.status,
    returnOrder.returnStatus,
    returnOrder.returnState,
    returnOrder.accountingStatus,
    returnOrder.warehouseReceiveStatus,
    returnOrder.receiveStatus
  ].map(lower).filter(Boolean);
  return Boolean(returnOrder.deletedAt || returnOrder.cancelledAt || returnOrder.isDeleted)
    || statuses.some((status) => INACTIVE_STATUSES.includes(status));
}

function isAccountingConfirmed(returnOrder = {}, options = {}) {
  if (options.assumeConfirmed === true) return true;
  return returnOrder.accountingConfirmed === true
    || CONFIRMED_ACCOUNTING_STATUSES.includes(lower(returnOrder.accountingStatus));
}

function isLikelyRealReturnOrder(returnOrder = {}, options = {}) {
  if (options.allowSyntheticReturn === true) return true;
  const sourceModel = lower(returnOrder.sourceModel);
  const source = lower(returnOrder.source);
  const sourceType = lower(returnOrder.sourceType || returnOrder.refType);
  const key = resolveReturnOrderKey(returnOrder).toUpperCase();

  return sourceModel === 'returnorders'
    || source === 'returnorders'
    || sourceType === 'returnorder'
    || Boolean(returnOrder.returnOrderId || returnOrder.returnOrderCode)
    || key.startsWith('RO-')
    || key.startsWith('THH')
    || Array.isArray(returnOrder.items);
}

function returnOrderAmountAnalysis(returnOrder = {}) {
  // Rule mới: amount là giá trị nghiệp vụ ưu tiên nếu có số dương; debtReduction và returnAmount
  // được dùng làm đối chiếu để phát hiện lệch thay vì âm thầm chọn bừa.
  const candidates = [
    ['amount', returnOrder.amount],
    ['debtReduction', returnOrder.debtReduction],
    ['returnAmount', returnOrder.returnAmount],
    ['totalReturnAmount', returnOrder.totalReturnAmount],
    ['totalAmount', returnOrder.totalAmount],
    ['returnedAmount', returnOrder.returnedAmount],
    ['totalValue', returnOrder.totalValue]
  ].map(([field, value]) => ({ field, amount: normalizeAmount(value) }))
    .filter((item) => item.amount > 0);

  let itemAmount = 0;
  if (!candidates.length && Array.isArray(returnOrder.items)) {
    itemAmount = normalizeAmount(returnOrder.items.reduce((sum, item) => {
      const direct = [item.returnAmount, item.amount, item.totalAmount]
        .map(normalizeAmount)
        .find((value) => value > 0);
      if (direct > 0) return sum + direct;
      const qty = toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0);
      const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0);
      return sum + Math.round(qty * price);
    }, 0));
    if (itemAmount > 0) candidates.push({ field: 'items', amount: itemAmount });
  }

  const selected = candidates[0] || { field: '', amount: 0 };
  const positiveValues = [...new Set(candidates.map((item) => item.amount))];
  const warnings = [];
  if (positiveValues.length > 1) {
    warnings.push({
      code: 'return_amount_field_mismatch',
      selectedField: selected.field,
      selectedAmount: selected.amount,
      candidates
    });
  }

  return { amount: selected.amount, amountField: selected.field, candidates, warnings };
}

function buildIdempotencyKey(returnOrder = {}, options = {}) {
  // P0 ledger guard: idempotencyKey phải ổn định theo định danh phiếu trả,
  // không phụ thuộc accountingBatchId/forceRepostReturn hay field biến động khác.
  // Giữ format prefix cũ để tương thích các AR-RETURN đã được sinh từ code/id.
  void options;
  const key = resolveReturnOrderKey(returnOrder);
  if (!key) return '';
  return `${AR_RETURN_LEDGER_TYPE}:${key}`;
}

function activeArReturnBaseQuery() {
  return {
    status: { $nin: ['void', 'reversed', 'cancelled', 'canceled', 'deleted'] },
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    $or: [
      { type: AR_RETURN_TYPE },
      { type: AR_RETURN_LEDGER_TYPE },
      { ledgerType: AR_RETURN_LEDGER_TYPE },
      { category: AR_RETURN_LEDGER_TYPE },
      { code: /^AR-RETURN-/ }
    ]
  };
}

function buildActiveArReturnIdempotencyLookup(idempotencyKey) {
  const key = cleanString(idempotencyKey);
  if (!key) return null;
  return {
    ...activeArReturnBaseQuery(),
    idempotencyKey: key
  };
}

function buildActiveArReturnLookup(returnOrder = {}, options = {}) {
  const returnKeys = returnOrderIdentityKeys(returnOrder);
  const orderKeys = salesOrderIdentityKeys(returnOrder);
  const idempotencyKey = buildIdempotencyKey(returnOrder, options);
  const or = [];

  if (idempotencyKey) or.push({ idempotencyKey });
  if (returnKeys.length) {
    or.push(
      { id: { $in: returnKeys.map((key) => `${AR_RETURN_LEDGER_TYPE}-${key}`) } },
      { code: { $in: returnKeys.map((key) => `${AR_RETURN_LEDGER_TYPE}-${key}`) } },
      { refId: { $in: returnKeys } },
      { refCode: { $in: returnKeys } },
      { returnOrderId: { $in: returnKeys } },
      { returnOrderCode: { $in: returnKeys } },
      { sourceId: { $in: returnKeys } },
      { sourceCode: { $in: returnKeys } }
    );
  }
  if (orderKeys.length) {
    or.push(
      { orderId: { $in: orderKeys } },
      { orderCode: { $in: orderKeys } },
      { salesOrderId: { $in: orderKeys } },
      { salesOrderCode: { $in: orderKeys } }
    );
  }
  if (!or.length) return null;

  return {
    ...activeArReturnBaseQuery(),
    $and: [
      { $or: activeArReturnBaseQuery().$or },
      { $or: or }
    ]
  };
}

async function findActiveArReturnsByIdempotencyKey(idempotencyKey, options = {}) {
  const lookup = buildActiveArReturnIdempotencyLookup(idempotencyKey);
  if (!lookup) return [];
  return paymentRepository().findAll(lookup, options);
}

async function findActiveArReturnsForReturnOrder(returnOrder = {}, options = {}) {
  const lookup = buildActiveArReturnLookup(returnOrder, options);
  if (!lookup) return [];
  return paymentRepository().findAll(lookup, options);
}

function makeArReturnDuplicateError(message, details = {}) {
  const err = new Error(message);
  err.code = 'P0_AR_RETURN_DUPLICATE';
  err.severity = 'P0';
  err.details = details;
  return err;
}

function publicLedger(row = {}) {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    ledgerType: row.ledgerType,
    category: row.category,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceCode: row.sourceCode,
    returnOrderId: row.returnOrderId,
    returnOrderCode: row.returnOrderCode,
    idempotencyKey: row.idempotencyKey,
    amount: row.amount,
    credit: row.credit,
    status: row.status
  };
}

async function resolveExistingArReturnGuard(returnOrder = {}, validation = {}, options = {}) {
  const idempotencyKey = buildIdempotencyKey(returnOrder, options);
  if (!idempotencyKey) {
    throw makeArReturnDuplicateError('Không thể ghi AR-RETURN vì thiếu idempotencyKey ổn định.', {
      reason: 'missing_idempotency_key',
      returnOrder: returnOrder.code || returnOrder.id || returnOrder._id || ''
    });
  }

  const sameKeyRows = await findActiveArReturnsByIdempotencyKey(idempotencyKey, options);
  if (sameKeyRows.length > 1) {
    throw makeArReturnDuplicateError('P0: Có nhiều AR-RETURN active cùng idempotencyKey; dừng để tránh giảm công nợ nhiều lần.', {
      reason: 'duplicate_active_idempotency_key',
      idempotencyKey,
      count: sameKeyRows.length,
      ledgers: sameKeyRows.map(publicLedger)
    });
  }
  if (sameKeyRows.length === 1) {
    return { existing: sameKeyRows[0], existingRows: sameKeyRows, reason: 'active_ar_return_same_idempotency_key' };
  }

  const existingRows = await findActiveArReturnsForReturnOrder(returnOrder, options);
  if (existingRows.length > 1) {
    throw makeArReturnDuplicateError('P0: Có nhiều AR-RETURN active cùng nguồn returnOrder; dừng để kiểm tra dữ liệu bẩn.', {
      reason: 'duplicate_active_return_order_source',
      idempotencyKey,
      returnOrder: returnOrder.code || returnOrder.id || returnOrder._id || '',
      count: existingRows.length,
      ledgers: existingRows.map(publicLedger)
    });
  }
  if (existingRows.length === 1) {
    const existingAmount = normalizeAmount(existingRows[0].credit ?? existingRows[0].amount);
    return {
      existing: existingRows[0],
      existingRows,
      existingActiveAmount: existingAmount,
      reason: existingAmount === validation.amount ? 'active_ar_return_exists' : 'active_ar_return_amount_mismatch'
    };
  }

  return { existing: null, existingRows: [], existingActiveAmount: 0, reason: 'not_found' };
}

async function hasActiveArReturnForReturnOrder(returnOrder = {}, options = {}) {
  const rows = await findActiveArReturnsForReturnOrder(returnOrder, options);
  return (rows || []).some((row) => normalizeAmount(row.credit ?? row.amount) > 0);
}

async function resolveReturnOrder(returnOrderOrId, options = {}) {
  if (returnOrderOrId && typeof returnOrderOrId === 'object') return returnOrderOrId;
  const idOrCode = cleanString(returnOrderOrId);
  if (!idOrCode) return null;
  return returnOrderRepository().findByIdOrCode(idOrCode, options);
}

function validateReturnOrderForAR(returnOrder = {}, options = {}) {
  const amountInfo = returnOrderAmountAnalysis(returnOrder);
  const returnOrderKey = resolveReturnOrderKey(returnOrder);
  const customerKey = cleanString(returnOrder.customerId || returnOrder.customerCode);

  if (!returnOrder || !Object.keys(returnOrder).length) {
    return { ok: false, reason: 'missing_return_order', amount: 0, warnings: [] };
  }
  if (!returnOrderKey) {
    return { ok: false, reason: 'missing_return_order_identity', amount: amountInfo.amount, warnings: amountInfo.warnings };
  }
  if (!isLikelyRealReturnOrder(returnOrder, options)) {
    return { ok: false, reason: 'not_return_orders_source', amount: amountInfo.amount, warnings: amountInfo.warnings };
  }
  if (isInactiveReturnOrder(returnOrder)) {
    return { ok: false, reason: 'inactive_return_order', amount: amountInfo.amount, warnings: amountInfo.warnings };
  }
  if (!isAccountingConfirmed(returnOrder, options)) {
    return { ok: false, reason: 'return_order_not_confirmed', amount: amountInfo.amount, warnings: amountInfo.warnings };
  }
  if (!customerKey && options.allowMissingCustomerIdentity !== true) {
    return { ok: false, reason: 'missing_customer_identity', amount: amountInfo.amount, warnings: amountInfo.warnings };
  }
  if (amountInfo.amount <= 0) {
    return { ok: false, reason: 'zero_return_amount', amount: amountInfo.amount, warnings: amountInfo.warnings };
  }
  return {
    ok: true,
    reason: 'valid',
    amount: amountInfo.amount,
    amountField: amountInfo.amountField,
    warnings: amountInfo.warnings
  };
}

function buildReturnARLedgerEntry(returnOrder = {}, options = {}) {
  const validation = validateReturnOrderForAR(returnOrder, { ...options, assumeConfirmed: options.assumeConfirmed });
  if (!validation.ok) {
    const err = new Error(`Không thể build AR-RETURN: ${validation.reason}`);
    err.code = validation.reason;
    err.validation = validation;
    throw err;
  }

  const amount = validation.amount;
  const returnOrderId = cleanString(returnOrder.id || returnOrder._id || returnOrder.returnOrderId || returnOrder.code);
  const returnOrderCode = cleanString(returnOrder.code || returnOrder.returnOrderCode || returnOrder.id || returnOrder._id);
  const returnOrderKey = resolveReturnOrderKey(returnOrder);
  const accountingBatchId = cleanString(options.accountingBatchId || returnOrder.accountingBatchId || '');
  const batchSuffix = options.forceRepostReturn && accountingBatchId ? `-${accountingBatchId}` : '';
  const salesOrderId = cleanString(returnOrder.salesOrderId || returnOrder.orderId || returnOrder.sourceOrderId || returnOrder.deliveryOrderId || '');
  const salesOrderCode = cleanString(returnOrder.salesOrderCode || returnOrder.orderCode || returnOrder.sourceOrderCode || returnOrder.deliveryOrderCode || '');
  const date = dateUtil.toDateOnly(
    returnOrder.deliveryDate
    || returnOrder.documentDate
    || returnOrder.returnDate
    || returnOrder.date
    || returnOrder.createdAt
    || dateUtil.todayVN()
  );
  const salesStaffCode = pickSalesStaffCode(returnOrder);
  const salesStaffName = pickSalesStaffName(returnOrder);
  const deliveryStaffCode = pickDeliveryStaffCode(returnOrder);
  const deliveryStaffName = pickDeliveryStaffName(returnOrder);
  const idempotencyKey = buildIdempotencyKey(returnOrder, options);
  if (!idempotencyKey) {
    const err = new Error('Không thể build AR-RETURN: missing_idempotency_key');
    err.code = 'missing_idempotency_key';
    err.validation = validation;
    throw err;
  }

  return {
    id: `${AR_RETURN_LEDGER_TYPE}-${returnOrderId || returnOrderCode || returnOrderKey}${batchSuffix}`,
    code: `${AR_RETURN_LEDGER_TYPE}-${returnOrderCode || returnOrderId || returnOrderKey}${batchSuffix}`,
    tenantId: returnOrder.tenantId || '',
    date,
    account: 'AR',
    type: AR_RETURN_TYPE,
    ledgerType: AR_RETURN_LEDGER_TYPE,
    category: AR_RETURN_LEDGER_TYPE,
    direction: 'credit',
    refType: 'RETURN_ORDER',
    refId: returnOrderId || returnOrderCode || returnOrderKey,
    refCode: returnOrderCode || returnOrderId || returnOrderKey,
    customerId: cleanString(returnOrder.customerId),
    customerCode: cleanString(returnOrder.customerCode),
    customerName: cleanString(returnOrder.customerName),
    salesmanCode: salesStaffCode,
    salesmanName: salesStaffName,
    salesStaffCode,
    salesStaffName,
    deliveryStaffCode,
    deliveryStaffName,
    orderId: salesOrderId,
    orderCode: salesOrderCode,
    salesOrderId,
    salesOrderCode,
    masterOrderId: cleanString(returnOrder.masterOrderId || returnOrder.deliveryMasterId || ''),
    masterOrderCode: cleanString(returnOrder.masterOrderCode || returnOrder.deliveryMasterCode || ''),
    sourceType: RETURN_ORDER_SOURCE_TYPE,
    sourceModel: RETURN_ORDER_SOURCE_MODEL,
    sourceId: returnOrderId || returnOrderCode || returnOrderKey,
    sourceCode: returnOrderCode || returnOrderId || returnOrderKey,
    sourceOrderId: salesOrderId,
    sourceOrderCode: salesOrderCode,
    returnOrderId: returnOrderId || returnOrderCode || returnOrderKey,
    returnOrderCode: returnOrderCode || returnOrderId || returnOrderKey,
    accountingBatchId,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingConfirmedBy: cleanString(options.confirmedBy || options.user || returnOrder.accountingConfirmedBy || ''),
    debit: 0,
    credit: amount,
    amount,
    amountField: validation.amountField,
    amountWarnings: validation.warnings,
    idempotencyKey,
    status: 'posted',
    source: RETURN_ORDER_SOURCE_MODEL,
    note: cleanString(returnOrder.note || `Ghi giảm công nợ từ phiếu trả hàng ${returnOrderCode || returnOrderId || returnOrderKey}`),
    items: Array.isArray(returnOrder.items) ? returnOrder.items : [],
    allocationDetails: Array.isArray(returnOrder.allocationDetails) ? returnOrder.allocationDetails : [],
    returnAllocationRefs: Array.isArray(returnOrder.returnAllocationRefs) ? returnOrder.returnAllocationRefs : [],
    metadata: {
      ...(returnOrder.metadata || {}),
      allocationPostingMode: returnOrder.metadata?.allocationPostingMode || undefined
    },
    createdAt: returnOrder.arPostedAt || returnOrder.createdAt || dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
}

async function auditReturnAr(action, payload = {}, options = {}) {
  if (options.audit === false || (process.env.NODE_ENV === 'test' && options.audit !== true)) return null;
  try {
    return await auditService().record({ action, refType: 'returnOrder', ...payload }, options);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[returnArPostingService] audit skipped:', err.message);
    }
    return null;
  }
}

async function postReturnOrderToAR(returnOrderOrId, options = {}) {
  const returnOrder = await resolveReturnOrder(returnOrderOrId, options);
  const validation = validateReturnOrderForAR(returnOrder || {}, options);
  if (!validation.ok) {
    const result = { posted: false, entry: null, reason: validation.reason, amount: validation.amount, warnings: validation.warnings };
    return options.returnResult ? result : null;
  }

  const existingGuard = await resolveExistingArReturnGuard(returnOrder, validation, options);
  if (existingGuard.existing && existingGuard.reason !== 'active_ar_return_amount_mismatch') {
    const existingActiveAmount = normalizeAmount(existingGuard.existing.credit ?? existingGuard.existing.amount);
    const result = {
      posted: false,
      entry: existingGuard.existing,
      reason: existingGuard.reason,
      amount: validation.amount,
      existingActiveAmount,
      idempotencyKey: buildIdempotencyKey(returnOrder, options),
      warnings: validation.warnings
    };
    return options.returnResult ? result : null;
  }
  if (existingGuard.existing && existingGuard.reason === 'active_ar_return_amount_mismatch') {
    const result = {
      posted: false,
      entry: null,
      reason: 'active_ar_return_amount_mismatch',
      amount: validation.amount,
      existingActiveAmount: existingGuard.existingActiveAmount,
      existingRows: existingGuard.existingRows,
      warnings: validation.warnings
    };
    await auditReturnAr('return_ar_post_blocked_amount_mismatch', {
      refId: returnOrder.id || returnOrder._id || '',
      refCode: returnOrder.code || '',
      after: result,
      note: 'Không ghi AR-RETURN mới vì đã có AR-RETURN active khác số tiền'
    }, options);
    return options.returnResult ? result : null;
  }

  const entry = buildReturnARLedgerEntry(returnOrder, options);
  await paymentRepository().upsert(entry, options);

  const patchedReturnOrder = {
    ...returnOrder,
    arPosted: true,
    arPostedAt: returnOrder.arPostedAt || dateUtil.nowIso(),
    arLedgerId: entry.id || entry.code,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    updatedAt: dateUtil.nowIso()
  };
  if (!options.skipReturnOrderPatch) {
    try {
      await returnOrderRepository().upsert(patchedReturnOrder, options);
    } catch (err) {
      if (options.strictReturnOrderPatch === true) throw err;
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[returnArPostingService] returnOrder patch skipped:', err.message);
      }
    }
  }

  await auditReturnAr('return_ar_posted', {
    refId: entry.returnOrderId,
    refCode: entry.returnOrderCode,
    after: { ledgerId: entry.id, ledgerCode: entry.code, amount: entry.amount, idempotencyKey: entry.idempotencyKey },
    note: entry.note
  }, options);

  const result = { posted: true, entry, reason: 'created_ar_return', amount: entry.amount, warnings: validation.warnings };
  return options.returnResult ? result : entry;
}

async function postConfirmedReturnOrdersToAR(filters = {}, options = {}) {
  const query = {
    ...(filters || {}),
    $and: [
      ...(Array.isArray(filters.$and) ? filters.$and : []),
      {
        $or: [
          { accountingConfirmed: true },
          { accountingStatus: { $in: [...CONFIRMED_ACCOUNTING_STATUSES] } }
        ]
      }
    ]
  };
  const rows = await returnOrderRepository().findAll(query, { ...options, limit: options.limit || 1000 });
  const summary = { scanned: rows.length, posted: 0, skipped: 0, errors: 0, results: [] };
  for (const row of rows) {
    try {
      const result = await postReturnOrderToAR(row, { ...options, returnResult: true });
      if (result.posted) summary.posted += 1;
      else summary.skipped += 1;
      summary.results.push({ returnOrder: row.code || row.id || '', ...result, entry: result.entry ? { id: result.entry.id, code: result.entry.code } : null });
    } catch (err) {
      summary.errors += 1;
      summary.results.push({ returnOrder: row.code || row.id || '', posted: false, reason: err.code || err.message, error: err.message });
    }
  }
  return summary;
}

async function reconcileReturnOrderAR(returnOrderOrId, options = {}) {
  const returnOrder = await resolveReturnOrder(returnOrderOrId, options);
  if (!returnOrder) return { ok: false, reason: 'missing_return_order' };
  const validation = validateReturnOrderForAR(returnOrder, options);
  const rows = await findActiveArReturnsForReturnOrder(returnOrder, options);
  const activeRows = rows || [];
  const activeAmount = activeRows.reduce((sum, row) => sum + normalizeAmount(row.credit ?? row.amount), 0);
  const issues = [];

  if (validation.ok && !activeRows.length) issues.push('missing_ar_return');
  if (activeRows.length > 1) issues.push('duplicate_ar_return');
  if (validation.ok && activeRows.length && activeAmount !== validation.amount) issues.push('amount_mismatch');
  if (!validation.ok && activeRows.length) issues.push('ar_return_for_invalid_return_order');
  for (const row of activeRows) {
    if (validation.ok && cleanString(row.customerCode || row.customerId) !== cleanString(returnOrder.customerCode || returnOrder.customerId)) {
      issues.push('customer_mismatch');
      break;
    }
  }

  return {
    ok: issues.length === 0,
    returnOrder: returnOrder.code || returnOrder.id || '',
    validation,
    expectedAmount: validation.amount || 0,
    activeAmount,
    activeCount: activeRows.length,
    issues,
    ledgers: activeRows.map((row) => ({ id: row.id, code: row.code, amount: row.amount, credit: row.credit, customerCode: row.customerCode, status: row.status }))
  };
}

module.exports = {
  postReturnOrderToAR,
  postConfirmedReturnOrdersToAR,
  buildReturnARLedgerEntry,
  validateReturnOrderForAR,
  reconcileReturnOrderAR,
  findActiveArReturnsForReturnOrder,
  findActiveArReturnsByIdempotencyKey,
  hasActiveArReturnForReturnOrder,
  _internal: {
    AR_RETURN_TYPE,
    AR_RETURN_LEDGER_TYPE,
    INACTIVE_STATUSES,
    CONFIRMED_ACCOUNTING_STATUSES,
    returnOrderAmountAnalysis,
    activeArReturnBaseQuery,
    buildActiveArReturnLookup,
    buildActiveArReturnIdempotencyLookup,
    buildIdempotencyKey,
    resolveExistingArReturnGuard,
    isInactiveReturnOrder,
    isAccountingConfirmed,
    isLikelyRealReturnOrder
  }
};
