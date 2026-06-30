'use strict';

const crypto = require('node:crypto');
const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');

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

function positiveMoney(value) {
  return Math.max(0, money(value));
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
  const raw = Number(toNumber(source[field]));
  if (!Number.isFinite(raw)) {
    throw contractError('CONTRACT_VALIDATION_ERROR', `${context.label || 'document'} field ${field} không phải số hợp lệ`, { field, value: source[field], context });
  }
  const rounded = Math.round(raw);
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

function validateReturnOrderContract(row = {}) {
  const id = clean(row.id || row._id);
  const code = clean(row.code);
  if (!id && !code) {
    throw contractError('CONTRACT_VALIDATION_ERROR', 'returnOrders phải có id hoặc code rõ ràng.', { document: 'returnOrders' });
  }
  const hasSource = clean(row.sourceOrderId || row.salesOrderId || row.sourceOrderCode);
  if (!hasSource) {
    throw contractError('CONTRACT_VALIDATION_ERROR', 'returnOrders phải có sourceOrderId hoặc salesOrderId hoặc sourceOrderCode.', { document: 'returnOrders', id, code });
  }
  const status = requireText(row, 'status', { label: 'returnOrders', id, code }).toLowerCase();
  if (!INACTIVE_RETURN_STATUSES.has(status)) {
    requireMoney(row, 'totalReturnAmount', { label: 'returnOrders', id, code }, { nonNegative: false });
    if (CONFIRMED_RETURN_STATUSES.has(status) && row.inventoryPosted !== true && !clean(row.inventoryImpact)) {
      throw contractError('CONTRACT_VALIDATION_ERROR', 'returnOrders đã xác nhận phải có inventoryPosted=true hoặc inventoryImpact rõ ràng.', { document: 'returnOrders', id, code, status });
    }
  }
  return true;
}

function returnOrderAmount(row = {}) {
  validateReturnOrderContract(row);
  if (!isActiveReturnOrder(row)) return 0;
  return requireMoney(row, 'totalReturnAmount', { label: 'returnOrders', id: clean(row.id || row._id), code: clean(row.code) }, { nonNegative: false });
}

function summarizeReturnOrders(returnOrders = []) {
  const activeRows = [];
  for (const row of Array.isArray(returnOrders) ? returnOrders : []) {
    validateReturnOrderContract(row);
    if (isActiveReturnOrder(row)) activeRows.push(row);
  }
  return {
    returnedAmount: activeRows.reduce((sum, row) => sum + returnOrderAmount(row), 0),
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

function summarizePayments(order = {}, explicitPayments = []) {
  const rows = collectDeliveryPaymentRows(order, explicitPayments);
  if (rows.length > 0) {
    return {
      collectedAmount: rows.reduce((sum, row) => sum + paymentAmount(row), 0),
      paymentIds: rows.map((row) => paymentId(row)).filter(Boolean),
      paymentRows: rows
    };
  }
  if (order.deliveryCloseout && hasOwnValue(order.deliveryCloseout, 'collectedAmount')) {
    const collectedAmount = requireMoney(order.deliveryCloseout, 'collectedAmount', { label: 'salesOrders.deliveryCloseout', id: orderId(order), code: orderCode(order) }, { nonNegative: true });
    return {
      collectedAmount,
      paymentIds: Array.isArray(order.deliveryCloseout.paymentIds) ? order.deliveryCloseout.paymentIds.map(clean).filter(Boolean) : [],
      paymentRows: []
    };
  }
  return { collectedAmount: 0, paymentIds: [], paymentRows: [] };
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
    collectedAmount: closeout.collectedAmount,
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
    reason: closeout.reason || ''
  };
}

function buildCloseout(order = {}, returnOrders = [], payments = [], options = {}) {
  const baseAmount = originalAmount(order);
  const returnSummary = summarizeReturnOrders(returnOrders);
  const paymentSummary = summarizePayments(order, payments);
  const deliveredAmount = money(baseAmount - returnSummary.returnedAmount);
  const finalDebtAmount = money(baseAmount - returnSummary.returnedAmount - paymentSummary.collectedAmount);
  const version = options.version || nextVersion(order);
  const now = options.now || dateUtil.nowIso();
  const status = options.status || 'draft';
  const payloadForHash = {
    orderId: orderId(order),
    orderCode: orderCode(order),
    originalAmount: baseAmount,
    deliveredAmount,
    returnedAmount: returnSummary.returnedAmount,
    collectedAmount: paymentSummary.collectedAmount,
    finalDebtAmount,
    returnOrderIds: returnSummary.returnOrderIds,
    paymentIds: paymentSummary.paymentIds
  };
  const previousVersions = Array.isArray(order.deliveryCloseout?.versions) ? order.deliveryCloseout.versions : [];
  return {
    originalAmount: baseAmount,
    deliveredAmount,
    returnedAmount: returnSummary.returnedAmount,
    collectedAmount: paymentSummary.collectedAmount,
    finalDebtAmount,
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
    activeReturnOrders: returnSummary.activeReturnOrders,
    paymentRows: paymentSummary.paymentRows
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

function compareCloseout(expected = {}, actual = {}, options = {}) {
  if (!actual || typeof actual !== 'object' || !clean(actual.status)) return { ok: true, skipped: true, reason: 'missing_deliveryCloseout' };
  assertNoLedgerShape(actual);
  const fields = ['originalAmount', 'deliveredAmount', 'returnedAmount', 'collectedAmount', 'finalDebtAmount'];
  const tolerance = Math.max(0, Number(options.tolerance || 0));
  const mismatches = [];
  for (const field of fields) {
    if (!hasOwnValue(actual, field)) {
      mismatches.push({ field, expected: money(expected[field]), actual: null, reason: 'missing_required_closeout_field' });
      continue;
    }
    const expectedAmount = money(expected[field]);
    const actualAmount = requireMoney(actual, field, { label: 'salesOrders.deliveryCloseout' }, { nonNegative: field !== 'finalDebtAmount' && field !== 'deliveredAmount' });
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
    updatedBy: actor
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
  return snapshot;
}

module.exports = {
  buildCloseout,
  compareCloseout,
  confirmCloseout,
  assertNoLedgerShape,
  collectDeliveryPaymentRows,
  summarizePayments,
  summarizeReturnOrders,
  returnOrderAmount,
  isActiveReturnOrder,
  originalAmount,
  orderId,
  orderCode,
  positiveMoney,
  hasReturnSignalWithoutReturnOrders,
  validateSalesOrderContract,
  validateReturnOrderContract,
  validatePaymentContract,
  _internal: {
    money,
    requireMoney,
    stableHash,
    publicCloseoutVersion,
    hasOwnValue,
    contractError
  }
};
