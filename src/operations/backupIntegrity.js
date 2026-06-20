'use strict';

const crypto = require('crypto');

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isActive(row = {}) {
  const status = String(row.status || '').toLowerCase();
  return row.isDeleted !== true && !['deleted', 'cancelled', 'reversed', 'void'].includes(status);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (!['_id', '__v'].includes(key)) result[key] = stable(value[key]);
    return result;
  }, {});
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function canonicalCollection(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => stable(row))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function canonicalBackupData(data = {}) {
  return Object.keys(data).sort().reduce((result, key) => {
    result[key] = canonicalCollection(data[key]);
    return result;
  }, {});
}

function collectionDigests(data = {}) {
  const canonical = canonicalBackupData(data);
  return Object.fromEntries(Object.keys(canonical).map((key) => [key, digest(canonical[key])]));
}

function technicalTotals(data = {}) {
  const inventories = (data.inventories || []).filter(isActive);
  const arLedgers = (data.arLedgers || []).filter(isActive);
  const fundLedgers = (data.fundLedgers || []).filter(isActive);
  return {
    inventoryQuantityTotal: inventories.reduce((sum, row) => sum + number(row.onHand ?? row.availableQty ?? row.qty ?? row.quantity), 0),
    arBalanceTotal: arLedgers.reduce((sum, row) => sum + number(row.debit) - number(row.credit), 0),
    fundBalanceTotal: fundLedgers.reduce((sum, row) => {
      const amount = number(row.amount);
      return sum + (String(row.direction || '').toLowerCase() === 'out' ? -amount : amount);
    }, 0),
    salesOrderCount: Array.isArray(data.salesOrders) ? data.salesOrders.length : 0,
    masterOrderCount: Array.isArray(data.masterOrders) ? data.masterOrders.length : 0,
    returnOrderCount: Array.isArray(data.returnOrders) ? data.returnOrders.length : 0,
    inventoryRowCount: inventories.length,
    arLedgerRowCount: arLedgers.length,
    fundLedgerRowCount: fundLedgers.length
  };
}

function buildBackupIntegrity(data = {}) {
  const digests = collectionDigests(data);
  return {
    algorithm: 'sha256',
    dataSha256: digest(canonicalBackupData(data)),
    collectionDigests: digests,
    collectionDigestsSha256: digest(digests),
    technicalTotals: technicalTotals(data),
    note: 'Technical restore controls only; not a replacement for domain reconciliation reports.'
  };
}

function compareBackupIntegrity(expected = {}, data = {}) {
  const actual = buildBackupIntegrity(data);
  const mismatches = [];
  if (expected.dataSha256 && expected.dataSha256 !== actual.dataSha256) mismatches.push('dataSha256');
  if (expected.collectionDigestsSha256 && expected.collectionDigestsSha256 !== actual.collectionDigestsSha256) mismatches.push('collectionDigestsSha256');
  if (expected.technicalTotals) {
    for (const [key, value] of Object.entries(expected.technicalTotals)) {
      if (Number(value) !== Number(actual.technicalTotals[key])) mismatches.push(`technicalTotals.${key}`);
    }
  }
  return { ok: mismatches.length === 0, mismatches, actual };
}

module.exports = {
  stable,
  digest,
  canonicalCollection,
  canonicalBackupData,
  collectionDigests,
  technicalTotals,
  buildBackupIntegrity,
  compareBackupIntegrity
};
