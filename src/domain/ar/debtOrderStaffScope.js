'use strict';

const { canonicalDebtOrderIdentity, debtOrderAliasKeys } = require('../../utils/debtOrderIdentity.util');

function text(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return text(value).toUpperCase();
}

function normalizeStaffCode(value = '') {
  return text(value).toLowerCase();
}

function exactStaffMatch(actual = '', expected = '') {
  const target = normalizeStaffCode(expected);
  return !target || normalizeStaffCode(actual) === target;
}

function orderScopeIdentity(row = {}) {
  const identity = canonicalDebtOrderIdentity(row);
  const orderKey = text(identity.canonicalOrderKey || row.orderKey || row.sourceId || row.sourceCode || row.id || row.code);
  const customerKey = text(row.customerCode || row.customerId || row.customerName || '(missing)');
  return {
    customerKey,
    orderKey,
    scopeKey: `${customerKey}::${orderKey}`,
    aliases: debtOrderAliasKeys(row)
  };
}

function ownershipRank(row = {}) {
  const category = upper(row.category || row.ledgerType);
  const sourceType = upper(row.sourceType || row.refType || row.source);
  if (category === 'AR-DEBT-OPEN') return 0;
  if (sourceType.includes('DELIVERY_CLOSEOUT') || sourceType.includes('CLOSEOUT')) return 1;
  if (category === 'AR-EXTERNAL' || category === 'AR-EXTERNAL-DEBT') return 2;
  return 10;
}

function ownerCandidate(row = {}, mode = 'sales') {
  const delivery = mode === 'delivery';
  return {
    code: text(delivery
      ? (row.deliveryStaffCode || row.deliveryCode || row.nvghCode)
      : (row.salesStaffCode || row.salesmanCode || row.nvbhCode)),
    name: text(delivery
      ? (row.deliveryStaffName || row.deliveryName || row.nvghName)
      : (row.salesStaffName || row.salesmanName || row.nvbhName)),
    rank: ownershipRank(row),
    date: text(row.date || row.documentDate || row.createdAt),
    ledgerId: text(row.id || row.code || row._id || row.idempotencyKey)
  };
}

function candidateCompare(a = {}, b = {}) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const aHasCode = a.code ? 0 : 1;
  const bHasCode = b.code ? 0 : 1;
  if (aHasCode !== bHasCode) return aHasCode - bHasCode;
  const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
  if (dateCompare) return dateCompare;
  return String(a.ledgerId || '').localeCompare(String(b.ledgerId || ''));
}

function chooseCanonicalOwner(candidates = []) {
  const eligible = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => text(candidate.code || candidate.name))
    .sort(candidateCompare);
  const selected = eligible[0] || { code: '', name: '', rank: 99, date: '', ledgerId: '' };
  const distinctCodes = Array.from(new Set(eligible.map((row) => normalizeStaffCode(row.code)).filter(Boolean)));
  return {
    ...selected,
    conflict: distinctCodes.length > 1,
    conflictingCodes: distinctCodes
  };
}

function resolveCanonicalOrderStaffOwnership(ledgers = []) {
  const buckets = new Map();
  for (const row of Array.isArray(ledgers) ? ledgers : []) {
    const identity = orderScopeIdentity(row);
    if (!identity.orderKey) continue;
    if (!buckets.has(identity.scopeKey)) {
      buckets.set(identity.scopeKey, {
        scopeKey: identity.scopeKey,
        customerKey: identity.customerKey,
        orderKey: identity.orderKey,
        aliases: new Set(),
        salesCandidates: [],
        deliveryCandidates: []
      });
    }
    const bucket = buckets.get(identity.scopeKey);
    for (const alias of identity.aliases) bucket.aliases.add(alias);
    bucket.salesCandidates.push(ownerCandidate(row, 'sales'));
    bucket.deliveryCandidates.push(ownerCandidate(row, 'delivery'));
  }

  const result = new Map();
  for (const bucket of buckets.values()) {
    result.set(bucket.scopeKey, {
      scopeKey: bucket.scopeKey,
      customerKey: bucket.customerKey,
      orderKey: bucket.orderKey,
      aliases: Array.from(bucket.aliases),
      sales: chooseCanonicalOwner(bucket.salesCandidates),
      delivery: chooseCanonicalOwner(bucket.deliveryCandidates)
    });
  }
  return result;
}

function orderMatchesStaffScope(order = {}, query = {}) {
  const expectedSales = text(query.salesStaffCode || query.salesmanCode || query.nvbhCode || query.salesman);
  const expectedDelivery = text(query.deliveryStaffCode || query.deliveryCode || query.nvghCode || query.delivery);
  return exactStaffMatch(order.salesStaffCode, expectedSales)
    && exactStaffMatch(order.deliveryStaffCode, expectedDelivery);
}

function stripStaffScopeFilters(filters = {}) {
  const output = { ...filters };
  for (const key of [
    'salesStaffCode', 'salesmanCode', 'nvbhCode', 'salesman', 'salesStaffName', 'salesmanName',
    'deliveryStaffCode', 'deliveryCode', 'nvghCode', 'delivery', 'deliveryStaffName', 'deliveryName'
  ]) delete output[key];
  return output;
}

module.exports = {
  normalizeStaffCode,
  exactStaffMatch,
  orderScopeIdentity,
  ownershipRank,
  chooseCanonicalOwner,
  resolveCanonicalOrderStaffOwnership,
  orderMatchesStaffScope,
  stripStaffScopeFilters,
  _private: { ownerCandidate, candidateCompare }
};
