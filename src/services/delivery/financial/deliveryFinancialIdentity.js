'use strict';

const ID_FIELDS = Object.freeze([
  'id', '_id', 'orderId', 'salesOrderId', 'sourceOrderId', 'deliveryOrderId',
  'originalCloseoutId', 'sourceId'
]);
const CODE_FIELDS = Object.freeze([
  'code', 'orderCode', 'salesOrderCode', 'sourceOrderCode', 'deliveryOrderCode',
  'originalCloseoutCode', 'documentCode', 'invoiceCode', 'sourceCode'
]);

function text(value = '') {
  return String(value ?? '').trim();
}

function tenantIdOf(row = {}) {
  return text(row.tenantId || row.tenant || row.organizationId || row.companyId);
}

function typedIdentityEntries(row = {}) {
  const entries = [];
  for (const field of ID_FIELDS) {
    const value = text(row[field]);
    if (value) entries.push({ type: 'id', field, value, key: `id:${value}` });
  }
  for (const field of CODE_FIELDS) {
    const value = text(row[field]);
    if (value) entries.push({ type: 'code', field, value, key: `code:${value}` });
  }
  const seen = new Set();
  return entries.filter((entry) => {
    if (seen.has(entry.key)) return false;
    seen.add(entry.key);
    return true;
  });
}

function typedIdentityKeys(row = {}) {
  return typedIdentityEntries(row).map((entry) => entry.key);
}

function rawIdentityValues(row = {}) {
  return Array.from(new Set(typedIdentityEntries(row).map((entry) => entry.value)));
}

function strongIdentityKey(row = {}) {
  const entries = typedIdentityEntries(row);
  const id = entries.find((entry) => entry.type === 'id');
  return (id || entries[0] || {}).key || '';
}

function candidateIdentityKey(row = {}, fallbackIndex = 0) {
  const tenant = tenantIdOf(row);
  const ownDocumentIdentity = text(
    row._id || row.id || row.allocationCode || row.closeoutCode
    || row.correctionId || row.correctionCode || row.returnOrderId || row.code
  );
  if (ownDocumentIdentity) {
    return `${tenant ? `tenant:${tenant}|` : ''}document:${ownDocumentIdentity}`;
  }
  // A candidate without its own document identity must not be silently collapsed with
  // another row that merely points at the same order. Preserve the row index so the
  // resolver can flag the ambiguity instead of selecting the first candidate.
  const strong = strongIdentityKey(row);
  return `${tenant ? `tenant:${tenant}|` : ''}${strong || 'anonymous'}|row:${fallbackIndex}`;
}

function assertOrderBatch(orders = [], options = {}) {
  const maxOrders = Number.isFinite(Number(options.maxOrders)) ? Number(options.maxOrders) : 1000;
  if (!Array.isArray(orders)) {
    const err = new TypeError('orders phải là một mảng');
    err.code = 'CANONICAL_FINANCIAL_ORDERS_NOT_ARRAY';
    throw err;
  }
  if (orders.length > maxOrders) {
    const err = new Error(`Canonical financial batch vượt giới hạn ${maxOrders} orders`);
    err.code = 'CANONICAL_FINANCIAL_BATCH_TOO_LARGE';
    err.orderCount = orders.length;
    err.maxOrders = maxOrders;
    throw err;
  }
  const owners = new Map();
  orders.forEach((order, index) => {
    for (const entry of typedIdentityEntries(order)) {
      // Duplicate codes are unsafe. Duplicate IDs are also unsafe unless the exact same
      // object occurs twice, which is still treated as a caller error.
      if (owners.has(entry.key)) {
        const err = new Error(`Duplicate canonical order identity: ${entry.key}`);
        err.code = 'CANONICAL_FINANCIAL_DUPLICATE_ORDER_IDENTITY';
        err.identityKey = entry.key;
        err.firstIndex = owners.get(entry.key);
        err.secondIndex = index;
        throw err;
      }
      owners.set(entry.key, index);
    }
  });
  return true;
}

function tenantCompatible(order = {}, candidate = {}) {
  const orderTenant = tenantIdOf(order);
  const candidateTenant = tenantIdOf(candidate);
  if (!orderTenant || !candidateTenant) return true;
  return orderTenant === candidateTenant;
}

function buildCandidateIndex(rows = []) {
  const byTypedKey = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const candidateKey = candidateIdentityKey(row, index);
    for (const identityKey of typedIdentityKeys(row)) {
      const current = byTypedKey.get(identityKey) || [];
      current.push({ row, candidateKey, index });
      byTypedKey.set(identityKey, current);
    }
  });
  return byTypedKey;
}

function candidatesForOrder(order = {}, candidateIndex = new Map()) {
  const unique = new Map();
  for (const key of typedIdentityKeys(order)) {
    for (const candidate of candidateIndex.get(key) || []) {
      if (!tenantCompatible(order, candidate.row)) continue;
      if (!unique.has(candidate.candidateKey)) unique.set(candidate.candidateKey, candidate.row);
    }
  }
  return Array.from(unique.values());
}

module.exports = {
  ID_FIELDS,
  CODE_FIELDS,
  text,
  tenantIdOf,
  typedIdentityEntries,
  typedIdentityKeys,
  rawIdentityValues,
  strongIdentityKey,
  candidateIdentityKey,
  assertOrderBatch,
  tenantCompatible,
  buildCandidateIndex,
  candidatesForOrder
};
