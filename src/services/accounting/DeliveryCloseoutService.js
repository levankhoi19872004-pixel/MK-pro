'use strict';

const crypto = require('node:crypto');
const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const { normalizeDebtAmount, calculateDeliveryDebtAmount } = require('../../constants/finance.constants');

const INACTIVE_RETURN_STATUSES = new Set(['cancelled', 'canceled', 'void', 'voided', 'deleted', 'removed', 'cleared', 'duplicate_cancelled', 'inactive']);
const CONFIRMED_RETURN_STATUSES = new Set(['confirmed', 'accounting_confirmed', 'warehouse_received', 'received', 'posted']);
const ACTIVE_PAYMENT_STATUSES = new Set(['submitted', 'confirmed', 'accounting_confirmed', 'posted', 'paid', 'received']);

function clean(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const amount = Number(toNumber(value));
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount);
}

function parseMoneyValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { ok: true, amount: Math.round(value) }
      : { ok: false };
  }
  const rawText = clean(value);
  if (!rawText || !/[0-9]/.test(rawText)) return { ok: false };
  const amount = Number(toNumber(value));
  if (!Number.isFinite(amount)) return { ok: false };
  return { ok: true, amount: Math.round(amount) };
}

function positiveMoney(value) {
  return Math.max(0, normalizeDebtAmount(value));
}

function hasOwnValue(source = {}, field) {
  return Object.prototype.hasOwnProperty.call(source, field)
    && source[field] !== undefined
    && source[field] !== null
    && clean(source[field]) !== '';
}

function contractError(code, message, details = {}) {
  const err = new Error(message);
  err.code = code || 'CONTRACT_VALIDATION_ERROR';
  err.severity = 'P0';
  Object.assign(err, details);
  return err;
}

function requireText(source = {}, field, context = {}) {
  if (!hasOwnValue(source, field)) {
    throw contractError('CONTRACT_VALIDATION_ERROR', `${context.label || 'document'} thiếu field bắt buộc: ${field}`, { field, context });
  }
  return clean(source[field]);
}

function requireMoney(source = {}, field, context = {}, options = {}) {
  if (!hasOwnValue(source, field)) {
    throw contractError('CONTRACT_VALIDATION_ERROR', `${context.label || 'document'} thiếu field tiền bắt buộc: ${field}`, { field, context });
  }
  const parsed = parseMoneyValue(source[field]);
  if (!parsed.ok) {
    throw contractError('CONTRACT_VALIDATION_ERROR', `${context.label || 'document'} field ${field} không phải số hợp lệ`, { field, value: source[field], context });
  }
  const rounded = parsed.amount;
  if (options.nonNegative !== false && rounded < 0) {
    throw contractError('CONTRACT_VALIDATION_ERROR', `${context.label || 'document'} field ${field} không được âm`, { field, value: rounded, context });
  }
  return rounded;
}

function orderId(order = {}) {
  return clean(order.id || order._id);
}

function orderCode(order = {}) {
  return clean(order.code || order.orderCode);
}

function validateSalesOrderContract(order = {}) {
  const id = orderId(order);
  const code = orderCode(order);
  if (!id && !code) {
    throw contractError('CONTRACT_VALIDATION_ERROR', 'salesOrders phải có id hoặc code rõ ràng trước khi tính deliveryCloseout.', { document: 'salesOrders' });
  }
  requireText(order, 'customerCode', { label: 'salesOrders', id, code });
  requireMoney(order, 'totalAmount', { label: 'salesOrders', id, code }, { nonNegative: true });
  if (order.deliveryCloseout && typeof order.deliveryCloseout === 'object') assertNoLedgerShape(order.deliveryCloseout);
  return true;
}

function originalAmount(order = {}) {
  validateSalesOrderContract(order);
  return requireMoney(order, 'totalAmount', { label: 'salesOrders', id: orderId(order), code: orderCode(order) }, { nonNegative: true });
}

function isActiveReturnOrder(row = {}) {
  if (!row || typeof row !== 'object') return false;
  const status = clean(row.status).toLowerCase();
  if (!status) {
    throw contractError('CONTRACT_VALIDATION_ERROR', 'returnOrders phải có status rõ ràng; không được fallback sang returnStatus/accountingStatus.', { document: 'returnOrders', id: clean(row.id || row.code || row._id) });
  }
  if (row.deletedAt || row.isDeleted === true || row.deleted === true) return false;
  return !INACTIVE_RETURN_STATUSES.has(status);
}

function inventoryImpactMode(row = {}) {
  const impact = row && typeof row.inventoryImpact === 'object' && row.inventoryImpact !== null ? row.inventoryImpact : {};
  return clean(impact.mode || row.inventoryImpactMode).toLowerCase();
}

function hasClearInventoryImpact(row = {}) {
  const mode = inventoryImpactMode(row);
  const impact = row && typeof row.inventoryImpact === 'object' && row.inventoryImpact !== null ? row.inventoryImpact : {};
  if (mode === 'posted') return true;
  if (mode !== 'none') return false;
  return Boolean(clean(impact.reason || row.inventoryImpactReason || row.stockPostReason));
}

function hasValidReturnInventoryState(row = {}) {
  return row.inventoryPosted === true
    || row.stockPosted === true
    || clean(row.stockInStatus).toLowerCase() === 'posted'
    || hasClearInventoryImpact(row);
}

function returnInventoryDiagnostic(row = {}, sourceUsedForValidation = 'returnOrders') {
  const impact = row && typeof row.inventoryImpact === 'object' && row.inventoryImpact !== null ? row.inventoryImpact : {};
  return {
    code: clean(row.code || row.id || row._id),
    orderCode: clean(row.orderCode || row.sourceOrderCode || row.deliveryOrderCode),
    salesOrderCode: clean(row.salesOrderCode),
    orderId: clean(row.orderId || row.sourceOrderId || row.deliveryOrderId),
    salesOrderId: clean(row.salesOrderId),
    deliveryDate: clean(row.deliveryDate || row.date || row.documentDate),
    deliveryStaffCode: clean(row.deliveryStaffCode || row.deliveryCode || row.nvghCode || row.staffCode),
    amount: money(row.amount ?? row.totalAmount ?? row.totalReturnAmount ?? row.returnAmount ?? row.debtReduction),
    status: clean(row.status),
    returnStatus: clean(row.returnStatus),
    returnState: clean(row.returnState),
    warehouseReceiveStatus: clean(row.warehouseReceiveStatus),
    stockInStatus: clean(row.stockInStatus),
    inventoryPosted: row.inventoryPosted === true,
    stockPosted: row.stockPosted === true,
    inventoryImpactMode: clean(impact.mode || row.inventoryImpactMode),
    stockTransactionIds: Array.isArray(row.stockTransactionIds) ? row.stockTransactionIds.map(clean).filter(Boolean) : (clean(row.stockTransactionId) ? [clean(row.stockTransactionId)] : []),
    sourceUsedForValidation
  };
}

function throwInvalidReturnInventoryState(row = {}, context = {}) {
  const invalidReturnOrders = [returnInventoryDiagnostic(row, context.sourceUsedForValidation || 'returnOrders')];
  const err = contractError(
    'RETURN_ORDER_INVENTORY_IMPACT_REQUIRED',
    'returnOrders đã xác nhận phải có inventoryPosted=true hoặc inventoryImpact rõ ràng.',
    {
      document: 'returnOrders',
      id: clean(row.id || row._id),
      returnOrderCode: clean(row.code),
      status: clean(row.status).toLowerCase(),
      invalidReturnOrders
    }
  );
  err.status = 400;
  err.data = { invalidReturnOrders };
  throw err;
}

function validateReturnOrderContract(row = {}) {
  const id = clean(row.id || row._id);
  const code = clean(row.code);
  if (!id && !code) {
    throw contractError('CONTRACT_VALIDATION_ERROR', 'returnOrders phải có id hoặc code rõ ràng.', { document: 'returnOrders' });
  }
  const hasSource = clean(row.sourceOrderId || row.salesOrderId || row.sourceOrderCode || row.orderId || row.orderCode || row.salesOrderCode);
  if (!hasSource) {
    throw contractError('CONTRACT_VALIDATION_ERROR', 'returnOrders phải có sourceOrderId hoặc salesOrderId hoặc sourceOrderCode.', { document: 'returnOrders', id, code });
  }
  const status = requireText(row, 'status', { label: 'returnOrders', id, code }).toLowerCase();
  if (!INACTIVE_RETURN_STATUSES.has(status)) {
    requireMoney(row, 'totalReturnAmount', { label: 'returnOrders', id, code }, { nonNegative: false });
    if (CONFIRMED_RETURN_STATUSES.has(status) && !hasValidReturnInventoryState(row)) {
      throwInvalidReturnInventoryState(row, { sourceUsedForValidation: row.sourceUsedForValidation || 'returnOrders' });
    }
  }
  return true;
}

function returnOrderAmount(row = {}) {
  validateReturnOrderContract(row);
  if (!isActiveReturnOrder(row)) return 0;
  return requireMoney(row, 'totalReturnAmount', { label: 'returnOrders', id: clean(row.id || row._id), code: clean(row.code) }, { nonNegative: false });
}

function summarizeReturnOrders(returnOrders = [], context = {}) {
  const activeRows = [];
  for (const row of Array.isArray(returnOrders) ? returnOrders : []) {
    validateReturnOrderContract(row);
    if (isActiveReturnOrder(row)) activeRows.push(row);
  }
  const returnedAmount = activeRows.reduce((sum, row) => sum + returnOrderAmount(row), 0);
  if (money(returnedAmount) < 0) {
    throw contractError('DELIVERY_CLOSEOUT_CANONICAL_RETURN_NEGATIVE', 'Tong hang tra canonical tu returnOrders khong duoc am.', {
      orderId: context.orderId || orderId(context.order || {}),
      orderCode: context.orderCode || orderCode(context.order || {}),
      returnedAmount: money(returnedAmount),
      returnOrderIds: activeRows.map((row) => clean(row.id || row.code || row._id)).filter(Boolean)
    });
  }
  return {
    returnedAmount,
    returnOrderIds: activeRows.map((row) => clean(row.id || row.code || row._id)).filter(Boolean),
    activeReturnOrders: activeRows
  };
}

function paymentId(row = {}, fallback = '') {
  return clean(row.id || row.code || row.paymentId || fallback);
}

function validatePaymentContract(row = {}, fallback = '') {
  const id = paymentId(row, fallback);
  if (!id) {
    throw contractError('CONTRACT_VALIDATION_ERROR', 'delivery payment record phải có id/code/paymentId rõ ràng.', { document: 'deliveryPayment' });
  }
  requireMoney(row, 'amount', { label: 'deliveryPayment', id }, { nonNegative: true });
  requireText(row, 'sourceType', { label: 'deliveryPayment', id });
  const status = requireText(row, 'status', { label: 'deliveryPayment', id }).toLowerCase();
  if (!ACTIVE_PAYMENT_STATUSES.has(status)) {
    throw contractError('CONTRACT_VALIDATION_ERROR', `delivery payment status không hợp lệ: ${status}`, { document: 'deliveryPayment', id, status });
  }
  return true;
}

function paymentAmount(row = {}, fallback = '') {
  validatePaymentContract(row, fallback);
  return requireMoney(row, 'amount', { label: 'deliveryPayment', id: paymentId(row, fallback) }, { nonNegative: true });
}

function collectDeliveryPaymentRows(order = {}, explicitPayments = []) {
  const rows = [];
  const seen = new Set();
  function push(row = {}, fallback = '') {
    const id = paymentId(row, fallback || `${rows.length + 1}`);
    validatePaymentContract(row, id);
    const amount = paymentAmount(row, id);
    if (amount <= 0) return;
    const key = `${id}:${amount}:${clean(row.sourceType)}:${clean(row.status)}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ ...row, id, amount });
  }

  for (const row of Array.isArray(explicitPayments) ? explicitPayments : []) push(row);
  for (const row of Array.isArray(order.deliveryCloseout?.paymentRows) ? order.deliveryCloseout.paymentRows : []) push(row);

  return rows;
}

function pickMoneyValue(source = {}, fields = [], contextLabel = 'salesOrders.deliveryCloseout', options = {}) {
  let fallbackZero = 0;
  for (const field of fields) {
    if (!hasOwnValue(source, field)) continue;
    const value = requireMoney(source, field, { label: contextLabel, field }, { nonNegative: options.nonNegative !== false });
    if (value !== 0) return value;
    fallbackZero = 0;
  }
  return fallbackZero;
}

function firstMoney(source = {}, fields = []) {
  return pickMoneyValue(source, fields);
}

function closeoutMoney(source = {}, fields = []) {
  return pickMoneyValue(source, fields, 'salesOrders.deliveryCloseout');
}

const CASH_FIELDS = ['cashAmount', 'cashCollectedAmount', 'cashReceivedAmount', 'paymentCashAmount', 'paidCashAmount', 'paidCash', 'collectedCash', 'deliveryCashAmount', 'collectedCashAmount', 'cashCollected', 'cash'];
const BANK_FIELDS = ['bankAmount', 'transferAmount', 'bankTransferAmount', 'paymentTransferAmount', 'paymentBankAmount', 'paidBankAmount', 'paidTransferAmount', 'collectedBankAmount', 'deliveryBankAmount', 'bankCollectedAmount', 'collectedTransferAmount', 'collectedTransfer', 'transferCollected', 'bankCollected', 'bank'];
const REWARD_FIELDS = ['rewardAmount', 'bonusAmount', 'allowanceAmount', 'promotionRewardAmount', 'displayRewardAmount', 'bonusReturnAmount', 'rewardOffsetAmount', 'promotionOffsetAmount'];
const OFFSET_FIELDS = ['offsetAmount', 'debtOffsetAmount', 'deliveryOffsetAmount', 'otherOffsetAmount'];
const RETURN_FIELDS = ['returnAmount', 'returnedAmount', 'returnOrderAmount', 'actualReturnAmount', 'returnAmountFromReturnOrders', 'syncedReturnAmountFromReturnOrders'];

function orderMoneyValue(order = {}, closeout = {}, fields = [], label = 'amount') {
  const fromCloseout = pickMoneyValue(closeout, fields, `salesOrders.deliveryCloseout.${label}`);
  if (fromCloseout !== 0) return fromCloseout;
  return pickMoneyValue(order, fields, `salesOrders.${label}`);
}

function summarizeInlineDeliveryPayments(order = {}) {
  const closeout = order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
  const cashAmount = orderMoneyValue(order, closeout, CASH_FIELDS, 'cashAmount');
  const bankAmount = orderMoneyValue(order, closeout, BANK_FIELDS, 'bankAmount');
  const paymentRows = [];
  if (cashAmount > 0) paymentRows.push({ id: 'delivery-inline-cash', sourceType: 'DELIVERY_CLOSEOUT_BREAKDOWN', status: 'confirmed', method: 'cash', amount: cashAmount });
  if (bankAmount > 0) paymentRows.push({ id: 'delivery-inline-bank', sourceType: 'DELIVERY_CLOSEOUT_BREAKDOWN', status: 'confirmed', method: 'transfer', amount: bankAmount });
  return {
    cashAmount,
    bankAmount,
    collectedAmount: money(cashAmount + bankAmount),
    paymentIds: paymentRows.map((row) => paymentId(row)).filter(Boolean),
    paymentRows
  };
}

function summarizeCloseoutBreakdownPayments(order = {}) {
  const inline = summarizeInlineDeliveryPayments(order);
  return {
    collectedAmount: inline.collectedAmount,
    cashAmount: inline.cashAmount,
    bankAmount: inline.bankAmount,
    paymentIds: inline.paymentIds,
    paymentRows: inline.paymentRows
  };
}

function summarizeOffsets(order = {}) {
  const closeout = order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
  const explicitOffset = orderMoneyValue(order, closeout, OFFSET_FIELDS, 'offsetAmount');
  const rewardOffset = orderMoneyValue(order, closeout, REWARD_FIELDS, 'rewardAmount');

  // TH trên màn giao hàng là khoản cấn trừ hợp lệ. Một số dữ liệu legacy lưu cùng giá trị
  // ở cả offsetAmount và rewardAmount; nếu cộng đôi sẽ làm giảm công nợ sai.
  const offsetAmount = explicitOffset > 0 && rewardOffset > 0 && explicitOffset === rewardOffset
    ? money(rewardOffset)
    : money(explicitOffset + rewardOffset);
  const offsetRows = [];
  if (explicitOffset > 0) offsetRows.push({ type: 'offset', amount: explicitOffset });
  if (rewardOffset > 0) offsetRows.push({ type: 'reward', amount: rewardOffset });
  return { offsetAmount, rewardAmount: rewardOffset || explicitOffset, offsetRows };
}

function summarizePayments(order = {}, explicitPayments = []) {
  const rows = collectDeliveryPaymentRows(order, explicitPayments);
  if (rows.length > 0) {
    const collectedAmount = rows.reduce((sum, row) => sum + paymentAmount(row), 0);
    return {
      cashAmount: rows.filter((row) => clean(row.method || row.paymentMethod).toLowerCase().includes('cash')).reduce((sum, row) => sum + paymentAmount(row), 0),
      bankAmount: rows.filter((row) => !clean(row.method || row.paymentMethod).toLowerCase().includes('cash')).reduce((sum, row) => sum + paymentAmount(row), 0),
      collectedAmount,
      paymentIds: rows.map((row) => paymentId(row)).filter(Boolean),
      paymentRows: rows
    };
  }
  if (order.deliveryCloseout && hasOwnValue(order.deliveryCloseout, 'collectedAmount')) {
    const collectedAmount = requireMoney(order.deliveryCloseout, 'collectedAmount', { label: 'salesOrders.deliveryCloseout', id: orderId(order), code: orderCode(order) }, { nonNegative: true });
    return {
      cashAmount: collectedAmount,
      bankAmount: 0,
      collectedAmount,
      paymentIds: Array.isArray(order.deliveryCloseout.paymentIds) ? order.deliveryCloseout.paymentIds.map(clean).filter(Boolean) : [],
      paymentRows: []
    };
  }
  const breakdown = summarizeCloseoutBreakdownPayments(order);
  if (breakdown.collectedAmount > 0) return breakdown;
  return { cashAmount: 0, bankAmount: 0, collectedAmount: 0, paymentIds: [], paymentRows: [] };
}

function stableHash(payload = {}) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(payload, Object.keys(payload).sort()))
    .digest('hex');
}

function nextVersion(order = {}) {
  const closeout = order.deliveryCloseout || {};
  const versions = Array.isArray(closeout.versions) ? closeout.versions : [];
  const current = Number(closeout.version || versions.length || 0);
  return Math.max(current, versions.length) + 1;
}

function publicCloseoutVersion(closeout = {}) {
  return {
    version: closeout.version,
    originalAmount: closeout.originalAmount,
    deliveredAmount: closeout.deliveredAmount,
    returnedAmount: closeout.returnedAmount,
    cashAmount: closeout.cashAmount || 0,
    bankAmount: closeout.bankAmount || 0,
    collectedAmount: closeout.collectedAmount,
    offsetAmount: closeout.offsetAmount || 0,
    rewardAmount: closeout.rewardAmount || 0,
    rawFinalDebtAmount: closeout.rawFinalDebtAmount,
    finalDebtAmount: closeout.finalDebtAmount,
    returnOrderIds: closeout.returnOrderIds,
    paymentIds: closeout.paymentIds,
    status: closeout.status,
    calculationHash: closeout.calculationHash,
    sourceHash: closeout.sourceHash,
    createdAt: closeout.createdAt,
    createdBy: closeout.createdBy,
    confirmedAt: closeout.confirmedAt,
    confirmedBy: closeout.confirmedBy,
    reason: closeout.reason || '',
    closeoutScope: closeout.closeoutScope,
    closeoutScopeType: closeout.closeoutScopeType,
    closeoutScopeHash: closeout.closeoutScopeHash || closeout.scopeHash,
    scopeHash: closeout.scopeHash || closeout.closeoutScopeHash,
    selectedOrderCodes: Array.isArray(closeout.selectedOrderCodes) ? closeout.selectedOrderCodes : [],
    selectedSalesStaffCodes: Array.isArray(closeout.selectedSalesStaffCodes) ? closeout.selectedSalesStaffCodes : [],
    selectedOrderCount: closeout.selectedOrderCount,
    rebuiltFromSsot: closeout.rebuiltFromSsot === true,
    previousCloseoutMismatches: Array.isArray(closeout.previousCloseoutMismatches) ? closeout.previousCloseoutMismatches : []
  };
}

function buildCloseout(order = {}, returnOrders = [], payments = [], options = {}) {
  const baseAmount = originalAmount(order);
  const returnSummary = summarizeReturnOrders(returnOrders, { order });
  const paymentSummary = summarizePayments(order, payments);
  const offsetSummary = summarizeOffsets(order);
  const deliveredAmount = money(baseAmount - returnSummary.returnedAmount);
  const rewardAmount = money(offsetSummary.rewardAmount || offsetSummary.offsetRows.filter((row) => row.type === 'reward').reduce((sum, row) => sum + money(row.amount), 0));
  const cashAmount = money(paymentSummary.cashAmount || 0);
  const bankAmount = money(paymentSummary.bankAmount || 0);
  const debtCalculation = calculateDeliveryDebtAmount({
    receivableAmount: baseAmount,
    cashAmount,
    bankAmount,
    // rewardAmount trong công thức là toàn bộ TH/cấn trừ đã chuẩn hóa (reward + offset, chống double-count).
    rewardAmount: money(offsetSummary.offsetAmount),
    returnAmount: returnSummary.returnedAmount
  });
  const rawFinalDebtAmount = debtCalculation.rawDebtAmount;
  const finalDebtAmount = debtCalculation.debtAmount;
  const version = options.version || nextVersion(order);
  const now = options.now || dateUtil.nowIso();
  const status = options.status || 'draft';
  const payloadForHash = {
    orderId: orderId(order),
    orderCode: orderCode(order),
    originalAmount: baseAmount,
    deliveredAmount,
    returnedAmount: returnSummary.returnedAmount,
    cashAmount,
    bankAmount,
    collectedAmount: paymentSummary.collectedAmount,
    offsetAmount: offsetSummary.offsetAmount,
    rewardAmount,
    finalDebtAmount,
    rawFinalDebtAmount,
    returnOrderIds: returnSummary.returnOrderIds,
    paymentIds: paymentSummary.paymentIds
  };
  const previousVersions = Array.isArray(order.deliveryCloseout?.versions) ? order.deliveryCloseout.versions : [];
  return {
    originalAmount: baseAmount,
    deliveredAmount,
    returnedAmount: returnSummary.returnedAmount,
    cashAmount,
    bankAmount,
    collectedAmount: paymentSummary.collectedAmount,
    offsetAmount: offsetSummary.offsetAmount,
    rewardAmount,
    finalDebtAmount,
    rawFinalDebtAmount,
    returnOrderIds: returnSummary.returnOrderIds,
    paymentIds: paymentSummary.paymentIds,
    status,
    version,
    versions: previousVersions,
    calculationHash: stableHash(payloadForHash),
    sourceHash: stableHash({
      orderId: orderId(order),
      updatedAt: order.updatedAt || '',
      returnOrderIds: returnSummary.returnOrderIds,
      paymentIds: paymentSummary.paymentIds
    }),
    auditTrail: Array.isArray(order.deliveryCloseout?.auditTrail) ? [...order.deliveryCloseout.auditTrail] : [],
    createdAt: order.deliveryCloseout?.createdAt || now,
    createdBy: order.deliveryCloseout?.createdBy || clean(options.actor || 'system'),
    updatedAt: now,
    updatedBy: clean(options.actor || 'system'),
    reason: clean(options.reason || order.deliveryCloseout?.reason || ''),
    activeReturnOrders: returnSummary.activeReturnOrders,
    paymentRows: paymentSummary.paymentRows,
    offsetRows: offsetSummary.offsetRows
  };
}

function assertNoLedgerShape(closeout = {}) {
  const forbidden = ['debit', 'credit', 'direction', 'amountField', 'active', 'reversed', 'ledgerType', 'category', 'entryType'];
  const found = forbidden.filter((field) => Object.prototype.hasOwnProperty.call(closeout, field));
  if (found.length) {
    throw contractError('DELIVERY_CLOSEOUT_LEDGER_SHAPE_FORBIDDEN', `deliveryCloseout không được chứa field kiểu ledger: ${found.join(', ')}`, { fields: found });
  }
  return true;
}

function validateCanonicalCloseout(closeout = {}, context = {}) {
  assertNoLedgerShape(closeout);
  const order = context.order || {};
  const nonNegativeFields = ['originalAmount', 'returnedAmount', 'cashAmount', 'bankAmount', 'rewardAmount'];
  for (const field of nonNegativeFields) {
    requireMoney(closeout, field, {
      label: 'canonical.deliveryCloseout',
      field,
      orderId: context.orderId || orderId(order),
      orderCode: context.orderCode || orderCode(order)
    }, { nonNegative: true });
  }
  requireMoney(closeout, 'finalDebtAmount', {
    label: 'canonical.deliveryCloseout',
    field: 'finalDebtAmount',
    orderId: context.orderId || orderId(order),
    orderCode: context.orderCode || orderCode(order)
  }, { nonNegative: false });
  return true;
}

function legacyCloseoutMoney(actual = {}, field = '') {
  if (!hasOwnValue(actual, field)) {
    return { ok: false, actual: null, reason: 'missing_required_closeout_field' };
  }
  const raw = actual[field];
  const parsed = parseMoneyValue(raw);
  if (!parsed.ok) {
    return { ok: false, actual: null, rawActual: raw, reason: 'invalid_legacy_closeout_money' };
  }
  const rounded = parsed.amount;
  const nonNegative = field !== 'finalDebtAmount' && field !== 'deliveredAmount';
  if (nonNegative && rounded < 0) {
    return { ok: false, actual: rounded, rawActual: raw, reason: 'legacy_negative_closeout_value' };
  }
  return { ok: true, actual: rounded, rawActual: raw };
}

function compareCloseout(expected = {}, actual = {}, options = {}) {
  if (!actual || typeof actual !== 'object' || !clean(actual.status)) return { ok: true, skipped: true, reason: 'missing_deliveryCloseout' };
  assertNoLedgerShape(actual);
  validateCanonicalCloseout(expected, options);
  const fields = ['originalAmount', 'deliveredAmount', 'returnedAmount', 'collectedAmount', 'finalDebtAmount'];
  const tolerance = Math.max(0, Number(options.tolerance || 0));
  const mismatches = [];
  for (const field of fields) {
    const expectedAmount = field === 'finalDebtAmount' ? normalizeDebtAmount(expected[field]) : money(expected[field]);
    const legacyValue = legacyCloseoutMoney(actual, field);
    if (!legacyValue.ok) {
      mismatches.push({
        field,
        expected: expectedAmount,
        actual: legacyValue.actual,
        ...(Object.prototype.hasOwnProperty.call(legacyValue, 'rawActual') ? { rawActual: legacyValue.rawActual } : {}),
        reason: legacyValue.reason
      });
      continue;
    }
    const actualAmount = field === 'finalDebtAmount' ? normalizeDebtAmount(legacyValue.actual) : legacyValue.actual;
    if (Math.abs(expectedAmount - actualAmount) > tolerance) {
      mismatches.push({ field, expected: expectedAmount, actual: actualAmount, delta: expectedAmount - actualAmount });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

function hasReturnSignalWithoutReturnOrders(order = {}, closeout = {}) {
  const reported = order.deliveryCloseout && hasOwnValue(order.deliveryCloseout, 'reportedReturnedAmount')
    ? requireMoney(order.deliveryCloseout, 'reportedReturnedAmount', { label: 'salesOrders.deliveryCloseout', id: orderId(order), code: orderCode(order) }, { nonNegative: true })
    : 0;
  return reported > 0 && money(closeout.returnedAmount) <= 0 && !(Array.isArray(closeout.returnOrderIds) && closeout.returnOrderIds.length);
}

function confirmCloseout(order = {}, computed = {}, options = {}) {
  assertNoLedgerShape(computed);
  const now = options.now || dateUtil.nowIso();
  const actor = clean(options.actor || 'accountant');
  const snapshot = {
    ...computed,
    status: 'accounting_confirmed',
    confirmedAt: now,
    confirmedBy: actor,
    updatedAt: now,
    updatedBy: actor,
    reason: clean(options.reason || computed.reason || '')
  };
  const versionEntry = publicCloseoutVersion(snapshot);
  const previousVersions = Array.isArray(order.deliveryCloseout?.versions) ? order.deliveryCloseout.versions : [];
  snapshot.versions = [...previousVersions, versionEntry];
  snapshot.auditTrail = [
    ...(Array.isArray(order.deliveryCloseout?.auditTrail) ? order.deliveryCloseout.auditTrail : []),
    {
      action: 'ACCOUNTING_CONFIRM_DELIVERY_CLOSEOUT',
      at: now,
      by: actor,
      version: snapshot.version,
      calculationHash: snapshot.calculationHash
    }
  ];
  delete snapshot.activeReturnOrders;
  delete snapshot.paymentRows;
  delete snapshot.offsetRows;
  return snapshot;
}

module.exports = {
  buildCloseout,
  compareCloseout,
  confirmCloseout,
  validateCanonicalCloseout,
  assertNoLedgerShape,
  collectDeliveryPaymentRows,
  summarizePayments,
  summarizeOffsets,
  summarizeReturnOrders,
  returnOrderAmount,
  isActiveReturnOrder,
  originalAmount,
  orderId,
  orderCode,
  positiveMoney,
  normalizeDebtAmount,
  calculateDeliveryDebtAmount,
  hasReturnSignalWithoutReturnOrders,
  validateSalesOrderContract,
  validateReturnOrderContract,
  validatePaymentContract,
  hasValidReturnInventoryState,
  returnInventoryDiagnostic,
  _internal: {
    money,
    parseMoneyValue,
    requireMoney,
    stableHash,
    publicCloseoutVersion,
    hasOwnValue,
    summarizeCloseoutBreakdownPayments,
    contractError,
    pickMoneyValue,
    summarizeInlineDeliveryPayments,
    inventoryImpactMode,
    hasClearInventoryImpact,
    throwInvalidReturnInventoryState
  }
};
