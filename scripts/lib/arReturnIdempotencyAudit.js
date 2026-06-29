'use strict';

const AR_RETURN_TYPE = 'ar_return';
const AR_RETURN_LEDGER_TYPE = 'AR-RETURN';
const CANONICAL_SOURCE_TYPE = 'returnOrder';
const INACTIVE_STATUSES = new Set(['void', 'reversed', 'cancelled', 'canceled', 'deleted', 'removed', 'duplicate_cancelled', 'cleared']);

function clean(value = '') {
  return String(value || '').trim();
}

function lower(value = '') {
  return clean(value).toLowerCase();
}

function isArReturnReversalLedger(row = {}) {
  return lower(row.type) === 'ar_return_reversal'
    || lower(row.entryType) === 'reversal'
    || lower(row.sourceAction) === 'reverse'
    || clean(row.ledgerType) === 'AR-RETURN-REVERSAL'
    || clean(row.category) === 'AR-RETURN-REVERSAL'
    || clean(row.refType) === 'AR_LEDGER_REVERSAL';
}

function isArReturnLedger(row = {}) {
  if (isArReturnReversalLedger(row)) return false;
  return lower(row.type) === AR_RETURN_TYPE
    || clean(row.type) === AR_RETURN_LEDGER_TYPE
    || clean(row.ledgerType) === AR_RETURN_LEDGER_TYPE
    || clean(row.category) === AR_RETURN_LEDGER_TYPE
    || /^AR-RETURN-/i.test(clean(row.code || row.id));
}

function isInactiveArReturnLedger(row = {}) {
  const statuses = [row.status, row.accountingStatus, row.lifecycleStatus]
    .map(lower)
    .filter(Boolean);
  return Boolean(row.reversed === true || row.isDeleted === true || row.deletedAt)
    || statuses.some((status) => INACTIVE_STATUSES.has(status));
}

function arReturnLedgerQuery() {
  return {
    entryType: { $ne: 'reversal' },
    sourceAction: { $ne: 'reverse' },
    refType: { $ne: 'AR_LEDGER_REVERSAL' },
    type: { $nin: ['ar_return_reversal', 'ar_sale_reversal', 'ar_receipt_reversal', 'ar_reversal', 'reversal', 'ar_void'] },
    ledgerType: { $nin: ['AR-RETURN-REVERSAL', 'AR-SALE-REVERSAL', 'AR-RECEIPT-REVERSAL'] },
    category: { $nin: ['AR-RETURN-REVERSAL', 'AR-SALE-REVERSAL', 'AR-RECEIPT-REVERSAL'] },
    $or: [
      { type: AR_RETURN_TYPE },
      { type: AR_RETURN_LEDGER_TYPE },
      { ledgerType: AR_RETURN_LEDGER_TYPE },
      { category: AR_RETURN_LEDGER_TYPE },
      { code: /^AR-RETURN-/ }
    ]
  };
}

function groupBy(rows = [], keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = clean(keyFn(row));
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function pickLedgerRef(row = {}) {
  return {
    _id: clean(row._id),
    id: clean(row.id),
    code: clean(row.code),
    type: clean(row.type),
    ledgerType: clean(row.ledgerType),
    category: clean(row.category),
    sourceType: clean(row.sourceType),
    sourceId: clean(row.sourceId),
    sourceCode: clean(row.sourceCode),
    returnOrderId: clean(row.returnOrderId),
    returnOrderCode: clean(row.returnOrderCode),
    idempotencyKey: clean(row.idempotencyKey),
    amount: Number(row.amount || row.credit || row.debit || 0),
    credit: Number(row.credit || 0),
    debit: Number(row.debit || 0),
    orderId: clean(row.orderId || row.salesOrderId || row.sourceOrderId || row.refId),
    orderCode: clean(row.orderCode || row.salesOrderCode || row.sourceOrderCode || row.refCode),
    customerCode: clean(row.customerCode || row.customerId),
    accountingBatchId: clean(row.accountingBatchId || row.reAccountingBatchId),
    createdAt: clean(row.createdAt),
    updatedAt: clean(row.updatedAt),
    status: clean(row.status),
    lifecycleStatus: clean(row.lifecycleStatus),
    accountingStatus: clean(row.accountingStatus),
    reversed: row.reversed === true,
    isDeleted: row.isDeleted === true
  };
}

function duplicateCases(map, issue, severity = 'P0') {
  const cases = [];
  for (const [key, rows] of map.entries()) {
    if (rows.length <= 1) continue;
    cases.push({
      severity,
      issue,
      key,
      count: rows.length,
      examples: rows.slice(0, 10).map(pickLedgerRef)
    });
  }
  return cases;
}

function countDuplicateGroups(map) {
  let count = 0;
  for (const rows of map.values()) {
    if (rows.length > 1) count += 1;
  }
  return count;
}

function countDuplicateRows(map) {
  let count = 0;
  for (const rows of map.values()) {
    if (rows.length > 1) count += rows.length;
  }
  return count;
}

function canonicalBusinessKey(row = {}) {
  const sourceType = normalizeSourceType(row.sourceType || row.refType || 'returnOrder');
  const returnKey = clean(row.returnOrderId || row.returnOrderCode || row.sourceId || row.sourceCode || row.refId || row.refCode);
  const orderKey = clean(row.salesOrderId || row.salesOrderCode || row.orderId || row.orderCode || row.sourceOrderId || row.sourceOrderCode || row.refCode);
  const customerKey = clean(row.customerCode || row.customerId);
  if (!returnKey) return '';
  return [sourceType || CANONICAL_SOURCE_TYPE, returnKey, orderKey || '-', customerKey || '-'].join('|');
}

function activeArReturnDuplicateGroups(rows = []) {
  const activeRows = (rows || []).filter((row) => isArReturnLedger(row) && !isInactiveArReturnLedger(row));
  const map = groupBy(activeRows, canonicalBusinessKey);
  return [...map.entries()]
    .filter(([, groupRows]) => groupRows.length > 1)
    .map(([key, groupRows]) => ({
      key,
      count: groupRows.length,
      returnOrderKey: clean(groupRows[0].returnOrderId || groupRows[0].returnOrderCode || groupRows[0].sourceId || groupRows[0].sourceCode || groupRows[0].refId || groupRows[0].refCode),
      orderCode: clean(groupRows[0].orderCode || groupRows[0].salesOrderCode || groupRows[0].sourceOrderCode || groupRows[0].refCode),
      customerCode: clean(groupRows[0].customerCode || groupRows[0].customerId),
      rows: groupRows.map(pickLedgerRef)
    }));
}

function normalizeSourceType(value = '') {
  const raw = clean(value);
  if (!raw) return '';
  const normalized = raw.replace(/[\s_-]+/g, '').toLowerCase();
  if (normalized === 'returnorder' || normalized === 'returnorders') return CANONICAL_SOURCE_TYPE;
  return raw;
}

function summarizeArReturnIdempotency(arReturnRows = [], allLedgerRowsWithIdempotency = []) {
  const rows = (arReturnRows || []).filter(isArReturnLedger);
  const activeRows = rows.filter((row) => !isInactiveArReturnLedger(row));
  const rowsMissingIdempotencyKey = rows.filter((row) => !clean(row.idempotencyKey));
  const rowsMissingSource = rows.filter((row) => !clean(row.sourceId) || !clean(row.sourceCode));
  const rowsWithNonCanonicalSourceType = rows.filter((row) => normalizeSourceType(row.sourceType) !== CANONICAL_SOURCE_TYPE);

  const duplicateIdempotencyMap = groupBy(rows, (row) => row.idempotencyKey);
  const duplicateActiveIdempotencyMap = groupBy(activeRows, (row) => row.idempotencyKey);
  const duplicateSourceMap = groupBy(rows, (row) => {
    const sourceType = normalizeSourceType(row.sourceType);
    const sourceId = clean(row.sourceId);
    return sourceType && sourceId ? `${sourceType}:${sourceId}` : '';
  });
  const duplicateActiveSourceMap = groupBy(activeRows, (row) => {
    const sourceType = normalizeSourceType(row.sourceType);
    const sourceId = clean(row.sourceId);
    return sourceType && sourceId ? `${sourceType}:${sourceId}` : '';
  });
  const duplicateReturnOrderCodeMap = groupBy(rows, (row) => row.returnOrderCode || row.sourceCode || row.refCode);
  const duplicateActiveReturnOrderCodeMap = groupBy(activeRows, (row) => row.returnOrderCode || row.sourceCode || row.refCode);
  const duplicateGlobalIdempotencyMap = groupBy(allLedgerRowsWithIdempotency || [], (row) => row.idempotencyKey);
  const duplicateActiveBusinessCases = activeArReturnDuplicateGroups(rows).map((group) => ({
    severity: 'P0',
    issue: 'duplicate_active_returnOrder_business_dimension',
    key: group.key,
    count: group.count,
    examples: group.rows
  }));

  const p0Cases = [
    ...duplicateCases(duplicateIdempotencyMap, 'duplicate_idempotencyKey'),
    ...duplicateCases(duplicateSourceMap, 'duplicate_sourceType_sourceId'),
    ...duplicateCases(duplicateReturnOrderCodeMap, 'duplicate_returnOrderCode'),
    ...duplicateActiveBusinessCases,
    ...rowsMissingIdempotencyKey.map((row) => ({ severity: 'P0', issue: 'missing_idempotencyKey', key: clean(row.code || row.id || row._id), count: 1, examples: [pickLedgerRef(row)] })),
    ...rowsMissingSource.map((row) => ({ severity: 'P0', issue: 'missing_sourceId_or_sourceCode', key: clean(row.code || row.id || row._id), count: 1, examples: [pickLedgerRef(row)] })),
    ...rowsWithNonCanonicalSourceType.map((row) => ({ severity: 'P1', issue: 'non_canonical_sourceType', key: clean(row.code || row.id || row._id), count: 1, examples: [pickLedgerRef(row)] }))
  ];

  return {
    generatedAt: new Date().toISOString(),
    canonical: {
      arReturnType: AR_RETURN_TYPE,
      arReturnLedgerType: AR_RETURN_LEDGER_TYPE,
      sourceType: CANONICAL_SOURCE_TYPE
    },
    totals: {
      arReturn: rows.length,
      activeArReturn: activeRows.length,
      missingIdempotencyKey: rowsMissingIdempotencyKey.length,
      missingSourceIdOrSourceCode: rowsMissingSource.length,
      nonCanonicalSourceType: rowsWithNonCanonicalSourceType.length,
      duplicateIdempotencyKeyGroups: countDuplicateGroups(duplicateIdempotencyMap),
      duplicateIdempotencyKeyRows: countDuplicateRows(duplicateIdempotencyMap),
      duplicateActiveIdempotencyKeyGroups: countDuplicateGroups(duplicateActiveIdempotencyMap),
      duplicateSourceGroups: countDuplicateGroups(duplicateSourceMap),
      duplicateSourceRows: countDuplicateRows(duplicateSourceMap),
      duplicateActiveSourceGroups: countDuplicateGroups(duplicateActiveSourceMap),
      duplicateReturnOrderCodeGroups: countDuplicateGroups(duplicateReturnOrderCodeMap),
      duplicateReturnOrderCodeRows: countDuplicateRows(duplicateReturnOrderCodeMap),
      duplicateActiveReturnOrderCodeGroups: countDuplicateGroups(duplicateActiveReturnOrderCodeMap),
      duplicateActiveBusinessGroups: duplicateActiveBusinessCases.length,
      duplicateGlobalIdempotencyKeyGroups: countDuplicateGroups(duplicateGlobalIdempotencyMap),
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
    || totals.missingSourceIdOrSourceCode
    || totals.duplicateIdempotencyKeyGroups
    || totals.duplicateSourceGroups
    || totals.duplicateReturnOrderCodeGroups
    || totals.duplicateGlobalIdempotencyKeyGroups
  );
}

module.exports = {
  AR_RETURN_TYPE,
  AR_RETURN_LEDGER_TYPE,
  CANONICAL_SOURCE_TYPE,
  arReturnLedgerQuery,
  clean,
  isArReturnLedger,
  isArReturnReversalLedger,
  isInactiveArReturnLedger,
  normalizeSourceType,
  canonicalBusinessKey,
  activeArReturnDuplicateGroups,
  summarizeArReturnIdempotency,
  hasBlockingIssues
};
