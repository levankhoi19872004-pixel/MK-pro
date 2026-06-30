'use strict';

const { validateArLedgerContract, hasAccRevMismatch } = require('../../src/domain/ar/arLedgerValidator');
const { getSignedArAmount } = require('../../src/domain/ar/arLedgerQueryPolicy');

function clean(value = '') { return String(value ?? '').trim(); }
function upper(value = '') { return clean(value).toUpperCase(); }
function lower(value = '') { return clean(value).toLowerCase(); }
function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}
function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}
function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}
function escapeRegExp(value = '') { return clean(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function asId(value) { return clean(value && value.toString ? value.toString() : value); }
function ledgerKey(row = {}) { return clean(row.id || row.code || row._id); }
function ledgerMongoId(row = {}) { return asId(row._id); }
function isDebitOnly(row = {}) {
  return money(row.debit || row.amount) > 0 && money(row.credit) === 0;
}
function isCreditOnly(row = {}) {
  return money(row.credit || row.amount) > 0 && money(row.debit) === 0;
}
function effectiveDebit(row = {}) {
  const debit = money(row.debit);
  const credit = money(row.credit);
  if (debit > 0 || credit > 0) return debit;
  const amount = money(row.amount);
  const direction = lower(row.direction || row.amountField);
  return direction === 'debit' ? amount : 0;
}
function effectiveCredit(row = {}) {
  const debit = money(row.debit);
  const credit = money(row.credit);
  if (debit > 0 || credit > 0) return credit;
  const amount = money(row.amount);
  const direction = lower(row.direction || row.amountField);
  return direction === 'credit' ? amount : 0;
}

function extractSoTokens(value = '') {
  const raw = clean(value);
  const out = [];
  const re = /SO\d{6,}/gi;
  let match;
  while ((match = re.exec(raw))) out.push(match[0]);
  return out;
}
function extractRoTokens(value = '') {
  const raw = upper(value);
  const out = [];
  const re = /RO-[A-Z0-9]+/gi;
  let match;
  while ((match = re.exec(raw))) out.push(upper(match[0]));
  return out;
}
function stripArReturnPrefix(value = '') {
  return upper(value).replace(/^AR-RETURN:?/, '').replace(/^AR-RETURN-/, '');
}
function extractBOrderTokens(value = '') {
  const raw = upper(value);
  const out = [];
  const re = /B\d{5,}/g;
  let match;
  while ((match = re.exec(raw))) out.push(match[0]);
  return out;
}

function ledgerTokens(row = {}) {
  const fields = [
    row.id, row.code, row.accountingBatchId, row.idempotencyKey,
    row.sourceId, row.sourceCode, row.orderId, row.orderCode,
    row.salesOrderId, row.salesOrderCode, row.sourceOrderId, row.sourceOrderCode,
    row.refId, row.refCode, row.returnOrderId, row.returnOrderCode,
    row.referenceId, row.referenceCode
  ];
  return unique(fields.flatMap((value) => [
    clean(value),
    ...extractSoTokens(value),
    ...extractRoTokens(value),
    ...extractBOrderTokens(value),
    stripArReturnPrefix(value)
  ]));
}

function inferLegacyKind(row = {}) {
  const category = upper(row.category);
  if (category) return category;
  const value = upper([row.id, row.code, row.type, row.refType, row.sourceType, row.idempotencyKey].filter(Boolean).join(' '));
  if (/AR-SALE-REVERSAL/.test(value) || /AR-SALE-REV-/.test(value) || /AR-SALE:REVERSAL/.test(value)) return 'AR-SALE-REVERSAL';
  if (/AR-RETURN-REVERSAL/.test(value) || /AR-RETURN-REV-/.test(value)) return 'AR-RETURN-REVERSAL';
  if (/AR-RECEIPT/.test(value) || /MOBILE-DELIVERY-(CASH|TRANSFER)/.test(value)) return 'AR-RECEIPT';
  if (/AR-RETURN/.test(value)) return 'AR-RETURN';
  if (/AR-BONUS/.test(value)) return 'AR-BONUS';
  if (/AR-ALLOWANCE/.test(value)) return 'AR-ALLOWANCE';
  if (/AR-ADJUSTMENT/.test(value)) return 'AR-ADJUSTMENT';
  if (/AR-SALE/.test(value)) return 'AR-SALE';
  return '';
}

function snapshotSource(row = {}, type = '') {
  if (!row) return null;
  return {
    sourceType: type,
    id: clean(row.id || row._id),
    code: clean(row.code || row.orderCode || row.salesOrderCode),
    customerCode: clean(row.customerCode),
    customerName: clean(row.customerName),
    salesStaffCode: clean(row.salesStaffCode || row.salesmanCode || row.nvbhCode),
    salesStaffName: clean(row.salesStaffName || row.salesmanName || row.nvbhName),
    deliveryStaffCode: clean(row.deliveryStaffCode || row.deliveryCode || row.nvghCode),
    deliveryStaffName: clean(row.deliveryStaffName || row.deliveryName || row.nvghName),
    amount: money(row.amount || row.totalAmount || row.returnAmount),
    accountingStatus: clean(row.accountingStatus),
    accountingConfirmed: row.accountingConfirmed === true
  };
}

function buildSourceIndex(sources = {}) {
  const index = {
    salesById: new Map(), salesByCode: new Map(),
    returnsById: new Map(), returnsByCode: new Map(), returnsBySourceOrder: new Map(),
    collectionsById: new Map(), collectionsByCode: new Map(), collectionsByLedgerId: new Map(),
    fundsById: new Map(), fundsByCode: new Map(), fundsByLedgerId: new Map()
  };
  for (const row of sources.salesOrders || []) {
    for (const key of unique([row.id, row._id, row.orderId, row.salesOrderId])) index.salesById.set(key, row);
    for (const key of unique([row.code, row.orderCode, row.salesOrderCode, row.documentCode, row.invoiceCode, ...extractSoTokens(row.id), ...extractBOrderTokens(row.code)])) index.salesByCode.set(key, row);
  }
  for (const row of sources.returnOrders || []) {
    for (const key of unique([row.id, row._id, row.returnOrderId])) index.returnsById.set(key, row);
    for (const key of unique([row.code, row.orderCode, row.returnOrderCode, ...extractRoTokens(row.code), stripArReturnPrefix(row.code)])) index.returnsByCode.set(upper(key), row);
    for (const key of unique([row.sourceOrderId, row.salesOrderId, row.orderId, row.sourceOrderCode, row.salesOrderCode, row.orderCode])) index.returnsBySourceOrder.set(key, row);
  }
  for (const row of sources.debtCollections || []) {
    for (const key of unique([row.id, row._id, row.code, row.idempotencyKey])) {
      index.collectionsById.set(key, row);
      index.collectionsByCode.set(key, row);
    }
    for (const key of row.arLedgerIds || []) index.collectionsByLedgerId.set(clean(key), row);
  }
  for (const row of sources.fundLedgers || []) {
    for (const key of unique([row.id, row._id, row.code, row.idempotencyKey, row.sourceId, row.sourceCode, row.refId, row.refCode])) {
      index.fundsById.set(key, row);
      index.fundsByCode.set(key, row);
    }
    for (const key of unique([row.arLedgerId, row.sourceId, row.refId])) index.fundsByLedgerId.set(key, row);
  }
  return index;
}

function onlyOne(rows = []) {
  const list = unique(rows.map((row) => row && (row._id || row.id || row.code))).map((key) => rows.find((row) => [row._id, row.id, row.code].some((value) => clean(value) === key))).filter(Boolean);
  return list.length === 1 ? list[0] : null;
}

function findSalesSource(row = {}, index = buildSourceIndex()) {
  const candidates = [];
  const tokens = ledgerTokens(row);
  for (const token of tokens) {
    if (index.salesById.has(token)) candidates.push(index.salesById.get(token));
    if (index.salesByCode.has(token)) candidates.push(index.salesByCode.get(token));
  }
  return onlyOne(candidates);
}
function findReturnSource(row = {}, index = buildSourceIndex()) {
  const candidates = [];
  const tokens = ledgerTokens(row);
  for (const token of tokens) {
    if (index.returnsById.has(token)) candidates.push(index.returnsById.get(token));
    if (index.returnsByCode.has(upper(token))) candidates.push(index.returnsByCode.get(upper(token)));
    if (index.returnsBySourceOrder.has(token)) candidates.push(index.returnsBySourceOrder.get(token));
  }
  return onlyOne(candidates);
}
function findCollectionSource(row = {}, index = buildSourceIndex()) {
  const candidates = [];
  const tokens = ledgerTokens(row);
  const key = ledgerKey(row);
  if (index.collectionsByLedgerId.has(key)) candidates.push(index.collectionsByLedgerId.get(key));
  for (const token of tokens) {
    if (index.collectionsById.has(token)) candidates.push(index.collectionsById.get(token));
    if (index.collectionsByCode.has(token)) candidates.push(index.collectionsByCode.get(token));
  }
  return onlyOne(candidates);
}
function findFundSource(row = {}, index = buildSourceIndex()) {
  const candidates = [];
  const tokens = ledgerTokens(row);
  const key = ledgerKey(row);
  if (index.fundsByLedgerId.has(key)) candidates.push(index.fundsByLedgerId.get(key));
  for (const token of tokens) {
    if (index.fundsById.has(token)) candidates.push(index.fundsById.get(token));
    if (index.fundsByCode.has(token)) candidates.push(index.fundsByCode.get(token));
  }
  return onlyOne(candidates);
}

const CONTRACT_FIELDS = [
  'category', 'ledgerType', 'entryType', 'sourceType', 'sourceId', 'sourceCode',
  'customerCode', 'customerName', 'salesStaffCode', 'salesStaffName',
  'deliveryStaffCode', 'deliveryStaffName', 'masterOrderId', 'masterOrderCode',
  'idempotencyKey', 'accountingStatus', 'active', 'reversed', 'debit', 'credit',
  'amount', 'direction', 'amountField', 'returnOrderId', 'returnOrderCode',
  'sourceOrderId', 'sourceOrderCode', 'reversedLedgerId', 'originalLedgerId',
  'duplicateOf', 'duplicateReason', 'duplicateMarkedAt'
];

function buildRollbackPatch(row = {}, after = {}) {
  const set = {};
  const unset = {};
  for (const field of Object.keys(after || {})) {
    if (row[field] === undefined) unset[field] = '';
    else set[field] = row[field];
  }
  const patch = {};
  if (Object.keys(set).length) patch.$set = set;
  if (Object.keys(unset).length) patch.$unset = unset;
  return patch;
}

function actionBase(row = {}, type, reason, confidence, after = {}, sourceSnapshot = null, safetyChecks = []) {
  return {
    actionType: type,
    ledgerId: ledgerMongoId(row) || ledgerKey(row),
    ledgerCode: ledgerKey(row),
    reason,
    confidence,
    safeToAutoApply: confidence === 'high' && type !== 'MANUAL_REVIEW_REQUIRED',
    before: Object.fromEntries(CONTRACT_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]])),
    after,
    safetyChecks,
    rollbackPatch: buildRollbackPatch(row, after),
    relatedSourceSnapshot: sourceSnapshot,
    filter: ledgerMongoId(row) ? { _id: ledgerMongoId(row) } : (clean(row.id) ? { id: clean(row.id) } : { code: clean(row.code) })
  };
}

function normalFields(row = {}, category, sourceType, sourceId, sourceCode, source = {}) {
  const debit = effectiveDebit(row);
  const credit = effectiveCredit(row);
  const direction = debit > 0 ? 'debit' : 'credit';
  return {
    category,
    ledgerType: category,
    entryType: 'normal',
    sourceType,
    sourceId,
    sourceCode,
    customerCode: clean(row.customerCode || source.customerCode),
    customerName: clean(row.customerName || source.customerName),
    salesStaffCode: clean(row.salesStaffCode || row.salesmanCode || source.salesStaffCode || source.salesmanCode || source.nvbhCode),
    salesStaffName: clean(row.salesStaffName || row.salesmanName || source.salesStaffName || source.salesmanName || source.nvbhName),
    deliveryStaffCode: clean(row.deliveryStaffCode || source.deliveryStaffCode || source.deliveryCode || source.nvghCode),
    deliveryStaffName: clean(row.deliveryStaffName || source.deliveryStaffName || source.deliveryName || source.nvghName),
    masterOrderId: clean(row.masterOrderId || source.masterOrderId),
    masterOrderCode: clean(row.masterOrderCode || source.masterOrderCode),
    accountingStatus: 'confirmed',
    active: true,
    reversed: false,
    debit,
    credit,
    amount: Math.max(debit, credit, money(row.amount)),
    direction,
    amountField: direction
  };
}

function idempotencyFor(category, sourceType, sourceId, row = {}) {
  if (category === 'AR-SALE') return `AR-SALE:salesOrder:${sourceId}`;
  if (category === 'AR-RETURN') return `AR-RETURN:returnOrder:${sourceId}`;
  if (category === 'AR-RECEIPT') return `AR-RECEIPT:${sourceType}:${sourceId}:${ledgerKey(row)}`;
  if (category === 'AR-BONUS') return `AR-BONUS:salesOrder:${sourceId}:${ledgerKey(row)}`;
  if (category === 'AR-ALLOWANCE') return `AR-ALLOWANCE:salesOrder:${sourceId}:${ledgerKey(row)}`;
  return `${category}:${sourceType}:${sourceId}:${ledgerKey(row)}`;
}

function makeManual(row = {}, reason, sourceSnapshot = null, confidence = 'low') {
  return actionBase(row, 'MANUAL_REVIEW_REQUIRED', reason, confidence, {}, sourceSnapshot, [{ code: 'MANUAL_REVIEW_REQUIRED', ok: false, message: reason }]);
}

function hasDangerousReversalChain(row = {}) {
  const value = upper([row.id, row.code, row.accountingBatchId].join(' '));
  return /REV-/.test(value) || upper(row.accountingStatus) === 'REVERSED' || row.reversed === true || hasAccRevMismatch(row);
}

function planNormalizeSale(row = {}, index) {
  if (!isDebitOnly(row)) return makeManual(row, 'AR-SALE legacy row is not debit-only.');
  if (hasDangerousReversalChain(row)) return makeManual(row, 'AR-SALE has REV/reversed/ACC mismatch risk.');
  const source = findSalesSource(row, index);
  if (!source) return makeManual(row, 'Cannot normalize AR-SALE: no unique salesOrder source matched.');
  const sourceId = clean(source.id || source.orderId || source.salesOrderId || source._id);
  const sourceCode = clean(source.code || source.orderCode || source.salesOrderCode || row.orderCode || row.code);
  const after = normalFields(row, 'AR-SALE', 'salesOrder', sourceId, sourceCode, source);
  after.idempotencyKey = idempotencyFor('AR-SALE', 'salesOrder', sourceId, row);
  after.accountingBatchId = clean(row.accountingBatchId) || `ACC-${sourceId}`;
  return actionBase(row, 'NORMALIZE_AR_SALE_CONTRACT', 'Normalize legacy AR-SALE after matching unique salesOrder source.', 'high', after, snapshotSource(source, 'salesOrder'), [
    { code: 'SOURCE_MATCHED_UNIQUE', ok: true },
    { code: 'DEBIT_ONLY', ok: true },
    { code: 'NO_REVERSAL_RISK', ok: true }
  ]);
}

function planNormalizeReturn(row = {}, index) {
  if (!isCreditOnly(row)) return makeManual(row, 'AR-RETURN legacy row is not credit-only.');
  if (hasDangerousReversalChain(row)) return makeManual(row, 'AR-RETURN has REV/reversed/ACC mismatch risk.');
  const source = findReturnSource(row, index);
  if (!source) return makeManual(row, 'Cannot normalize AR-RETURN: no unique returnOrder source matched.');
  const sourceId = clean(source.id || source.returnOrderId || source._id || source.code);
  const sourceCode = clean(source.code || source.returnOrderCode || row.returnOrderCode || row.code);
  const after = normalFields(row, 'AR-RETURN', 'returnOrder', sourceId, sourceCode, source);
  after.idempotencyKey = idempotencyFor('AR-RETURN', 'returnOrder', sourceId, row);
  after.returnOrderId = sourceId;
  after.returnOrderCode = sourceCode;
  after.sourceOrderId = clean(source.sourceOrderId || source.salesOrderId || source.orderId || row.sourceOrderId || row.salesOrderId || row.orderId);
  after.sourceOrderCode = clean(source.sourceOrderCode || source.salesOrderCode || source.orderCode || row.sourceOrderCode || row.salesOrderCode || row.orderCode);
  return actionBase(row, 'NORMALIZE_AR_RETURN_CONTRACT', 'Normalize legacy AR-RETURN after matching unique returnOrder source.', 'high', after, snapshotSource(source, 'returnOrder'), [
    { code: 'SOURCE_MATCHED_UNIQUE', ok: true },
    { code: 'CREDIT_ONLY', ok: true },
    { code: 'NO_REVERSAL_RISK', ok: true }
  ]);
}

function planNormalizeReceipt(row = {}, index) {
  if (!isCreditOnly(row)) return makeManual(row, 'AR-RECEIPT legacy row is not credit-only.');
  if (hasDangerousReversalChain(row)) return makeManual(row, 'AR-RECEIPT has REV/reversed risk.');
  const collection = findCollectionSource(row, index);
  const fund = findFundSource(row, index);
  const source = collection || fund;
  if (!source) return makeManual(row, 'Cannot normalize AR-RECEIPT: no unique debtCollection/fund/payment source matched.', null, 'medium');
  const sourceType = collection ? 'debtCollection' : 'payment';
  const sourceId = clean(source.id || source._id || source.code);
  const sourceCode = clean(source.code || row.sourceCode || row.code);
  const after = normalFields(row, 'AR-RECEIPT', sourceType, sourceId, sourceCode, source);
  after.idempotencyKey = clean(row.idempotencyKey) || idempotencyFor('AR-RECEIPT', sourceType, sourceId, row);
  return actionBase(row, 'NORMALIZE_AR_RECEIPT_CONTRACT', `Normalize legacy AR-RECEIPT after matching unique ${sourceType} source.`, 'high', after, snapshotSource(source, sourceType), [
    { code: 'SOURCE_MATCHED_UNIQUE', ok: true },
    { code: 'CREDIT_ONLY', ok: true },
    { code: 'NO_REVERSAL_RISK', ok: true }
  ]);
}

function planReversedButActive(row = {}, allRows = []) {
  const key = ledgerKey(row);
  const matches = allRows.filter((candidate) => clean(candidate.reversedLedgerId || candidate.originalLedgerId || candidate.reversalOf || candidate.rollbackOf) === key);
  if (matches.length !== 1) return makeManual(row, 'Cannot safely fix reversed-but-active: expected exactly one reversal pair.');
  const after = { active: false, reversed: true, accountingStatus: 'reversed', reversalLedgerId: ledgerKey(matches[0]) };
  return actionBase(row, 'FIX_REVERSED_BUT_ACTIVE', 'Mark original reversed ledger inactive after matching one reversal pair.', 'high', after, snapshotSource(matches[0], 'arLedgerReversal'), [
    { code: 'REVERSAL_PAIR_MATCHED_UNIQUE', ok: true }
  ]);
}

function planDuplicate(row = {}, duplicateRows = []) {
  const same = duplicateRows.filter((item) => ledgerKey(item) !== ledgerKey(row));
  if (!same.length) return null;
  const canonical = duplicateRows.slice().sort((a, b) => {
    const va = validateArLedgerContract(a).ok ? 0 : 1;
    const vb = validateArLedgerContract(b).ok ? 0 : 1;
    return va - vb || clean(a.createdAt).localeCompare(clean(b.createdAt)) || ledgerKey(a).localeCompare(ledgerKey(b));
  })[0];
  if (ledgerKey(row) === ledgerKey(canonical)) return null;
  const amount = Math.max(effectiveDebit(row), effectiveCredit(row), money(row.amount));
  const comparable = duplicateRows.every((item) => Math.max(effectiveDebit(item), effectiveCredit(item), money(item.amount)) === amount);
  if (!comparable) return makeManual(row, 'Duplicate candidate amounts differ; manual review required.');
  const after = {
    active: false,
    accountingStatus: 'duplicate_cancelled',
    duplicateOf: ledgerKey(canonical),
    duplicateReason: 'phase81_duplicate_idempotency_key',
    duplicateMarkedAt: new Date().toISOString()
  };
  return actionBase(row, 'MARK_DUPLICATE_INACTIVE', 'Duplicate idempotency/source amount matched; mark duplicate inactive without deleting.', 'high', after, snapshotSource(canonical, 'canonicalDuplicateLedger'), [
    { code: 'DUPLICATE_GROUP_MATCHED', ok: true },
    { code: 'NO_DELETE', ok: true }
  ]);
}

function buildDuplicateMap(rows = []) {
  const byIdem = new Map();
  for (const row of rows) {
    const idem = clean(row.idempotencyKey);
    if (!idem) continue;
    if (!byIdem.has(idem)) byIdem.set(idem, []);
    byIdem.get(idem).push(row);
  }
  return new Map([...byIdem.entries()].filter(([, list]) => list.length > 1));
}

function buildLegacyDetail(rows = [], sources = {}) {
  const index = buildSourceIndex(sources);
  const duplicateMap = buildDuplicateMap(rows);
  return rows.map((row) => {
    const validation = validateArLedgerContract(row);
    const kind = inferLegacyKind(row);
    return {
      ledgerId: ledgerKey(row),
      mongoId: ledgerMongoId(row),
      kind,
      validation,
      hasAccRevMismatch: hasAccRevMismatch(row),
      reversedButActive: clean(row.accountingStatus) === 'reversed' && (row.active === true || row.reversed !== true),
      matchedSalesOrder: snapshotSource(findSalesSource(row, index), 'salesOrder'),
      matchedReturnOrder: snapshotSource(findReturnSource(row, index), 'returnOrder'),
      matchedDebtCollection: snapshotSource(findCollectionSource(row, index), 'debtCollection'),
      duplicateGroupSize: clean(row.idempotencyKey) && duplicateMap.has(clean(row.idempotencyKey)) ? duplicateMap.get(clean(row.idempotencyKey)).length : 0
    };
  });
}

function buildNormalizationPlan(rows = [], sources = {}, options = {}) {
  const index = buildSourceIndex(sources);
  const duplicateMap = buildDuplicateMap(rows);
  const actions = [];
  const sourceCounts = { salesOrders: sources.salesOrders?.length || 0, returnOrders: sources.returnOrders?.length || 0, debtCollections: sources.debtCollections?.length || 0, fundLedgers: sources.fundLedgers?.length || 0 };
  for (const row of rows || []) {
    if (clean(row.account || 'AR').toUpperCase() !== 'AR' || row.accountingConfirmed !== true) continue;
    let action = null;
    const idem = clean(row.idempotencyKey);
    if (idem && duplicateMap.has(idem)) action = planDuplicate(row, duplicateMap.get(idem));
    if (!action && clean(row.accountingStatus) === 'reversed' && (row.active === true || row.reversed !== true)) action = planReversedButActive(row, rows);
    if (!action) {
      const kind = inferLegacyKind(row);
      if (/(B0038423|B0038424)/i.test([row.id, row.code, row.accountingBatchId].join(' ')) || hasAccRevMismatch(row)) {
        action = makeManual(row, 'ACC/REV mismatch, B0038423/B0038424, or complex reversal chain requires manual accounting review.');
      } else if (kind === 'AR-SALE') action = planNormalizeSale(row, index);
      else if (kind === 'AR-RETURN') action = planNormalizeReturn(row, index);
      else if (kind === 'AR-RECEIPT') action = planNormalizeReceipt(row, index);
      else if (kind === 'AR-SALE-REVERSAL' || kind === 'AR-RETURN-REVERSAL') action = makeManual(row, `${kind} requires explicit original/reversal pairing before normalization.`);
      else if (kind === 'AR-BONUS' || kind === 'AR-ALLOWANCE' || kind === 'AR-ADJUSTMENT') action = makeManual(row, `${kind} requires business source review before normalization.`, null, 'medium');
      else action = makeManual(row, 'Unable to infer AR legacy ledger kind.');
    }
    if (action) actions.push(action);
  }
  const counts = actions.reduce((acc, action) => {
    acc.byType[action.actionType] = (acc.byType[action.actionType] || 0) + 1;
    acc.byConfidence[action.confidence] = (acc.byConfidence[action.confidence] || 0) + 1;
    if (action.safeToAutoApply) acc.safeToAutoApply += 1;
    return acc;
  }, { byType: {}, byConfidence: {}, safeToAutoApply: 0 });
  return {
    mode: 'phase81-plan-only',
    readOnly: true,
    generatedAt: new Date().toISOString(),
    options,
    sourceCounts,
    summary: {
      rowsAudited: rows.length,
      actionCount: actions.length,
      safeToAutoApplyCount: counts.safeToAutoApply,
      manualReviewCount: actions.filter((action) => action.actionType === 'MANUAL_REVIEW_REQUIRED').length,
      ...counts
    },
    actions,
    safetyNote: 'Only confidence=high and non-manual actions may be auto-applied. No ledger is deleted. Every action includes rollbackPatch.'
  };
}

function validatePlanForApply(plan = {}, options = {}) {
  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  if (!actions.length) throw new Error('Refuse to apply empty Phase81 plan.');
  const selected = actions.filter((action) => action.safeToAutoApply === true && action.confidence === 'high' && action.actionType !== 'MANUAL_REVIEW_REQUIRED');
  if (!selected.length) throw new Error('Refuse to apply Phase81 plan without high-confidence auto actions.');
  for (const action of selected) {
    if (!action.rollbackPatch || (!action.rollbackPatch.$set && !action.rollbackPatch.$unset)) throw new Error(`Refuse to apply action without rollbackPatch: ${action.ledgerCode}`);
    if (!action.after || !Object.keys(action.after).length) throw new Error(`Refuse to apply action without after patch: ${action.ledgerCode}`);
    if (action.confidence !== 'high') throw new Error(`Refuse to apply non-high confidence action: ${action.ledgerCode}`);
  }
  if (options.allowManual === true) throw new Error('Manual actions are never auto-applied by this script.');
  return selected;
}

function buildMongoUpdateForAction(action = {}, actor = 'phase81') {
  return {
    $set: {
      ...(action.after || {}),
      updatedAt: new Date().toISOString()
    },
    $push: {
      auditTrail: {
        action: 'phase81_ar_legacy_contract_normalization',
        actionType: action.actionType,
        at: new Date().toISOString(),
        by: actor,
        reason: action.reason,
        confidence: action.confidence,
        rollbackPatch: action.rollbackPatch
      }
    }
  };
}

async function applyNormalizationPlan(plan = {}, models = {}, options = {}) {
  const actions = validatePlanForApply(plan, options);
  const ArLedger = models.ArLedger;
  if (!ArLedger) throw new Error('ArLedger model is required to apply Phase81 plan.');
  const result = { dryRun: options.dryRun !== false, requestedActions: actions.length, appliedActions: 0, skippedActions: 0, details: [] };
  for (const action of actions) {
    const update = buildMongoUpdateForAction(action, options.actor || 'phase81');
    if (result.dryRun) {
      result.details.push({ ledgerCode: action.ledgerCode, actionType: action.actionType, dryRun: true, update });
      continue;
    }
    const outcome = await ArLedger.updateOne(action.filter || { id: action.ledgerId }, update);
    const modified = Number(outcome.modifiedCount || outcome.nModified || 0);
    result.appliedActions += modified > 0 ? 1 : 0;
    result.skippedActions += modified > 0 ? 0 : 1;
    result.details.push({ ledgerCode: action.ledgerCode, actionType: action.actionType, matchedCount: outcome.matchedCount || outcome.n || 0, modifiedCount: modified });
  }
  return result;
}

module.exports = {
  clean,
  ledgerKey,
  inferLegacyKind,
  ledgerTokens,
  buildSourceIndex,
  buildLegacyDetail,
  buildNormalizationPlan,
  validatePlanForApply,
  buildMongoUpdateForAction,
  applyNormalizationPlan,
  _internal: {
    findSalesSource,
    findReturnSource,
    findCollectionSource,
    findFundSource,
    planNormalizeSale,
    planNormalizeReturn,
    planNormalizeReceipt,
    planDuplicate,
    planReversedButActive,
    extractSoTokens,
    extractRoTokens
  }
};
