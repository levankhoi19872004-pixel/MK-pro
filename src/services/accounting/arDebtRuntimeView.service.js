'use strict';

const arLedgerReadService = require('../arLedgerRead.service');
const arBalanceService = require('./arBalanceService');

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
  const map = await getCustomerDebtMap([code], filters, options);
  return map.get(code) || emptyCustomerDebt(code, options);
}

async function getCustomerDebtMap(customerCodes = [], filters = {}, options = {}) {
  const codes = uniqueClean(customerCodes);
  const result = new Map();
  codes.forEach((code) => result.set(code, emptyCustomerDebt(code)));
  if (!codes.length) return result;

  // Mobile/runtime debt must tolerate both canonical families currently present in
  // arLedgers: new AR-DEBT-* rows and older complete AR-SALE/AR-RETURN/AR-RECEIPT
  // rows. arBalanceService reads confirmed active AR ledgers and applies the
  // shared category-effect amount policy without falling back to Customer or
  // SalesOrder debt caches.
  const balanceMap = await arBalanceService.loadCustomerBalances(codes, options);
  for (const code of codes) {
    const amount = money(balanceMap.get(code.toLowerCase()) ?? balanceMap.get(code) ?? 0);
    result.set(code, exposeCustomerDebt({
      customerCode: code,
      remainingDebt: amount,
      currentDebtAmount: amount,
      readModelVersion: 'mobile-canonical-ar-ledger-v3'
    }, code));
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
