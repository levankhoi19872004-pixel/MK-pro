'use strict';

const dateUtil = require('../utils/date.util');
const { normalizeDebtAmount, hasOpenDebt } = require('../constants/finance.constants');
const {
  isCanonicalArDebtLedger,
  canProjectCanonicalAccountingLedgerToDebtReadModel,
  validateArLedgerContract,
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

  const eligibleRows = filterReadModelEligibleArLedgers(rawCanonicalLedgers);
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
      canonicalLedgers.push(normalizeCanonicalLedgerRow(row));
    } else {
      rejectedLedgers.push({ ledgerId: clean(row.id || row.code || row._id), validation: validateArLedgerContract(row) });
    }
  }
  return { canonicalLedgers, rejectedLedgers };
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
      { refId: { $in: keys } },
      { sourceCode: { $in: keys } },
      { salesOrderCode: { $in: keys } },
      { orderCode: { $in: keys } },
      { refCode: { $in: keys } }
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
  findArLedgerRowsByRawMatch,
  getCanonicalLedgersByRawMatch,
  getCanonicalLedgersByCustomer,
  getCanonicalLedgersBySource,
  getCanonicalLedgersByCustomerCodes,
  getCanonicalLedgersByOrderKeys,
  getActiveDebtReadModelLedgersByOrderKeys,
  inspectActiveDebtReadModelLedgersByOrderKeys,
  aggregateDebtByCustomer,
  aggregateDebtByOrder,
  aggregateDebtByStaff,
  _internal: {
    normalizeAndValidateRows,
    normalizeAndValidateActiveDebtRows,
    aggregateRowsByOrder,
    aggregateRowsByCustomer,
    appendOrderKeyCondition,
    buildRawArOrderLookupMatch,
    activeConfirmedExclusionReasons,
    debtReadModelExclusionReasons,
    ledgerSummary
  }
};
