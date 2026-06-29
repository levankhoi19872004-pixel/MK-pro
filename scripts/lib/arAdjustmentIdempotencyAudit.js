'use strict';

const LEDGER_TYPE = 'AR-ADJUSTMENT';
const INACTIVE_STATUSES = new Set(['void', 'reversed', 'cancelled', 'canceled', 'deleted', 'removed']);

function clean(value = '') {
  return String(value ?? '').trim();
}

function lower(value = '') {
  return clean(value).toLowerCase();
}

function isArAdjustmentLedger(row = {}) {
  return clean(row.type) === LEDGER_TYPE
    || clean(row.ledgerType) === LEDGER_TYPE
    || clean(row.category) === LEDGER_TYPE
    || /^ARADJ/i.test(clean(row.code || row.id));
}

function isInactive(row = {}) {
  const statuses = [row.status, row.accountingStatus, row.lifecycleStatus].map(lower).filter(Boolean);
  return row.isDeleted === true || row.reversed === true || Boolean(row.deletedAt)
    || statuses.some((status) => INACTIVE_STATUSES.has(status));
}

function arAdjustmentLedgerQuery() {
  return {
    $or: [
      { type: LEDGER_TYPE },
      { ledgerType: LEDGER_TYPE },
      { category: LEDGER_TYPE },
      { code: /^ARADJ/ }
    ]
  };
}

function groupBy(rows = [], keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = clean(keyFn(row));
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function pick(row = {}) {
  return {
    _id: clean(row._id),
    id: clean(row.id),
    code: clean(row.code),
    type: clean(row.type),
    status: clean(row.status),
    customerCode: clean(row.customerCode),
    amount: row.amount,
    sourceType: clean(row.sourceType),
    sourceId: clean(row.sourceId),
    correctionId: clean(row.correctionId),
    correctionCode: clean(row.correctionCode),
    idempotencyKey: clean(row.idempotencyKey),
    isRollback: row.isRollback === true,
    rollbackOf: clean(row.rollbackOf)
  };
}

function duplicateCases(map, issue, severity = 'P0') {
  const cases = [];
  for (const [key, rows] of map.entries()) {
    if (rows.length <= 1) continue;
    cases.push({ severity, issue, key, count: rows.length, examples: rows.slice(0, 10).map(pick) });
  }
  return cases;
}

function countDuplicateGroups(map) {
  let count = 0;
  for (const rows of map.values()) if (rows.length > 1) count += 1;
  return count;
}

function summarizeArAdjustmentIdempotency(rows = []) {
  const adjustmentRows = (rows || []).filter(isArAdjustmentLedger);
  const activeRows = adjustmentRows.filter((row) => !isInactive(row));
  const missingIdempotencyKey = adjustmentRows.filter((row) => !clean(row.idempotencyKey));
  const missingSource = adjustmentRows.filter((row) => !clean(row.sourceType) || !clean(row.sourceId));
  const missingCorrection = adjustmentRows.filter((row) => !clean(row.correctionId) && !clean(row.sourceId));
  const missingReason = adjustmentRows.filter((row) => !clean(row.reasonCode) || !clean(row.reasonText || row.note));
  const nonAdminSource = adjustmentRows.filter((row) => {
    const src = lower(row.sourceType).replace(/[_-]+/g, '');
    return src && src !== 'admincorrection';
  });

  const duplicateIdempotency = groupBy(activeRows, (row) => row.idempotencyKey);
  const duplicateCorrection = groupBy(activeRows, (row) => row.correctionId || row.sourceId);
  const duplicateSource = groupBy(activeRows, (row) => {
    const sourceType = clean(row.sourceType);
    const sourceId = clean(row.sourceId);
    return sourceType && sourceId ? `${sourceType}:${sourceId}` : '';
  });

  const p0Cases = [
    ...duplicateCases(duplicateIdempotency, 'duplicate_active_idempotencyKey'),
    ...duplicateCases(duplicateCorrection, 'duplicate_active_correctionId'),
    ...duplicateCases(duplicateSource, 'duplicate_active_sourceType_sourceId'),
    ...missingIdempotencyKey.map((row) => ({ severity: 'P0', issue: 'missing_idempotencyKey', key: clean(row.code || row.id || row._id), count: 1, examples: [pick(row)] })),
    ...missingSource.map((row) => ({ severity: 'P0', issue: 'missing_sourceType_or_sourceId', key: clean(row.code || row.id || row._id), count: 1, examples: [pick(row)] })),
    ...missingCorrection.map((row) => ({ severity: 'P0', issue: 'missing_correctionId', key: clean(row.code || row.id || row._id), count: 1, examples: [pick(row)] })),
    ...missingReason.map((row) => ({ severity: 'P1', issue: 'missing_reasonCode_or_reasonText', key: clean(row.code || row.id || row._id), count: 1, examples: [pick(row)] })),
    ...nonAdminSource.map((row) => ({ severity: 'P1', issue: 'non_adminCorrection_sourceType', key: clean(row.code || row.id || row._id), count: 1, examples: [pick(row)] }))
  ];

  return {
    generatedAt: new Date().toISOString(),
    canonical: { type: LEDGER_TYPE, sourceType: 'adminCorrection' },
    totals: {
      arAdjustment: adjustmentRows.length,
      activeArAdjustment: activeRows.length,
      missingIdempotencyKey: missingIdempotencyKey.length,
      missingSourceTypeOrSourceId: missingSource.length,
      missingCorrectionId: missingCorrection.length,
      missingReasonCodeOrReasonText: missingReason.length,
      nonAdminCorrectionSourceType: nonAdminSource.length,
      duplicateActiveIdempotencyKeyGroups: countDuplicateGroups(duplicateIdempotency),
      duplicateActiveCorrectionIdGroups: countDuplicateGroups(duplicateCorrection),
      duplicateActiveSourceGroups: countDuplicateGroups(duplicateSource),
      p0Cases: p0Cases.filter((item) => item.severity === 'P0').length,
      p1Cases: p0Cases.filter((item) => item.severity !== 'P0').length
    },
    p0Cases
  };
}

function hasBlockingIssues(summary = {}) {
  const totals = summary.totals || {};
  return Boolean(
    totals.missingIdempotencyKey
    || totals.missingSourceTypeOrSourceId
    || totals.missingCorrectionId
    || totals.duplicateActiveIdempotencyKeyGroups
    || totals.duplicateActiveCorrectionIdGroups
    || totals.duplicateActiveSourceGroups
  );
}

module.exports = {
  LEDGER_TYPE,
  arAdjustmentLedgerQuery,
  isArAdjustmentLedger,
  summarizeArAdjustmentIdempotency,
  hasBlockingIssues
};
