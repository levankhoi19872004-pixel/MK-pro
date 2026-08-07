'use strict';

const dateUtil = require('../utils/date.util');
const { normalizeDebtAmount, hasOpenDebt } = require('../constants/finance.constants');
const {
  isCanonicalArDebtLedger,
  canProjectCanonicalAccountingLedgerToDebtReadModel,
  validateArLedgerContract,
  normalizeAccountingAmount,
  PHASE87_READ_MODEL_CATEGORIES
} = require('../domain/ar/arLedgerValidator');
const {
  buildCanonicalArLedgerMatch,
  buildActiveDebtReadModelLedgerMatch,
  normalizeArDebtFilters,
  normalizeCanonicalLedgerRow,
  canonicalRowMatchesFilters,
  matchesDebtStatus,
  getSignedArAmount,
  filterReadModelEligibleArLedgers,
  isArDebtReversalLedger,
  reversalOriginalKeys
} = require('../domain/ar/arLedgerQueryPolicy');
const {
  ACTIVE_DEBT_READ_MODEL_CATEGORIES,
  canProjectDetailedAccountingCategoryBySource
} = require('../domain/ar/arDebtCategoryRegistry');
const { selectLegacyAdjustmentProjectedRows } = require('../domain/ar/legacyAdjustmentProjectionPolicy');
const { canonicalDebtOrderIdentity, debtOrderAliasKeys } = require('../utils/debtOrderIdentity.util');
const { stripStaffScopeFilters } = require('../domain/ar/debtOrderStaffScope');

let models = null;
function getModels() {
  if (models) return models;
  models = { ArLedger: require('../models/ArLedger') };
  return models;
}

function setModelsForTest(nextModels) {
  models = nextModels || null;
}

function clean(value = '') {
  return String(value ?? '').trim();
}

async function queryRows(Model, match, options = {}) {
  const query = Model.find(match);
  if (options.session && typeof query.session === 'function') query.session(options.session);
  if (options.projection && typeof query.select === 'function') query.select(options.projection);
  if (typeof query.sort === 'function') query.sort(options.sort || { customerCode: 1, sourceId: 1, date: 1, createdAt: 1, _id: 1 });
  if (options.limit && typeof query.limit === 'function') query.limit(Math.max(1, Math.min(1000, Number(options.limit) || 100)));
  if (typeof query.lean === 'function') query.lean();
  return query;
}

function normalizeAndValidateRows(rows = [], filters = {}) {
  const rawCanonicalLedgers = [];
  const rejectedLedgers = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (isCanonicalArDebtLedger(row) && PHASE87_READ_MODEL_CATEGORIES.includes(clean(row.category).toUpperCase()) && canonicalRowMatchesFilters(row, filters)) {
      rawCanonicalLedgers.push(row);
    } else {
      rejectedLedgers.push({ ledgerId: clean(row.id || row.code || row._id), validation: validateArLedgerContract(row) });
    }
  }

  const eligibleRows = selectLegacyAdjustmentProjectedRows(filterReadModelEligibleArLedgers(rawCanonicalLedgers));
  const eligibleSet = new Set(eligibleRows);
  for (const row of rawCanonicalLedgers) {
    if (!eligibleSet.has(row) && isArDebtReversalLedger(row)) {
      rejectedLedgers.push({
        ledgerId: clean(row.id || row.code || row._id),
        validation: {
          ok: false,
          category: clean(row.category).toUpperCase(),
          errors: [{
            code: 'ORPHAN_AR_REVERSAL_EXCLUDED_FROM_DEBT_READ_MODEL',
            field: 'reversedLedgerId',
            reason: 'Active reversal ledger has no active original ledger in the same canonical read set.',
            originalKeys: reversalOriginalKeys(row)
          }]
        }
      });
    }
  }

  return { canonicalLedgers: eligibleRows.map(normalizeCanonicalLedgerRow), rejectedLedgers };
}


function normalizeAndValidateActiveDebtRows(rows = [], filters = {}) {
  const canonicalLedgers = [];
  const rejectedLedgers = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (canProjectCanonicalAccountingLedgerToDebtReadModel(row) && canonicalRowMatchesFilters(row, filters)) {
      canonicalLedgers.push(row);
    } else {
      rejectedLedgers.push({ ledgerId: clean(row.id || row.code || row._id), validation: validateArLedgerContract(row) });
    }
  }
  return { canonicalLedgers: selectLegacyAdjustmentProjectedRows(canonicalLedgers).map(normalizeCanonicalLedgerRow), rejectedLedgers };
}



async function findArLedgerRowsByRawMatch(match = {}, options = {}) {
  const { ArLedger } = getModels();
  return queryRows(ArLedger, match, options);
}

async function getCanonicalLedgersByRawMatch(match = {}, options = {}) {
  const { ArLedger } = getModels();
  const rows = await queryRows(ArLedger, match, options);
  const normalized = normalizeArDebtFilters({ ...(options.filters || {}), status: 'all' });
  const result = normalizeAndValidateRows(rows, normalized);
  return options.includeRejected ? result : result.canonicalLedgers;
}

async function getCanonicalArLedgers(filters = {}, options = {}) {
  const { ArLedger } = getModels();
  const normalized = normalizeArDebtFilters(filters);
  const rows = await queryRows(ArLedger, buildCanonicalArLedgerMatch(normalized), options);
  const result = normalizeAndValidateRows(rows, normalized);
  return options.includeRejected ? result : result.canonicalLedgers;
}

async function getActiveDebtReadModelLedgers(filters = {}, options = {}) {
  const { ArLedger } = getModels();
  const normalized = normalizeArDebtFilters(filters);
  const rows = await queryRows(ArLedger, buildActiveDebtReadModelLedgerMatch(normalized), options);
  const result = normalizeAndValidateActiveDebtRows(rows, normalized);
  return options.includeRejected ? result : result.canonicalLedgers;
}

async function getCanonicalLedgersByCustomer(customerCode, filters = {}, options = {}) {
  return getCanonicalArLedgers({ ...filters, customerCode }, options);
}

async function getCanonicalLedgersBySource(sourceId, filters = {}, options = {}) {
  return getCanonicalArLedgers({ ...filters, sourceId }, options);
}

function uniqueClean(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean)));
}

async function getCanonicalLedgersByCustomerCodes(customerCodes = [], filters = {}, options = {}) {
  const { ArLedger } = getModels();
  const values = uniqueClean(customerCodes);
  if (!values.length) return [];
  const normalized = normalizeArDebtFilters({ ...filters, status: 'all' });
  const match = buildCanonicalArLedgerMatch(normalized);
  match.customerCode = { $in: values };
  const rows = await queryRows(ArLedger, match, options);
  const result = normalizeAndValidateRows(rows, normalized);
  return options.includeRejected ? result : result.canonicalLedgers;
}

async function getCanonicalLedgersByOrderKeys(orderKeys = [], filters = {}, options = {}) {
  const { ArLedger } = getModels();
  const values = uniqueClean(orderKeys);
  if (!values.length) return [];
  const normalized = normalizeArDebtFilters({ ...filters, status: 'all' });
  const match = buildCanonicalArLedgerMatch(normalized);
  appendOrderKeyCondition(match, values);
  const rows = await queryRows(ArLedger, match, options);
  const result = normalizeAndValidateRows(rows, normalized);
  return options.includeRejected ? result : result.canonicalLedgers;
}

function appendOrderKeyCondition(match, keys = []) {
  const condition = {
    $or: [
      { sourceId: { $in: keys } },
      { salesOrderId: { $in: keys } },
      { orderId: { $in: keys } },
      { sourceOrderId: { $in: keys } },
      { canonicalOrderId: { $in: keys } },
      { canonicalOrderKey: { $in: keys } },
      { orderKey: { $in: keys } },
      { refId: { $in: keys } },
      { sourceCode: { $in: keys } },
      { salesOrderCode: { $in: keys } },
      { orderCode: { $in: keys } },
      { sourceOrderCode: { $in: keys } },
      { canonicalOrderCode: { $in: keys } },
      { refCode: { $in: keys } },
      { 'metadata.salesOrderId': { $in: keys } },
      { 'metadata.orderId': { $in: keys } },
      { 'metadata.salesOrderCode': { $in: keys } },
      { 'metadata.orderCode': { $in: keys } }
    ]
  };
  if (!Array.isArray(match.$and)) match.$and = [];
  match.$and.push(condition);
  return match;
}

function buildRawArOrderLookupMatch(orderKeys = [], filters = {}) {
  const values = uniqueClean(orderKeys);
  const normalized = normalizeArDebtFilters({ ...filters, status: 'all' });
  const match = { account: 'AR' };
  if (clean(filters.tenantId)) match.tenantId = clean(filters.tenantId);
  if (normalized.customerCode) {
    const escaped = normalized.customerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`^${escaped}$`, 'i');
    match.$and = [{ $or: [{ customerCode: rx }, { customerId: rx }] }];
  }
  appendOrderKeyCondition(match, values);
  return match;
}

function activeConfirmedExclusionReasons(row = {}) {
  const reasons = [];
  const status = clean(row.status).toLowerCase();
  if (clean(row.account || 'AR').toUpperCase() !== 'AR') reasons.push('NOT_AR_ACCOUNT');
  if (row.accountingConfirmed !== true) reasons.push('ACCOUNTING_NOT_CONFIRMED');
  if (clean(row.accountingStatus).toLowerCase() !== 'confirmed') reasons.push('ACCOUNTING_STATUS_NOT_CONFIRMED');
  if (row.active !== true) reasons.push('LEDGER_INACTIVE');
  if (row.reversed === true) reasons.push('LEDGER_REVERSED');
  if (row.isDeleted === true || row.deleted === true || clean(row.deletedAt)) reasons.push('LEDGER_DELETED');
  if (['void', 'voided', 'cancelled', 'canceled', 'deleted', 'reversed', 'removed', 'superseded'].includes(status)) reasons.push(`STATUS_${status.toUpperCase()}`);
  return reasons;
}

function debtReadModelExclusionReasons(row = {}, filters = {}) {
  const reasons = activeConfirmedExclusionReasons(row);
  const category = clean(row.category).toUpperCase();
  const ledgerType = clean(row.ledgerType || row.category).toUpperCase();
  if (!ACTIVE_DEBT_READ_MODEL_CATEGORIES.includes(category)) reasons.push('CATEGORY_NOT_ACTIVE_DEBT_READ_MODEL');
  if (!ACTIVE_DEBT_READ_MODEL_CATEGORIES.includes(ledgerType)) reasons.push('LEDGER_TYPE_NOT_ACTIVE_DEBT_READ_MODEL');
  if (ACTIVE_DEBT_READ_MODEL_CATEGORIES.includes(category)
    && !String(category).startsWith('AR-DEBT-')
    && !canProjectDetailedAccountingCategoryBySource(row)) {
    reasons.push('DETAILED_ACCOUNTING_PROVENANCE_REJECTED');
  }
  const validation = validateArLedgerContract(row);
  if (!validation.ok) {
    for (const error of validation.errors || []) reasons.push(clean(error.code || 'AR_LEDGER_CONTRACT_INVALID'));
  }
  if (!canonicalRowMatchesFilters(row, normalizeArDebtFilters({ ...filters, status: 'all' }))) reasons.push('FILTER_MISMATCH');
  return Array.from(new Set(reasons.filter(Boolean)));
}

function ledgerSummary(row = {}, exclusionReasons = []) {
  return {
    ledgerId: clean(row.id || row.code || row._id),
    category: clean(row.category).toUpperCase(),
    ledgerType: clean(row.ledgerType || row.category).toUpperCase(),
    sourceType: clean(row.sourceType),
    sourceId: clean(row.sourceId),
    sourceCode: clean(row.sourceCode),
    orderId: clean(row.orderId || row.salesOrderId),
    orderCode: clean(row.orderCode || row.salesOrderCode),
    debit: Math.round(Number(row.debit || 0) || 0),
    credit: Math.round(Number(row.credit || 0) || 0),
    accountingConfirmed: row.accountingConfirmed === true,
    accountingStatus: clean(row.accountingStatus),
    active: row.active === true,
    reversed: row.reversed === true,
    status: clean(row.status),
    exclusionReason: exclusionReasons[0] || '',
    exclusionReasons
  };
}

async function getActiveDebtReadModelLedgersByOrderKeys(orderKeys = [], filters = {}, options = {}) {
  const { ArLedger } = getModels();
  const values = uniqueClean(orderKeys);
  if (!values.length) return options.includeRejected ? { canonicalLedgers: [], rejectedLedgers: [] } : [];
  const normalized = normalizeArDebtFilters({ ...filters, status: 'all' });
  const match = buildActiveDebtReadModelLedgerMatch(normalized);
  appendOrderKeyCondition(match, values);
  const rows = await queryRows(ArLedger, match, options);
  const result = normalizeAndValidateActiveDebtRows(rows, normalized);
  return options.includeRejected ? result : result.canonicalLedgers;
}

async function inspectActiveDebtReadModelLedgersByOrderKeys(orderKeys = [], filters = {}, options = {}) {
  const { ArLedger } = getModels();
  const values = uniqueClean(orderKeys);
  if (!values.length) {
    return {
      lookupKeys: [],
      rawMatch: buildRawArOrderLookupMatch([], filters),
      canonicalMatch: buildActiveDebtReadModelLedgerMatch(filters),
      rawMatchedLedgerCount: 0,
      rawActiveConfirmedLedgerCount: 0,
      canonicalMatchedLedgerCount: 0,
      excludedLedgerCount: 0,
      canonicalLedgers: [],
      rawActiveConfirmedLedgers: [],
      excludedLedgers: []
    };
  }

  const normalized = normalizeArDebtFilters({ ...filters, status: 'all' });
  const rawMatch = buildRawArOrderLookupMatch(values, normalized);
  const canonicalMatch = buildActiveDebtReadModelLedgerMatch(normalized);
  appendOrderKeyCondition(canonicalMatch, values);

  // Keep queries sequential: MongoDB transactions do not support parallel
  // operations on the same session reliably.
  const rawRows = await queryRows(ArLedger, rawMatch, options);
  const canonicalRows = await queryRows(ArLedger, canonicalMatch, options);
  const canonicalResult = normalizeAndValidateActiveDebtRows(canonicalRows, normalized);
  const canonicalIds = new Set(canonicalResult.canonicalLedgers.map((row) => clean(row.id || row.code || row._id)));
  const rawActiveConfirmedRows = (rawRows || []).filter((row) => activeConfirmedExclusionReasons(row).length === 0);
  const excludedLedgers = [];
  for (const row of rawRows || []) {
    const id = clean(row.id || row.code || row._id);
    if (canonicalIds.has(id) && canProjectCanonicalAccountingLedgerToDebtReadModel(row)) continue;
    const reasons = debtReadModelExclusionReasons(row, normalized);
    if (reasons.length) excludedLedgers.push(ledgerSummary(row, reasons));
  }

  return {
    lookupKeys: values,
    rawMatch,
    canonicalMatch,
    rawMatchedLedgerCount: (rawRows || []).length,
    rawActiveConfirmedLedgerCount: rawActiveConfirmedRows.length,
    canonicalMatchedLedgerCount: canonicalResult.canonicalLedgers.length,
    excludedLedgerCount: excludedLedgers.length,
    canonicalLedgers: canonicalResult.canonicalLedgers,
    rawActiveConfirmedLedgers: rawActiveConfirmedRows.map((row) => ledgerSummary(row, [])),
    excludedLedgers
  };
}


function batchContextError(code, message, data = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  error.data = data;
  return error;
}

const AR_ORDER_LOOKUP_FIELDS = Object.freeze([
  'sourceId', 'salesOrderId', 'orderId', 'sourceOrderId', 'canonicalOrderId', 'canonicalOrderKey', 'orderKey', 'refId',
  'sourceCode', 'salesOrderCode', 'orderCode', 'sourceOrderCode', 'canonicalOrderCode', 'refCode'
]);

function rowOrderLookupValues(row = {}) {
  return uniqueClean([
    ...AR_ORDER_LOOKUP_FIELDS.map((field) => row && row[field]),
    row && row.metadata && row.metadata.salesOrderId,
    row && row.metadata && row.metadata.orderId,
    row && row.metadata && row.metadata.salesOrderCode,
    row && row.metadata && row.metadata.orderCode
  ]);
}

function ledgerIdentityKey(row = {}) {
  return clean(row.id || row._id || row.code || row.idempotencyKey);
}

function rawCustomerMatches(row = {}, customerCode = '') {
  const expected = clean(customerCode).toLowerCase();
  if (!expected) return true;
  return [row.customerCode, row.customerId].map((value) => clean(value).toLowerCase()).some((value) => value === expected);
}

function normalizeBatchOrderScopes(scopes = []) {
  const normalized = [];
  const canonicalKeys = new Set();
  const aliasOwner = new Map();
  for (const input of Array.isArray(scopes) ? scopes : []) {
    const identity = input && input.identity && typeof input.identity === 'object' ? input.identity : {};
    const canonicalOrderKey = clean(input && input.canonicalOrderKey || identity.orderId || identity.orderCode);
    const lookupKeys = uniqueClean(identity.lookupKeys || input && input.lookupKeys || []);
    if (!canonicalOrderKey || !lookupKeys.length) {
      throw batchContextError('AR_BATCH_CANONICAL_IDENTITY_MISSING', 'AR batch context thiếu canonical order identity.', { canonicalOrderKey, lookupKeyCount: lookupKeys.length });
    }
    if (canonicalKeys.has(canonicalOrderKey)) {
      throw batchContextError('AR_BATCH_DUPLICATE_CANONICAL_IDENTITY', 'AR batch context có duplicate canonical order identity.', { canonicalOrderKey });
    }
    canonicalKeys.add(canonicalOrderKey);
    for (const alias of lookupKeys) {
      const owner = aliasOwner.get(alias);
      if (owner && owner !== canonicalOrderKey) {
        throw batchContextError('AR_BATCH_IDENTITY_ALIAS_COLLISION', 'Một AR order alias khớp nhiều canonical orders; batch bị chặn để tránh cross-assignment.', {
          alias,
          canonicalOrderKeys: [owner, canonicalOrderKey]
        });
      }
      aliasOwner.set(alias, canonicalOrderKey);
    }
    normalized.push({
      canonicalOrderKey,
      customerCode: clean(input && input.customerCode),
      identity: { ...identity, lookupKeys },
      lookupKeys
    });
  }
  return { scopes: normalized, aliasOwner, scopeByCanonicalKey: new Map(normalized.map((scope) => [scope.canonicalOrderKey, scope])) };
}

function partitionRowsByBatchScope(rows = [], scopeConfig = {}, options = {}) {
  const byCanonicalOrderKey = new Map((scopeConfig.scopes || []).map((scope) => [scope.canonicalOrderKey, []]));
  for (const row of Array.isArray(rows) ? rows : []) {
    const candidates = new Set();
    for (const alias of rowOrderLookupValues(row)) {
      const owner = scopeConfig.aliasOwner.get(alias);
      if (owner) candidates.add(owner);
    }
    if (!candidates.size) continue;
    if (candidates.size > 1) {
      throw batchContextError('AR_BATCH_LEDGER_CROSS_ASSIGNMENT', 'Một AR ledger khớp nhiều canonical orders trong batch.', {
        ledgerId: ledgerIdentityKey(row),
        canonicalOrderKeys: [...candidates]
      });
    }
    const canonicalOrderKey = [...candidates][0];
    const scope = scopeConfig.scopeByCanonicalKey instanceof Map
      ? scopeConfig.scopeByCanonicalKey.get(canonicalOrderKey)
      : (scopeConfig.scopes || []).find((item) => item.canonicalOrderKey === canonicalOrderKey);
    if (!scope) continue;
    if (options.raw === true && !rawCustomerMatches(row, scope.customerCode)) continue;
    if (options.raw !== true) {
      const normalized = normalizeArDebtFilters({ customerCode: scope.customerCode, status: 'all' });
      if (!canonicalRowMatchesFilters(row, normalized)) continue;
    }
    byCanonicalOrderKey.get(canonicalOrderKey).push(row);
  }
  return byCanonicalOrderKey;
}

function sumCanonicalBalanceRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
    const amounts = normalizeAccountingAmount(row);
    return Math.round(sum + Number(amounts.debit || 0) - Number(amounts.credit || 0));
  }, 0);
}

function inspectionFromPartitionedRows(scope = {}, rawRows = [], canonicalRows = []) {
  const normalized = normalizeArDebtFilters({ customerCode: scope.customerCode, status: 'all' });
  const canonicalResult = normalizeAndValidateActiveDebtRows(canonicalRows, normalized);
  const canonicalIds = new Set(canonicalResult.canonicalLedgers.map((row) => ledgerIdentityKey(row)));
  const rawActiveConfirmedRows = (rawRows || []).filter((row) => activeConfirmedExclusionReasons(row).length === 0);
  const excludedLedgers = [];
  for (const row of rawRows || []) {
    const id = ledgerIdentityKey(row);
    if (canonicalIds.has(id) && canProjectCanonicalAccountingLedgerToDebtReadModel(row)) continue;
    const reasons = debtReadModelExclusionReasons(row, normalized);
    if (reasons.length) excludedLedgers.push(ledgerSummary(row, reasons));
  }
  const currentArBalance = sumCanonicalBalanceRows(canonicalResult.canonicalLedgers);
  return {
    lookupKeys: scope.lookupKeys,
    rawMatchedLedgerCount: (rawRows || []).length,
    rawActiveConfirmedLedgerCount: rawActiveConfirmedRows.length,
    canonicalMatchedLedgerCount: canonicalResult.canonicalLedgers.length,
    excludedLedgerCount: excludedLedgers.length,
    canonicalLedgers: canonicalResult.canonicalLedgers,
    rawActiveConfirmedLedgers: rawActiveConfirmedRows.map((row) => ledgerSummary(row, [])),
    excludedLedgers,
    currentArBalance
  };
}

async function inspectActiveDebtReadModelLedgersForOrderScopes(scopes = [], options = {}) {
  const scopeConfig = normalizeBatchOrderScopes(scopes);
  const allKeys = uniqueClean(scopeConfig.scopes.flatMap((scope) => scope.lookupKeys));
  const byCanonicalOrderKey = new Map();
  if (!scopeConfig.scopes.length) return { byCanonicalOrderKey, rawQueryCount: 0, canonicalQueryCount: 0, scopeCount: 0, lookupKeyCount: 0 };

  // Resolve/validate the complete identity map before touching Mongo. Ambiguous or
  // duplicate identities must fail closed without consuming a transaction round-trip.
  const { ArLedger } = getModels();
  const rawMatch = buildRawArOrderLookupMatch(allKeys, { status: 'all' });
  const canonicalMatch = buildActiveDebtReadModelLedgerMatch({ status: 'all' });
  appendOrderKeyCondition(canonicalMatch, allKeys);

  // Transaction rule: keep these two reads sequential on the same session.
  const rawRows = await queryRows(ArLedger, rawMatch, { session: options.session, projection: options.projection, sort: options.sort });
  const canonicalRows = await queryRows(ArLedger, canonicalMatch, { session: options.session, projection: options.projection, sort: options.sort });
  const maxRows = Math.max(1, Math.min(250000, Number(options.maxRows || 100000)));
  if ((rawRows || []).length > maxRows || (canonicalRows || []).length > maxRows) {
    throw batchContextError('AR_BATCH_ROW_LIMIT_EXCEEDED', 'AR batch context vượt giới hạn dòng an toàn; request bị chặn thay vì dùng context một phần.', {
      maxRows,
      rawRows: (rawRows || []).length,
      canonicalRows: (canonicalRows || []).length
    });
  }

  const rawByKey = partitionRowsByBatchScope(rawRows, scopeConfig, { raw: true });
  const canonicalByKey = partitionRowsByBatchScope(canonicalRows, scopeConfig, { raw: false });
  for (const scope of scopeConfig.scopes) {
    byCanonicalOrderKey.set(scope.canonicalOrderKey, inspectionFromPartitionedRows(
      scope,
      rawByKey.get(scope.canonicalOrderKey) || [],
      canonicalByKey.get(scope.canonicalOrderKey) || []
    ));
  }
  return {
    byCanonicalOrderKey,
    rawQueryCount: 1,
    canonicalQueryCount: 1,
    scopeCount: scopeConfig.scopes.length,
    lookupKeyCount: allKeys.length
  };
}

function mergeActiveDebtInspectionWithRows(inspection = {}, rows = [], filters = {}) {
  const lookupKeys = uniqueClean(inspection.lookupKeys || []);
  if (!lookupKeys.length) throw batchContextError('AR_BATCH_CANONICAL_IDENTITY_MISSING', 'Không thể merge AR rows vào batch context không có lookupKeys.');
  const normalized = normalizeArDebtFilters({ customerCode: clean(filters.customerCode), status: 'all' });
  const next = {
    ...inspection,
    lookupKeys,
    canonicalLedgers: [...(inspection.canonicalLedgers || [])],
    rawActiveConfirmedLedgers: [...(inspection.rawActiveConfirmedLedgers || [])],
    excludedLedgers: [...(inspection.excludedLedgers || [])]
  };
  const known = new Set([
    ...next.canonicalLedgers,
    ...next.rawActiveConfirmedLedgers,
    ...next.excludedLedgers
  ].map(ledgerIdentityKey).filter(Boolean));

  for (const row of Array.isArray(rows) ? rows : []) {
    const rowKey = ledgerIdentityKey(row);
    if (rowKey && known.has(rowKey)) continue;
    const rowAliases = rowOrderLookupValues(row);
    if (!rowAliases.some((key) => lookupKeys.includes(key)) || !rawCustomerMatches(row, clean(filters.customerCode))) {
      throw batchContextError('AR_BATCH_POSTED_LEDGER_SCOPE_MISMATCH', 'AR ledger vừa post không thuộc đúng order/customer batch context.', {
        ledgerId: rowKey,
        lookupKeys
      });
    }
    next.rawMatchedLedgerCount = Number(next.rawMatchedLedgerCount || 0) + 1;
    const activeReasons = activeConfirmedExclusionReasons(row);
    if (!activeReasons.length) {
      next.rawActiveConfirmedLedgers.push(ledgerSummary(row, []));
      next.rawActiveConfirmedLedgerCount = Number(next.rawActiveConfirmedLedgerCount || 0) + 1;
    }
    const canonicalResult = normalizeAndValidateActiveDebtRows([row], normalized);
    if (canonicalResult.canonicalLedgers.length) {
      next.canonicalLedgers.push(canonicalResult.canonicalLedgers[0]);
      next.canonicalMatchedLedgerCount = Number(next.canonicalMatchedLedgerCount || 0) + 1;
    } else {
      const reasons = debtReadModelExclusionReasons(row, normalized);
      if (reasons.length) {
        next.excludedLedgers.push(ledgerSummary(row, reasons));
        next.excludedLedgerCount = Number(next.excludedLedgerCount || 0) + 1;
      }
    }
    if (rowKey) known.add(rowKey);
  }
  next.currentArBalance = sumCanonicalBalanceRows(next.canonicalLedgers);
  return next;
}


const DEFAULT_ORDER_SCOPE_LIMIT = 20000;
const DEFAULT_SCOPE_KEY_BATCH_SIZE = 400;
const DEFAULT_SCOPE_LEDGER_LIMIT = 100000;

function boundedPositiveInteger(value, fallback, max) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function mongoTextExpression(fieldExpression) {
  return {
    $trim: {
      input: {
        $toString: { $ifNull: [fieldExpression, ''] }
      }
    }
  };
}

function firstNonEmptyMongoExpression(expressions = []) {
  const values = expressions.map((expression) => (
    typeof expression === 'string' && expression.startsWith('$')
      ? mongoTextExpression(expression)
      : expression
  ));
  return values.reduceRight((fallback, expression) => ({
    $cond: [
      { $gt: [{ $strLenCP: expression }, 0] },
      expression,
      fallback
    ]
  }), '');
}

function canonicalOrderKeyMongoExpression() {
  const correctionSource = firstNonEmptyMongoExpression([
    '$correctionSourceCode', '$correctionCode', '$correctionSourceId', '$correctionId',
    '$sourceCode', '$refCode', '$sourceId', '$refId', '$code', '$id'
  ]);
  const parsedSalesOrder = {
    $let: {
      vars: {
        match: {
          $regexFind: {
            input: correctionSource,
            regex: /SO[0-9]{8,}/i
          }
        }
      },
      in: { $ifNull: ['$$match.match', ''] }
    }
  };
  return firstNonEmptyMongoExpression([
    '$canonicalOrderKey', '$canonicalOrderId', '$salesOrderId', '$orderId', '$sourceOrderId',
    '$metadata.salesOrderId', '$metadata.orderId', '$orderKey',
    parsedSalesOrder,
    '$canonicalOrderCode', '$salesOrderCode', '$orderCode', '$sourceOrderCode',
    '$metadata.salesOrderCode', '$metadata.orderCode', '$sourceId', '$refId', '$sourceCode', '$refCode'
  ]);
}

function buildActiveDebtOrderScopeCandidatePipeline(filters = {}, options = {}) {
  const maxOrderScopes = boundedPositiveInteger(options.maxOrderScopes, DEFAULT_ORDER_SCOPE_LIMIT, 100000);
  const match = buildActiveDebtReadModelLedgerMatch({ ...filters, status: 'all' });
  const aliasFields = [
    'canonicalOrderKey', 'canonicalOrderId', 'canonicalOrderCode', 'orderKey',
    'salesOrderId', 'orderId', 'sourceOrderId', 'refId', 'sourceId',
    'salesOrderCode', 'orderCode', 'sourceOrderCode', 'refCode', 'sourceCode',
    'returnOrderId', 'returnOrderCode', 'idempotencyKey', 'code', 'id',
    'metadata.salesOrderId', 'metadata.orderId', 'metadata.salesOrderCode', 'metadata.orderCode'
  ];
  const aliasExpressions = aliasFields.map((field) => mongoTextExpression(`$${field}`));
  return [
    { $match: match },
    {
      $project: {
        _id: 1,
        canonicalOrderKey: canonicalOrderKeyMongoExpression(),
        customerCode: mongoTextExpression('$customerCode'),
        customerName: mongoTextExpression('$customerName'),
        aliases: aliasExpressions
      }
    },
    { $match: { canonicalOrderKey: { $ne: '' } } },
    {
      $group: {
        _id: '$canonicalOrderKey',
        customerCode: { $first: '$customerCode' },
        customerName: { $first: '$customerName' },
        aliasGroups: { $push: '$aliases' }
      }
    },
    { $sort: { customerCode: 1, _id: 1 } },
    { $limit: maxOrderScopes + 1 }
  ];
}

function normalizeOrderScopeRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const aliases = Array.from(new Set([
      clean(row._id),
      ...(Array.isArray(row.aliases) ? row.aliases : []),
      ...(Array.isArray(row.aliasGroups) ? row.aliasGroups.flat(Infinity) : [])
    ].map(clean).filter(Boolean)));
    return {
      orderKey: clean(row.orderKey || row._id || aliases[0]),
      customerCode: clean(row.customerCode),
      customerName: clean(row.customerName),
      aliases
    };
  }).filter((row) => row.orderKey && row.aliases.length);
}

function buildOrderScopesFromCandidateLedgers(rows = []) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const identity = canonicalDebtOrderIdentity(row);
    const orderKey = clean(identity.canonicalOrderKey || row.orderKey || row.sourceId || row.sourceCode || row.id || row.code);
    if (!orderKey) continue;
    if (!map.has(orderKey)) {
      map.set(orderKey, {
        orderKey,
        customerCode: clean(row.customerCode),
        customerName: clean(row.customerName),
        aliases: new Set()
      });
    }
    const scope = map.get(orderKey);
    for (const alias of debtOrderAliasKeys(row)) scope.aliases.add(alias);
    scope.aliases.add(orderKey);
  }
  return Array.from(map.values()).map((row) => ({
    orderKey: row.orderKey,
    customerCode: row.customerCode,
    customerName: row.customerName,
    aliases: Array.from(row.aliases).map(clean).filter(Boolean)
  }));
}

async function discoverActiveDebtOrderScopes(filters = {}, options = {}) {
  const { ArLedger } = getModels();
  const maxOrderScopes = boundedPositiveInteger(options.maxOrderScopes, DEFAULT_ORDER_SCOPE_LIMIT, 100000);
  let scopes = [];
  let strategy = 'mongo-aggregation-order-scope';

  if (ArLedger && typeof ArLedger.aggregate === 'function' && options.disableAggregation !== true) {
    let aggregate = ArLedger.aggregate(buildActiveDebtOrderScopeCandidatePipeline(filters, { maxOrderScopes }));
    if (aggregate && typeof aggregate.allowDiskUse === 'function') aggregate = aggregate.allowDiskUse(true);
    if (options.session && aggregate && typeof aggregate.session === 'function') aggregate = aggregate.session(options.session);
    const rows = aggregate && typeof aggregate.exec === 'function' ? await aggregate.exec() : await aggregate;
    scopes = normalizeOrderScopeRows(rows);
  } else {
    strategy = 'query-fallback-order-scope';
    const normalized = normalizeArDebtFilters({ ...filters, status: 'all' });
    const rows = await queryRows(ArLedger, buildActiveDebtReadModelLedgerMatch(normalized), {
      ...options,
      limit: undefined,
      projection: options.scopeProjection || [
        '_id', 'id', 'code', 'category', 'ledgerType', 'sourceType',
        'sourceId', 'sourceCode', 'salesOrderId', 'salesOrderCode', 'orderId', 'orderCode',
        'sourceOrderId', 'sourceOrderCode', 'refId', 'refCode', 'canonicalOrderId', 'canonicalOrderCode', 'canonicalOrderKey', 'orderKey',
        'returnOrderId', 'returnOrderCode', 'idempotencyKey', 'customerCode', 'customerName',
        'salesStaffCode', 'salesmanCode', 'nvbhCode', 'deliveryStaffCode', 'deliveryCode', 'nvghCode',
        'account', 'accountingConfirmed', 'accountingStatus', 'active', 'reversed', 'isDeleted', 'deleted', 'deletedAt', 'status',
        'date', 'createdAt', 'debit', 'credit', 'amount', 'direction', 'amountField', 'metadata'
      ].join(' ')
    });
    const result = normalizeAndValidateActiveDebtRows(rows, normalized);
    scopes = buildOrderScopesFromCandidateLedgers(result.canonicalLedgers);
  }

  if (scopes.length > maxOrderScopes) {
    const error = new Error(`Phạm vi công nợ có hơn ${maxOrderScopes} đơn. Hãy thu hẹp điều kiện tìm kiếm.`);
    error.code = 'DEBT_ORDER_SCOPE_TOO_LARGE';
    error.status = 422;
    error.maxOrderScopes = maxOrderScopes;
    throw error;
  }

  return {
    scopes,
    diagnostics: {
      strategy,
      candidateOrderCount: scopes.length,
      maxOrderScopes,
      partial: false
    }
  };
}

function exactScopeLedgerFilters(filters = {}) {
  const stripped = stripStaffScopeFilters(filters);
  return {
    tenantId: clean(stripped.tenantId),
    dateFrom: clean(stripped.dateFrom || stripped.fromDate || stripped.from),
    dateTo: clean(stripped.dateTo || stripped.toDate || stripped.to),
    status: 'all'
  };
}

async function getActiveDebtReadModelLedgersForOrderScopes(scopes = [], filters = {}, options = {}) {
  const batchSize = boundedPositiveInteger(options.scopeKeyBatchSize, DEFAULT_SCOPE_KEY_BATCH_SIZE, 1000);
  const maxLedgerRows = boundedPositiveInteger(options.maxLedgerRows, DEFAULT_SCOPE_LEDGER_LIMIT, 500000);
  const aliases = Array.from(new Set((Array.isArray(scopes) ? scopes : [])
    .flatMap((scope) => [scope.orderKey, ...(Array.isArray(scope.aliases) ? scope.aliases : [])])
    .map(clean)
    .filter(Boolean)));
  if (!aliases.length) {
    return { ledgers: [], diagnostics: { aliasCount: 0, batchCount: 0, ledgerRowsRead: 0, maxLedgerRows, partial: false } };
  }

  const scopedFilters = exactScopeLedgerFilters(filters);
  const rows = [];
  const seen = new Set();
  let batchCount = 0;
  for (let index = 0; index < aliases.length; index += batchSize) {
    const batch = aliases.slice(index, index + batchSize);
    batchCount += 1;
    const batchRows = await getActiveDebtReadModelLedgersByOrderKeys(batch, scopedFilters, {
      ...options,
      limit: undefined
    });
    for (const row of Array.isArray(batchRows) ? batchRows : []) {
      const key = clean(row.id || row.code || row._id || row.idempotencyKey)
        || `${clean(row.customerCode)}::${clean(row.sourceId || row.sourceCode)}::${clean(row.category)}::${rows.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
      if (rows.length > maxLedgerRows) {
        const error = new Error(`Phạm vi công nợ có hơn ${maxLedgerRows} bút toán. Hãy thu hẹp điều kiện tìm kiếm.`);
        error.code = 'DEBT_LEDGER_SCOPE_TOO_LARGE';
        error.status = 422;
        error.maxLedgerRows = maxLedgerRows;
        throw error;
      }
    }
  }
  return {
    ledgers: rows,
    diagnostics: {
      aliasCount: aliases.length,
      batchCount,
      ledgerRowsRead: rows.length,
      maxLedgerRows,
      partial: false
    }
  };
}

async function getExactActiveDebtReadModelScope(filters = {}, options = {}) {
  const discovery = await discoverActiveDebtOrderScopes(filters, options);
  const ledgerResult = await getActiveDebtReadModelLedgersForOrderScopes(discovery.scopes, filters, options);
  return {
    scopes: discovery.scopes,
    canonicalLedgers: ledgerResult.ledgers,
    diagnostics: {
      ...discovery.diagnostics,
      ...ledgerResult.diagnostics,
      exactScope: true,
      filterBeforeAggregation: false,
      rawLedgerLimitApplied: false
    }
  };
}

function createOrderBucket(ledger = {}, rebuiltAt = dateUtil.nowIso()) {
  return {
    id: `AR-DEBT-ORDER:${ledger.customerCode}:${ledger.sourceId}`,
    customerCode: ledger.customerCode,
    customerName: ledger.customerName,
    sourceType: ledger.sourceType,
    sourceId: ledger.sourceId,
    sourceCode: ledger.sourceCode,
    salesStaffCode: ledger.salesStaffCode,
    salesStaffName: ledger.salesStaffName,
    deliveryStaffCode: ledger.deliveryStaffCode,
    deliveryStaffName: ledger.deliveryStaffName,
    masterOrderId: ledger.masterOrderId,
    masterOrderCode: ledger.masterOrderCode,
    debit: 0,
    credit: 0,
    remainingDebt: 0,
    rawDebt: 0,
    ledgerCount: 0,
    ledgerIds: [],
    lastDebtDate: '',
    status: 'paid',
    rebuiltAt,
    readModelVersion: 'phase87-single-ar-debt-closeout-v2'
  };
}

function aggregateRowsByOrder(ledgers = [], filters = {}) {
  const normalized = normalizeArDebtFilters(filters);
  const map = new Map();
  const rebuiltAt = filters.rebuiltAt || dateUtil.nowIso();
  for (const row of ledgers || []) {
    const ledger = isCanonicalArDebtLedger(row) ? normalizeCanonicalLedgerRow(row) : row;
    const key = `${ledger.customerCode}::${ledger.sourceId}`;
    if (!map.has(key)) map.set(key, createOrderBucket(ledger, rebuiltAt));
    const target = map.get(key);
    if (ledger.category === 'AR-DEBT-OPEN') {
      target.salesStaffCode = ledger.salesStaffCode || target.salesStaffCode;
      target.salesStaffName = ledger.salesStaffName || target.salesStaffName;
      target.deliveryStaffCode = ledger.deliveryStaffCode || target.deliveryStaffCode;
      target.deliveryStaffName = ledger.deliveryStaffName || target.deliveryStaffName;
      target.masterOrderId = ledger.masterOrderId || target.masterOrderId;
      target.masterOrderCode = ledger.masterOrderCode || target.masterOrderCode;
    }
    const signed = typeof ledger.signedAmount === 'number' ? ledger.signedAmount : getSignedArAmount(ledger);
    if (signed >= 0) target.debit += signed;
    else target.credit += Math.abs(signed);
    target.ledgerCount += 1;
    target.ledgerIds.push(ledger.id);
    if (!target.lastDebtDate || clean(ledger.date) > target.lastDebtDate) target.lastDebtDate = clean(ledger.date);
  }
  return Array.from(map.values()).map((row) => {
    row.debit = Math.round(row.debit);
    row.credit = Math.round(row.credit);
    row.rawDebt = Math.round(row.debit - row.credit);
    row.remainingDebt = normalizeDebtAmount(row.rawDebt);
    row.status = hasOpenDebt(row.remainingDebt) ? 'open' : 'paid';
    return row;
  }).filter((row) => matchesDebtStatus(row.remainingDebt, row, normalized.status))
    .sort((a, b) => Math.abs(b.remainingDebt) - Math.abs(a.remainingDebt) || a.customerName.localeCompare(b.customerName, 'vi'));
}

function aggregateRowsByCustomer(ledgers = [], filters = {}) {
  const orders = aggregateRowsByOrder(ledgers, { ...filters, status: 'all' });
  const normalized = normalizeArDebtFilters(filters);
  const map = new Map();
  for (const order of orders) {
    const key = order.customerCode || order.customerName || '(missing)';
    if (!map.has(key)) {
      map.set(key, {
        id: `AR-DEBT-CUSTOMER:${key}`,
        customerCode: order.customerCode,
        customerName: order.customerName,
        salesStaffCode: order.salesStaffCode,
        salesStaffName: order.salesStaffName,
        deliveryStaffCode: order.deliveryStaffCode,
        deliveryStaffName: order.deliveryStaffName,
        debit: 0,
        credit: 0,
        rawDebt: 0,
        remainingDebt: 0,
        orderCount: 0,
        ledgerCount: 0,
        lastDebtDate: '',
        status: 'paid',
        rebuiltAt: order.rebuiltAt,
        readModelVersion: order.readModelVersion
      });
    }
    const target = map.get(key);
    target.debit += order.debit;
    target.credit += order.credit;
    target.rawDebt += order.rawDebt;
    target.ledgerCount += order.ledgerCount;
    target.orderCount += hasOpenDebt(order.remainingDebt) ? 1 : 0;
    if (!target.salesStaffCode && order.salesStaffCode) target.salesStaffCode = order.salesStaffCode;
    if (!target.salesStaffName && order.salesStaffName) target.salesStaffName = order.salesStaffName;
    if (!target.deliveryStaffCode && order.deliveryStaffCode) target.deliveryStaffCode = order.deliveryStaffCode;
    if (!target.deliveryStaffName && order.deliveryStaffName) target.deliveryStaffName = order.deliveryStaffName;
    if (!target.lastDebtDate || order.lastDebtDate > target.lastDebtDate) target.lastDebtDate = order.lastDebtDate;
  }
  return Array.from(map.values()).map((row) => {
    row.debit = Math.round(row.debit);
    row.credit = Math.round(row.credit);
    row.rawDebt = Math.round(row.rawDebt);
    row.remainingDebt = normalizeDebtAmount(row.rawDebt);
    row.status = hasOpenDebt(row.remainingDebt) ? 'open' : 'paid';
    return row;
  }).filter((row) => matchesDebtStatus(row.remainingDebt, row, normalized.status))
    .sort((a, b) => Math.abs(b.remainingDebt) - Math.abs(a.remainingDebt) || a.customerName.localeCompare(b.customerName, 'vi'));
}

async function aggregateDebtByOrder(filters = {}, options = {}) {
  const ledgers = await getCanonicalArLedgers({ ...filters, status: 'all' }, options);
  return aggregateRowsByOrder(ledgers, filters);
}

async function aggregateDebtByCustomer(filters = {}, options = {}) {
  const ledgers = await getCanonicalArLedgers({ ...filters, status: 'all' }, options);
  return aggregateRowsByCustomer(ledgers, filters);
}

async function aggregateDebtByStaff(filters = {}, options = {}) {
  const ledgers = await getCanonicalArLedgers({ ...filters, status: 'all' }, options);
  const orders = aggregateRowsByOrder(ledgers, { ...filters, status: 'all' });
  const mode = clean(filters.staffMode || filters.collectorType || 'sales').toLowerCase() === 'delivery' ? 'delivery' : 'sales';
  const map = new Map();
  for (const order of orders) {
    const code = mode === 'delivery' ? order.deliveryStaffCode : order.salesStaffCode;
    const name = mode === 'delivery' ? order.deliveryStaffName : order.salesStaffName;
    const key = clean(code || name || '(missing)');
    if (!map.has(key)) map.set(key, { staffCode: clean(code), staffName: clean(name), debtAmount: 0, debtDocumentCount: 0, debit: 0, credit: 0 });
    const target = map.get(key);
    target.debit += order.debit;
    target.credit += order.credit;
    target.debtAmount += Math.max(0, order.remainingDebt);
    target.debtDocumentCount += hasOpenDebt(order.remainingDebt) ? 1 : 0;
  }
  return Array.from(map.values()).sort((a, b) => b.debtAmount - a.debtAmount || a.staffCode.localeCompare(b.staffCode));
}

module.exports = {
  setModelsForTest,
  buildCanonicalArLedgerMatch,
  buildActiveDebtReadModelLedgerMatch,
  normalizeArDebtFilters,
  getSignedArAmount,
  getCanonicalArLedgers,
  getActiveDebtReadModelLedgers,
  discoverActiveDebtOrderScopes,
  getActiveDebtReadModelLedgersForOrderScopes,
  getExactActiveDebtReadModelScope,
  buildActiveDebtOrderScopeCandidatePipeline,
  findArLedgerRowsByRawMatch,
  getCanonicalLedgersByRawMatch,
  getCanonicalLedgersByCustomer,
  getCanonicalLedgersBySource,
  getCanonicalLedgersByCustomerCodes,
  getCanonicalLedgersByOrderKeys,
  getActiveDebtReadModelLedgersByOrderKeys,
  inspectActiveDebtReadModelLedgersByOrderKeys,
  inspectActiveDebtReadModelLedgersForOrderScopes,
  mergeActiveDebtInspectionWithRows,
  aggregateDebtByCustomer,
  aggregateDebtByOrder,
  aggregateDebtByStaff,
  _internal: {
    normalizeAndValidateRows,
    normalizeAndValidateActiveDebtRows,
    normalizeOrderScopeRows,
    buildOrderScopesFromCandidateLedgers,
    exactScopeLedgerFilters,
    canonicalOrderKeyMongoExpression,
    aggregateRowsByOrder,
    aggregateRowsByCustomer,
    appendOrderKeyCondition,
    buildRawArOrderLookupMatch,
    activeConfirmedExclusionReasons,
    debtReadModelExclusionReasons,
    ledgerSummary,
    rowOrderLookupValues,
    normalizeBatchOrderScopes,
    partitionRowsByBatchScope,
    inspectionFromPartitionedRows,
    ledgerIdentityKey,
    sumCanonicalBalanceRows
  }
};
