'use strict';

const { normalizeDebtAmount } = require('../../constants/finance.constants');
const {
  arEntryBalanceEffect,
  isActiveArEntry,
  orderKeysFrom,
  normalizeArKey
} = require('../../utils/arLedger.util');
const { toNumber } = require('../../utils/common.util');
const { buildConfirmedArLedgerFilter } = require('../../utils/arLedgerStatus.util');


function getArLedgerModel() {
  return require('../../models/ArLedger');
}

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(text).filter(Boolean))];
}

function activeArLedgerQuery(extra = {}) {
  return buildConfirmedArLedgerFilter(extra, { extraInactiveStatuses: ['duplicate_cancelled', 'draft'] });
}

function orderIdentityValues(order = {}) {
  return unique(orderKeysFrom(order));
}

function customerIdentityValues(customer = {}) {
  return unique([
    customer.customerCode,
    customer.code,
    customer.customerId,
    customer.id,
    customer._id,
    customer.customerName,
    customer.name
  ]);
}

function orderMatchCondition(keys = []) {
  const values = unique(keys);
  if (!values.length) return null;
  return {
    $or: [
      { orderId: { $in: values } },
      { orderCode: { $in: values } },
      { salesOrderId: { $in: values } },
      { salesOrderCode: { $in: values } },
      { refId: { $in: values } },
      { refCode: { $in: values } },
      { sourceId: { $in: values } },
      { sourceCode: { $in: values } }
    ]
  };
}

function customerMatchCondition(keys = []) {
  const values = unique(keys);
  if (!values.length) return null;
  return {
    $or: [
      { customerCode: { $in: values } },
      { customerId: { $in: values } },
      { customerName: { $in: values } }
    ]
  };
}

function withSession(query, options = {}) {
  if (query && options.session && typeof query.session === 'function') query.session(options.session);
  return query;
}

function computeBalanceFromLedgers(rows = []) {
  return normalizeDebtAmount((Array.isArray(rows) ? rows : [])
    .filter(isActiveArEntry)
    .reduce((sum, row) => sum + arEntryBalanceEffect(row), 0));
}

function rowMatchesAnyOrderKey(row = {}, keys = []) {
  const wanted = new Set(unique(keys).map(lower));
  if (!wanted.size) return false;
  return orderIdentityValues(row).some((key) => wanted.has(lower(key)));
}

function rowMatchesAnyCustomerKey(row = {}, keys = []) {
  const wanted = new Set(unique(keys).map(lower));
  if (!wanted.size) return false;
  return customerIdentityValues(row).some((key) => wanted.has(lower(key)));
}

async function loadOrderLedgerRows(keys = [], options = {}) {
  const values = unique(keys);
  const condition = orderMatchCondition(values);
  if (!condition) return [];
  let query = getArLedgerModel().find(activeArLedgerQuery(condition));
  if (options.select) query = query.select(options.select);
  if (options.limit) query = query.limit(options.limit);
  query = withSession(query, options);
  return query.lean();
}

async function loadCustomerLedgerRows(keys = [], options = {}) {
  const values = unique(keys);
  const condition = customerMatchCondition(values);
  if (!condition) return [];
  let query = getArLedgerModel().find(activeArLedgerQuery(condition));
  if (options.select) query = query.select(options.select);
  if (options.limit) query = query.limit(options.limit);
  query = withSession(query, options);
  return query.lean();
}

async function getOrderBalance(orderOrKeys, options = {}) {
  const keys = Array.isArray(orderOrKeys) ? orderOrKeys : orderIdentityValues(orderOrKeys || {});
  const rows = await loadOrderLedgerRows(keys, options);
  return computeBalanceFromLedgers(rows.filter((row) => rowMatchesAnyOrderKey(row, keys)));
}

async function loadOrderBalances(ordersOrKeys = [], options = {}) {
  const inputs = Array.isArray(ordersOrKeys) ? ordersOrKeys : [ordersOrKeys];
  const keyGroups = inputs.map((item) => Array.isArray(item) ? unique(item) : orderIdentityValues(item || {}));
  const allKeys = unique(keyGroups.flat());
  const rows = await loadOrderLedgerRows(allKeys, options);
  const result = new Map();
  for (const keys of keyGroups) {
    const balance = computeBalanceFromLedgers(rows.filter((row) => rowMatchesAnyOrderKey(row, keys)));
    for (const key of keys) result.set(normalizeArKey(key), balance);
  }
  return result;
}

async function getCustomerBalance(customerOrKeys, options = {}) {
  const keys = Array.isArray(customerOrKeys) ? customerOrKeys : customerIdentityValues(customerOrKeys || {});
  const rows = await loadCustomerLedgerRows(keys, options);
  return computeBalanceFromLedgers(rows.filter((row) => rowMatchesAnyCustomerKey(row, keys)));
}

async function loadCustomerBalances(customersOrKeys = [], options = {}) {
  const inputs = Array.isArray(customersOrKeys) ? customersOrKeys : [customersOrKeys];
  const keyGroups = inputs.map((item) => Array.isArray(item) ? unique(item) : customerIdentityValues(item || {}));
  const allKeys = unique(keyGroups.flat());
  const rows = await loadCustomerLedgerRows(allKeys, options);
  const result = new Map();
  for (const keys of keyGroups) {
    const balance = computeBalanceFromLedgers(rows.filter((row) => rowMatchesAnyCustomerKey(row, keys)));
    for (const key of keys) result.set(lower(key), Math.max(0, toNumber(balance)));
  }
  return result;
}

module.exports = {
  activeArLedgerQuery,
  orderIdentityValues,
  customerIdentityValues,
  orderMatchCondition,
  customerMatchCondition,
  computeBalanceFromLedgers,
  loadOrderLedgerRows,
  loadCustomerLedgerRows,
  getOrderBalance,
  getCustomerBalance,
  loadOrderBalances,
  loadCustomerBalances,
  _internal: {
    rowMatchesAnyOrderKey,
    rowMatchesAnyCustomerKey,
    unique,
    lower
  }
};
