'use strict';

const INACTIVE_STATUSES = new Set([
  'void',
  'voided',
  'cancelled',
  'canceled',
  'deleted',
  'removed',
  'reversed',
  'superseded'
]);

function clean(value = '') {
  return String(value || '').trim();
}

function upper(value = '') {
  return clean(value).toUpperCase();
}

function lower(value = '') {
  return clean(value).toLowerCase();
}

function toNumber(value = 0) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function isActiveLedger(row = {}) {
  const status = lower(row.status || row.lifecycleStatus || row.accountingStatus);
  if (status && INACTIVE_STATUSES.has(status)) return false;
  if (row.isDeleted === true || row.deleted === true || row.reversed === true) return false;
  return true;
}

function sourceIdentity(row = {}) {
  const sourceId = clean(row.sourceId || row.refId || row.orderId || row.salesOrderId || row.returnOrderId || row.transferId || row.id);
  const sourceCode = clean(row.sourceCode || row.refCode || row.orderCode || row.salesOrderCode || row.returnOrderCode || row.code);
  return {
    sourceType: clean(row.sourceType || row.refType || row.source || row.category || row.type),
    sourceId,
    sourceCode,
    customerCode: clean(row.customerCode),
    productCode: clean(row.productCode)
  };
}

function arEffect(row = {}) {
  if (!isActiveLedger(row)) return 0;
  const category = upper(row.category || row.ledgerType || row.type);
  const debit = toNumber(row.debit ?? row.arDebit);
  const credit = toNumber(row.credit ?? row.arCredit);

  if (category === 'AR-SALE' || category === 'AR-RETURN-REVERSAL' || category === 'AR-RECEIPT-REVERSAL') {
    return debit || toNumber(row.amount);
  }
  if (category === 'AR-RETURN' || category === 'AR-RECEIPT') {
    return -(credit || toNumber(row.amount));
  }
  return debit - credit;
}

function fundEffect(row = {}) {
  if (!isActiveLedger(row)) return 0;
  const amount = toNumber(row.amount);
  const direction = lower(row.direction || row.fundDirection);
  if (direction === 'in' || direction === 'cash_in') return amount;
  if (direction === 'out' || direction === 'cash_out') return -amount;
  return toNumber(row.inAmount || row.debit) - toNumber(row.outAmount || row.credit);
}

function stockEffect(row = {}) {
  if (!isActiveLedger(row)) return 0;
  if (row.signedQuantity !== undefined) return toNumber(row.signedQuantity);
  if (row.qtyChange !== undefined) return toNumber(row.qtyChange);
  const qty = toNumber(row.quantity ?? row.qty ?? row.baseQty);
  const direction = upper(row.direction || row.movementDirection);
  return direction === 'OUT' ? -Math.abs(qty) : Math.abs(qty);
}

function activeRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => isActiveLedger(row));
}

function duplicateIdempotencyKeys(rows = []) {
  const counts = new Map();
  for (const row of activeRows(rows)) {
    const key = clean(row.idempotencyKey);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key);
}

function sumBy(rows = [], effectFn = () => 0, predicate = () => true) {
  return activeRows(rows).filter(predicate).reduce((sum, row) => sum + effectFn(row), 0);
}

function stockQuantityByProduct(rows = []) {
  const result = new Map();
  for (const row of activeRows(rows)) {
    const productCode = clean(row.productCode || row.productId || row.sku);
    if (!productCode) continue;
    result.set(productCode, (result.get(productCode) || 0) + stockEffect(row));
  }
  return result;
}

function requireNoDuplicateIdempotency(rows = [], label = 'ledger') {
  const duplicates = duplicateIdempotencyKeys(rows);
  if (duplicates.length) {
    const err = new Error(`${label} has duplicate idempotency keys: ${duplicates.join(', ')}`);
    err.code = 'CROSS_LEDGER_DUPLICATE_IDEMPOTENCY';
    err.duplicates = duplicates;
    throw err;
  }
  return true;
}

module.exports = {
  INACTIVE_STATUSES,
  clean,
  toNumber,
  isActiveLedger,
  sourceIdentity,
  arEffect,
  fundEffect,
  stockEffect,
  activeRows,
  duplicateIdempotencyKeys,
  requireNoDuplicateIdempotency,
  sumBy,
  stockQuantityByProduct
};
