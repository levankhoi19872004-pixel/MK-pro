'use strict';

const {
  normalizeIdempotencyKey,
  buildFinancialPayload,
  payloadHash
} = require('../../src/domain/ar/arLedgerIdempotencyGuard');

function text(value = '') {
  return String(value ?? '').trim();
}

function ledgerId(row = {}) {
  return text(row.id || row.code || row._id || '(unknown)');
}

function createAccumulator() {
  return {
    scannedRows: 0,
    nonEmptyKeys: 0,
    emptyKeys: [],
    malformedKeys: [],
    groups: new Map()
  };
}

function addRow(acc, row = {}) {
  acc.scannedRows += 1;
  const rawKey = typeof row.idempotencyKey === 'string' ? row.idempotencyKey : '';
  if (!rawKey.trim()) {
    if (acc.emptyKeys.length < 50) acc.emptyKeys.push({ ledgerId: ledgerId(row), rawKey });
    return;
  }
  acc.nonEmptyKeys += 1;

  let normalizedKey;
  let financialPayload;
  let hash;
  try {
    normalizedKey = normalizeIdempotencyKey(rawKey);
    financialPayload = buildFinancialPayload({ ...row, idempotencyKey: normalizedKey });
    hash = payloadHash({ ...row, idempotencyKey: normalizedKey });
  } catch (error) {
    if (acc.malformedKeys.length < 100) {
      acc.malformedKeys.push({ ledgerId: ledgerId(row), rawKey, code: error.code || 'INVALID_KEY', message: error.message });
    }
    return;
  }

  if (!acc.groups.has(normalizedKey)) {
    acc.groups.set(normalizedKey, {
      normalizedKey,
      count: 0,
      rawKeys: new Set(),
      payloadHashes: new Map(),
      examples: []
    });
  }
  const group = acc.groups.get(normalizedKey);
  group.count += 1;
  group.rawKeys.add(rawKey);
  if (!group.payloadHashes.has(hash)) group.payloadHashes.set(hash, financialPayload);
  if (group.examples.length < 10) {
    group.examples.push({ ledgerId: ledgerId(row), rawKey, payloadHash: hash });
  }
}

function finalizeAudit(acc) {
  const duplicateGroups = [];
  const conflictingPayloadGroups = [];
  const normalizedVariantGroups = [];

  for (const group of acc.groups.values()) {
    const output = {
      normalizedKey: group.normalizedKey,
      count: group.count,
      rawKeys: Array.from(group.rawKeys).sort(),
      payloadHashes: Array.from(group.payloadHashes.keys()).sort(),
      examples: group.examples
    };
    if (group.count > 1) duplicateGroups.push(output);
    if (group.payloadHashes.size > 1) conflictingPayloadGroups.push(output);
    if (group.rawKeys.size > 1) normalizedVariantGroups.push(output);
  }

  duplicateGroups.sort((a, b) => b.count - a.count || a.normalizedKey.localeCompare(b.normalizedKey));
  conflictingPayloadGroups.sort((a, b) => a.normalizedKey.localeCompare(b.normalizedKey));
  normalizedVariantGroups.sort((a, b) => a.normalizedKey.localeCompare(b.normalizedKey));

  const blockers = {
    duplicateGroups: duplicateGroups.length,
    conflictingPayloadGroups: conflictingPayloadGroups.length,
    normalizedVariantGroups: normalizedVariantGroups.length,
    malformedKeys: acc.malformedKeys.length
  };
  return {
    clean: Object.values(blockers).every((value) => value === 0),
    totals: {
      scannedRows: acc.scannedRows,
      nonEmptyKeys: acc.nonEmptyKeys,
      uniqueNormalizedKeys: acc.groups.size,
      emptyKeyRows: acc.emptyKeys.length,
      ...blockers
    },
    blockers,
    duplicateGroups,
    conflictingPayloadGroups,
    normalizedVariantGroups,
    malformedKeys: acc.malformedKeys,
    emptyKeys: acc.emptyKeys,
    policy: {
      mutatesData: false,
      automaticallyDeletesOrMerges: false,
      emptyKeysExcludedFromUniquePartialIndex: true
    }
  };
}

function summarizeRows(rows = []) {
  const acc = createAccumulator();
  for (const row of rows) addRow(acc, row);
  return finalizeAudit(acc);
}

async function auditCursor(cursor) {
  const acc = createAccumulator();
  for await (const row of cursor) addRow(acc, row);
  return finalizeAudit(acc);
}

module.exports = {
  createAccumulator,
  addRow,
  finalizeAudit,
  summarizeRows,
  auditCursor
};
