'use strict';

const dateUtil = require('../utils/date.util');
const { normalizeDebtAmount, hasOpenDebt } = require('../constants/finance.constants');
const { isCanonicalArDebtLedger, validateArLedgerContract } = require('../domain/ar/arLedgerValidator');
const {
  buildCanonicalArLedgerMatch,
  normalizeArDebtFilters,
  normalizeCanonicalLedgerRow,
  canonicalRowMatchesFilters,
  matchesDebtStatus,
  getSignedArAmount
} = require('../domain/ar/arLedgerQueryPolicy');

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
  if (typeof query.sort === 'function') query.sort({ customerCode: 1, sourceId: 1, date: 1, createdAt: 1, _id: 1 });
  if (typeof query.lean === 'function') query.lean();
  return query;
}

function normalizeAndValidateRows(rows = [], filters = {}) {
  const canonicalLedgers = [];
  const rejectedLedgers = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (isCanonicalArDebtLedger(row) && canonicalRowMatchesFilters(row, filters)) {
      canonicalLedgers.push(normalizeCanonicalLedgerRow(row));
    } else {
      rejectedLedgers.push({ ledgerId: clean(row.id || row.code || row._id), validation: validateArLedgerContract(row) });
    }
  }
  return { canonicalLedgers, rejectedLedgers };
}

async function getCanonicalArLedgers(filters = {}, options = {}) {
  const { ArLedger } = getModels();
  const normalized = normalizeArDebtFilters(filters);
  const rows = await queryRows(ArLedger, buildCanonicalArLedgerMatch(normalized), options);
  const result = normalizeAndValidateRows(rows, normalized);
  return options.includeRejected ? result : result.canonicalLedgers;
}

async function getCanonicalLedgersByCustomer(customerCode, filters = {}, options = {}) {
  return getCanonicalArLedgers({ ...filters, customerCode }, options);
}

async function getCanonicalLedgersBySource(sourceId, filters = {}, options = {}) {
  return getCanonicalArLedgers({ ...filters, sourceId }, options);
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
    readModelVersion: 'phase80-unified-ar-ledger-read-standard-v1'
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
    if (ledger.category === 'AR-SALE') {
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
  normalizeArDebtFilters,
  getSignedArAmount,
  getCanonicalArLedgers,
  getCanonicalLedgersByCustomer,
  getCanonicalLedgersBySource,
  aggregateDebtByCustomer,
  aggregateDebtByOrder,
  aggregateDebtByStaff,
  _internal: { normalizeAndValidateRows, aggregateRowsByOrder, aggregateRowsByCustomer }
};
