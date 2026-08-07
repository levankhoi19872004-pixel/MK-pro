'use strict';

const OMIT_KEYS = new Set(['_id', 'createdAt', 'updatedAt', 'startedAt', 'finishedAt']);

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter((key) => !OMIT_KEYS.has(key)).map((key) => [key, stableSortObject(value[key])]));
}

function normalizeLedgerOrder(ledgers = []) {
  return [...ledgers].map(stableSortObject).sort((left, right) => {
    const a = `${left.idempotencyKey || ''}|${left.category || ''}|${left.orderCode || ''}`;
    const b = `${right.idempotencyKey || ''}|${right.category || ''}|${right.orderCode || ''}`;
    return a.localeCompare(b);
  });
}

function normalizeSnapshot(snapshot = {}) {
  const next = stableSortObject(snapshot);
  if (Array.isArray(next.arLedger)) next.arLedger = normalizeLedgerOrder(next.arLedger);
  if (Array.isArray(next.results)) next.results = next.results.map(stableSortObject);
  return next;
}

module.exports = { normalizeSnapshot, stableSortObject, normalizeLedgerOrder };
