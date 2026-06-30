'use strict';

const arLedgerReadService = require('../arLedgerRead.service');

const DEBT_SOURCE = 'AR_DEBT_READ_MODEL_V2';

let readService = arLedgerReadService;

function setReadServiceForTest(nextService) {
  readService = nextService || arLedgerReadService;
}

function clean(value = '') {
  return String(value ?? '').trim();
}

function uniqueClean(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [values]).map(clean).filter(Boolean)));
}

function nowIso() {
  return new Date().toISOString();
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function emptyCustomerDebt(customerCode = '', extra = {}) {
  return {
    customerCode: clean(customerCode),
    customerName: clean(extra.customerName || ''),
    currentDebtAmount: 0,
    remainingDebt: 0,
    debtAmount: 0,
    totalDebt: 0,
    debtSource: DEBT_SOURCE,
    calculatedAt: nowIso(),
    orderDebts: []
  };
}

function exposeCustomerDebt(row = {}, fallbackCode = '') {
  const amount = money(row.remainingDebt ?? row.currentDebtAmount ?? 0);
  return {
    customerCode: clean(row.customerCode || fallbackCode),
    customerName: clean(row.customerName || ''),
    currentDebtAmount: amount,
    remainingDebt: amount,
    debtAmount: amount,
    totalDebt: amount,
    debtSource: DEBT_SOURCE,
    calculatedAt: nowIso(),
    orderCount: money(row.orderCount || 0),
    ledgerCount: money(row.ledgerCount || 0),
    salesStaffCode: clean(row.salesStaffCode || row.salesmanCode || ''),
    salesStaffName: clean(row.salesStaffName || row.salesmanName || ''),
    deliveryStaffCode: clean(row.deliveryStaffCode || ''),
    deliveryStaffName: clean(row.deliveryStaffName || ''),
    orderDebts: []
  };
}

function exposeOrderDebt(row = {}, fallbackKey = '') {
  const amount = money(row.remainingDebt ?? row.currentDebtAmount ?? 0);
  return {
    orderId: clean(row.sourceId || row.orderId || fallbackKey),
    orderCode: clean(row.sourceCode || row.orderCode || fallbackKey),
    customerCode: clean(row.customerCode || ''),
    customerName: clean(row.customerName || ''),
    currentDebtAmount: amount,
    remainingDebt: amount,
    debtAmount: amount,
    debtSource: DEBT_SOURCE,
    calculatedAt: nowIso(),
    ledgerCount: money(row.ledgerCount || 0)
  };
}

async function getCustomerDebt(customerCode, filters = {}, options = {}) {
  const code = clean(customerCode);
  if (!code) return emptyCustomerDebt('', options);
  const rows = await readService.aggregateDebtByCustomer({ ...filters, customerCode: code, status: filters.status || 'all' }, options);
  const match = (rows || []).find((row) => clean(row.customerCode).toLowerCase() === code.toLowerCase()) || rows?.[0];
  return match ? exposeCustomerDebt(match, code) : emptyCustomerDebt(code, options);
}

async function getCustomerDebtMap(customerCodes = [], filters = {}, options = {}) {
  const codes = uniqueClean(customerCodes);
  const result = new Map();
  codes.forEach((code) => result.set(code, emptyCustomerDebt(code)));
  if (!codes.length) return result;

  let rows = [];
  if (typeof readService.getCanonicalLedgersByCustomerCodes === 'function' && readService._internal?.aggregateRowsByCustomer) {
    const ledgers = await readService.getCanonicalLedgersByCustomerCodes(codes, { ...filters, status: filters.status || 'all' }, options);
    rows = readService._internal.aggregateRowsByCustomer(ledgers, { ...filters, status: filters.status || 'all' });
  } else {
    rows = await Promise.all(codes.map(async (code) => getCustomerDebt(code, filters, options)));
  }

  for (const row of rows || []) {
    const key = clean(row.customerCode);
    if (key) result.set(key, exposeCustomerDebt(row, key));
  }
  return result;
}


async function getDebtSummary(filters = {}, options = {}) {
  const rows = await readService.aggregateDebtByCustomer({ ...filters, status: filters.status || 'all' }, options);
  const customers = (rows || []).map((row) => exposeCustomerDebt(row, row.customerCode));
  return {
    debtSource: DEBT_SOURCE,
    calculatedAt: nowIso(),
    customerCount: customers.length,
    totalDebt: customers.reduce((sum, row) => sum + Number(row.currentDebtAmount || 0), 0),
    totalPositiveDebt: customers.reduce((sum, row) => sum + Math.max(0, Number(row.currentDebtAmount || 0)), 0),
    customers
  };
}

async function getOrderDebt(orderKey, filters = {}, options = {}) {
  const key = clean(orderKey);
  if (!key) return exposeOrderDebt({}, '');
  let rows = [];
  if (typeof readService.getCanonicalLedgersByOrderKeys === 'function' && readService._internal?.aggregateRowsByOrder) {
    const ledgers = await readService.getCanonicalLedgersByOrderKeys([key], { ...filters, status: filters.status || 'all' }, options);
    rows = readService._internal.aggregateRowsByOrder(ledgers, { ...filters, status: filters.status || 'all' });
  } else if (typeof readService.aggregateDebtByOrder === 'function') {
    rows = await readService.aggregateDebtByOrder({ ...filters, q: key, status: filters.status || 'all' }, options);
  }
  const match = (rows || []).find((row) => [row.sourceId, row.sourceCode, row.orderId, row.orderCode].some((value) => clean(value).toLowerCase() === key.toLowerCase())) || rows?.[0];
  return match ? exposeOrderDebt(match, key) : exposeOrderDebt({}, key);
}

module.exports = {
  DEBT_SOURCE,
  setReadServiceForTest,
  getCustomerDebt,
  getCustomerDebtMap,
  getOrderDebt,
  getDebtSummary,
  _internal: { exposeCustomerDebt, exposeOrderDebt, emptyCustomerDebt }
};
