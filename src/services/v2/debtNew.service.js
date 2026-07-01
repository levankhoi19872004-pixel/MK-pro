'use strict';

const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt } = require('../../constants/finance.constants');
const { normalizeAccountingAmount } = require('../../domain/ar/arLedgerValidator');
const arLedgerReadService = require('../arLedgerRead.service');

let modelsForDebtNew = null;
function getDebtNewModels() {
  if (modelsForDebtNew) return modelsForDebtNew;
  modelsForDebtNew = { ArLedger: require('../../models/ArLedger') };
  return modelsForDebtNew;
}

const ALLOWED_CATEGORIES = Object.freeze([
  'AR-DEBT-OPEN',
  'AR-DEBT-PAYMENT',
  'AR-DEBT-ADJUSTMENT',
  'AR-DEBT-VOID'
]);

function setModelsForTest(nextModels) {
  modelsForDebtNew = nextModels || null;
  arLedgerReadService.setModelsForTest(nextModels || null);
}

function text(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return text(value).toUpperCase();
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function escapeRegExp(value = '') {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasSearchCriteria(query = {}) {
  const q = text(query.q || query.search || query.keyword || query.customerName || query.phone);
  const customer = text(query.customerCode || query.customerId || query.code || query.id);
  const order = text(query.orderCode || query.salesOrderCode || query.sourceCode || query.sourceId || query.salesOrderId || query.orderId);
  const salesman = text(query.salesman || query.salesStaffCode || query.salesmanCode || query.nvbhCode || query.nvbh);
  const delivery = text(query.delivery || query.deliveryStaffCode || query.deliveryCode || query.nvghCode || query.nvgh);
  // Trạng thái mặc định như open/all/paid/overpaid không được tính là điều kiện tìm kiếm.
  return Boolean(q || customer || order || salesman || delivery);
}

function emptyListResult(query = {}, reason = 'SEARCH_CRITERIA_REQUIRED') {
  return {
    ledgers: [],
    orders: [],
    customers: [],
    summary: emptySummary(),
    diagnostics: {
      source: 'debt-new-v2-guarded-empty',
      endpoint: '/api/new/debt/customers',
      reason,
      searchCriteriaRequired: true,
      hasSearchCriteria: hasSearchCriteria(query),
      allowedCategories: ALLOWED_CATEGORIES,
      excludedLegacyCategories: ['AR-SALE', 'AR-SALE-REVERSAL', 'AR-RETURN', 'AR-RECEIPT'],
      writePolicy: 'read-only from AR-DEBT-* only; debt collections are submitted separately and do not reduce debt until accounting confirm'
    }
  };
}

function emptySummary() {
  return {
    customerCount: 0,
    orderCount: 0,
    debtOrderCount: 0,
    totalDebt: 0,
    totalDebit: 0,
    totalCredit: 0,
    overdueAmount: 0,
    creditBalanceAmount: 0,
    overpaidCustomerCount: 0,
    paidCustomerCount: 0,
    openCustomerCount: 0,
    ledgerCount: 0
  };
}

function buildLedgerMatch(query = {}) {
  const match = {
    account: /^AR$/i,
    category: { $in: ALLOWED_CATEGORIES },
    ledgerType: { $in: ALLOWED_CATEGORIES },
    accountingConfirmed: true,
    active: { $ne: false },
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    status: { $nin: ['void', 'voided', 'cancelled', 'canceled', 'deleted', 'reversed'] }
  };

  const q = text(query.q || query.search || query.keyword || query.customerName || query.phone);
  if (q) {
    const rx = new RegExp(escapeRegExp(q), 'i');
    match.$or = [
      { customerCode: rx },
      { customerName: rx },
      { customerId: rx },
      { orderCode: rx },
      { salesOrderCode: rx },
      { orderId: rx },
      { salesOrderId: rx },
      { sourceCode: rx },
      { sourceId: rx },
      { code: rx },
      { id: rx }
    ];
  }

  const customer = text(query.customerCode || query.customerId || query.code || query.id);
  if (customer) {
    const rx = new RegExp(`^${escapeRegExp(customer)}$`, 'i');
    match.$and = Array.isArray(match.$and) ? match.$and : [];
    match.$and.push({ $or: [{ customerCode: rx }, { customerId: rx }] });
  }

  const order = text(query.orderCode || query.salesOrderCode || query.sourceCode || query.sourceId || query.salesOrderId || query.orderId);
  if (order) {
    const rx = new RegExp(`^${escapeRegExp(order)}$`, 'i');
    match.$and = Array.isArray(match.$and) ? match.$and : [];
    match.$and.push({ $or: [{ sourceCode: rx }, { salesOrderCode: rx }, { orderCode: rx }, { refCode: rx }, { sourceId: rx }, { salesOrderId: rx }, { orderId: rx }, { refId: rx }] });
  }

  const salesman = text(query.salesman || query.salesStaffCode || query.nvbh);
  if (salesman) {
    const rx = new RegExp(escapeRegExp(salesman), 'i');
    match.$and = Array.isArray(match.$and) ? match.$and : [];
    match.$and.push({ $or: [{ salesStaffCode: rx }, { salesStaffName: rx }, { salesmanCode: rx }, { salesmanName: rx }] });
  }

  const delivery = text(query.delivery || query.deliveryStaffCode || query.nvgh);
  if (delivery) {
    const rx = new RegExp(escapeRegExp(delivery), 'i');
    match.$and = Array.isArray(match.$and) ? match.$and : [];
    match.$and.push({ $or: [{ deliveryStaffCode: rx }, { deliveryStaffName: rx }, { deliveryCode: rx }, { deliveryName: rx }] });
  }

  return match;
}

function ledgerEffect(row = {}) {
  const amounts = normalizeAccountingAmount(row);
  return money(amounts.debit - amounts.credit);
}

function orderKey(row = {}) {
  const sourceType = upper(row.sourceType || row.refType);
  if (sourceType === 'DELIVERY_CLOSEOUT_CORRECTION') {
    return text(row.salesOrderId || row.orderId || row.salesOrderCode || row.orderCode || row.originalCloseoutId || row.newCloseoutId || row.sourceId || row.sourceCode || row.code || row.id);
  }
  return text(row.sourceId || row.salesOrderId || row.orderId || row.refId || row.sourceCode || row.salesOrderCode || row.orderCode || row.refCode || row.code || row.id);
}

function normalizeLedger(row = {}) {
  const amounts = normalizeAccountingAmount(row);
  return {
    id: text(row.id || row.code || row._id),
    code: text(row.code || row.id || row._id),
    category: upper(row.category),
    ledgerType: upper(row.ledgerType || row.category),
    customerCode: text(row.customerCode),
    customerName: text(row.customerName),
    sourceId: text(row.sourceId || row.salesOrderId || row.orderId || row.refId),
    sourceCode: text(row.sourceCode || row.salesOrderCode || row.orderCode || row.refCode),
    sourceType: upper(row.sourceType || row.refType),
    correctionId: text(row.correctionId),
    correctionCode: text(row.correctionCode),
    orderKey: orderKey(row),
    salesStaffCode: text(row.salesStaffCode || row.salesmanCode || row.nvbhCode),
    salesStaffName: text(row.salesStaffName || row.salesmanName || row.nvbhName),
    deliveryStaffCode: text(row.deliveryStaffCode || row.deliveryCode || row.nvghCode),
    deliveryStaffName: text(row.deliveryStaffName || row.deliveryName || row.nvghName),
    date: text(row.date || row.documentDate || row.createdAt),
    debit: money(amounts.debit),
    credit: money(amounts.credit),
    amount: money(amounts.amount),
    effect: money(amounts.debit - amounts.credit)
  };
}

function groupLedgers(ledgerRows = [], query = {}) {
  const ledgers = (Array.isArray(ledgerRows) ? ledgerRows : [])
    .filter((row) => ALLOWED_CATEGORIES.includes(upper(row.category)) && ALLOWED_CATEGORIES.includes(upper(row.ledgerType || row.category)))
    .map(normalizeLedger);

  const orderMap = new Map();
  for (const ledger of ledgers) {
    const key = `${ledger.customerCode || ledger.customerName}::${ledger.orderKey}`;
    if (!orderMap.has(key)) {
      orderMap.set(key, {
        id: `DEBTNEW-ORDER:${key}`,
        customerCode: ledger.customerCode,
        customerName: ledger.customerName,
        orderId: ledger.sourceId || ledger.orderKey,
        orderCode: ledger.sourceCode || ledger.orderKey,
        orderDate: ledger.date,
        salesStaffCode: ledger.salesStaffCode,
        salesStaffName: ledger.salesStaffName,
        deliveryStaffCode: ledger.deliveryStaffCode,
        deliveryStaffName: ledger.deliveryStaffName,
        debit: 0,
        credit: 0,
        debt: 0,
        rawDebt: 0,
        ledgerCount: 0,
        categories: {},
        lastDebtDate: ''
      });
    }
    const order = orderMap.get(key);
    if (!order.salesStaffCode && ledger.salesStaffCode) order.salesStaffCode = ledger.salesStaffCode;
    if (!order.salesStaffName && ledger.salesStaffName) order.salesStaffName = ledger.salesStaffName;
    if (!order.deliveryStaffCode && ledger.deliveryStaffCode) order.deliveryStaffCode = ledger.deliveryStaffCode;
    if (!order.deliveryStaffName && ledger.deliveryStaffName) order.deliveryStaffName = ledger.deliveryStaffName;
    order.debit += ledger.debit;
    order.credit += ledger.credit;
    order.ledgerCount += 1;
    order.categories[ledger.category] = (order.categories[ledger.category] || 0) + ledger.effect;
    if (!order.lastDebtDate || ledger.date > order.lastDebtDate) order.lastDebtDate = ledger.date;
    if (!order.orderDate || ledger.date < order.orderDate) order.orderDate = ledger.date;
  }

  let orders = Array.from(orderMap.values()).map((row) => {
    row.debit = money(row.debit);
    row.credit = money(row.credit);
    row.rawDebt = money(row.debit - row.credit);
    row.debt = normalizeDebtAmount(row.rawDebt, DEBT_ZERO_TOLERANCE);
    row.remainingDebt = row.debt;
    row.status = hasOpenDebt(row.debt) ? 'open' : (row.debt < 0 ? 'overpaid' : 'paid');
    return row;
  });

  const status = text(query.status || '').toLowerCase();
  if (!status || status === 'open') orders = orders.filter((row) => hasOpenDebt(row.debt));
  else if (status === 'paid') orders = orders.filter((row) => !hasOpenDebt(row.debt) && row.debt === 0);
  else if (status === 'overpaid') orders = orders.filter((row) => row.debt < 0);
  else if (status !== 'all') orders = orders.filter((row) => row.status === status);

  const customerMap = new Map();
  for (const order of orders) {
    const key = order.customerCode || order.customerName || '(missing)';
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        id: `DEBTNEW-CUSTOMER:${key}`,
        customerCode: order.customerCode,
        customerName: order.customerName,
        salesStaffCode: order.salesStaffCode,
        salesStaffName: order.salesStaffName,
        deliveryStaffCode: order.deliveryStaffCode,
        deliveryStaffName: order.deliveryStaffName,
        debit: 0,
        credit: 0,
        debt: 0,
        rawDebt: 0,
        orderCount: 0,
        ledgerCount: 0,
        lastDebtDate: '',
        orders: []
      });
    }
    const customer = customerMap.get(key);
    customer.debit += order.debit;
    customer.credit += order.credit;
    customer.rawDebt += order.rawDebt;
    customer.debt += order.debt;
    customer.orderCount += 1;
    customer.ledgerCount += order.ledgerCount;
    customer.orders.push(order);
    if (!customer.salesStaffCode && order.salesStaffCode) customer.salesStaffCode = order.salesStaffCode;
    if (!customer.salesStaffName && order.salesStaffName) customer.salesStaffName = order.salesStaffName;
    if (!customer.deliveryStaffCode && order.deliveryStaffCode) customer.deliveryStaffCode = order.deliveryStaffCode;
    if (!customer.deliveryStaffName && order.deliveryStaffName) customer.deliveryStaffName = order.deliveryStaffName;
    if (!customer.lastDebtDate || order.lastDebtDate > customer.lastDebtDate) customer.lastDebtDate = order.lastDebtDate;
  }

  const customers = Array.from(customerMap.values()).map((row) => {
    row.debit = money(row.debit);
    row.credit = money(row.credit);
    row.rawDebt = money(row.rawDebt);
    row.debt = normalizeDebtAmount(row.rawDebt, DEBT_ZERO_TOLERANCE);
    row.remainingDebt = row.debt;
    row.status = hasOpenDebt(row.debt) ? 'open' : (row.debt < 0 ? 'overpaid' : 'paid');
    row.orders.sort((a, b) => Math.abs(b.debt) - Math.abs(a.debt));
    return row;
  }).sort((a, b) => Math.abs(b.debt) - Math.abs(a.debt) || a.customerName.localeCompare(b.customerName, 'vi'));

  const summary = customers.reduce((acc, row) => {
    acc.customerCount += 1;
    acc.orderCount += row.orderCount;
    acc.debtOrderCount += row.orders.filter((order) => hasOpenDebt(order.debt)).length;
    acc.totalDebt += row.debt;
    acc.totalDebit += row.debit;
    acc.totalCredit += row.credit;
    acc.creditBalanceAmount += row.debt < 0 ? Math.abs(row.debt) : 0;
    acc.openCustomerCount += hasOpenDebt(row.debt) ? 1 : 0;
    acc.paidCustomerCount += !hasOpenDebt(row.debt) && row.debt === 0 ? 1 : 0;
    acc.overpaidCustomerCount += row.debt < 0 ? 1 : 0;
    acc.ledgerCount += row.ledgerCount;
    return acc;
  }, { ...emptySummary(), ledgerCount: ledgers.length });

  summary.totalDebt = money(summary.totalDebt);
  summary.totalDebit = money(summary.totalDebit);
  summary.totalCredit = money(summary.totalCredit);
  summary.creditBalanceAmount = money(summary.creditBalanceAmount);
  summary.overdueAmount = money(summary.overdueAmount);

  return { ledgers, orders, customers, summary };
}

async function listCustomers(query = {}, options = {}) {
  if (!hasSearchCriteria(query)) {
    return emptyListResult(query);
  }
  const normalizedQuery = { ...query };
  if (!text(normalizedQuery.q || normalizedQuery.search || normalizedQuery.keyword)) {
    const textSearch = text(normalizedQuery.customerName || normalizedQuery.phone);
    if (textSearch) normalizedQuery.q = textSearch;
  }
  const limit = Math.max(1, Math.min(500, Number(normalizedQuery.ledgerLimit || normalizedQuery.limit || 500)));
  const ledgerRows = await arLedgerReadService.getCanonicalArLedgers({
    ...normalizedQuery,
    limit,
    status: 'all'
  }, options);
  const grouped = groupLedgers(ledgerRows, normalizedQuery);
  return {
    ...grouped,
    diagnostics: {
      source: 'debt-new-v2-ar-debt-read-model',
      endpoint: '/api/new/debt/customers',
      hasSearchCriteria: hasSearchCriteria(query),
      searchCriteriaRequired: false,
      allowedCategories: ALLOWED_CATEGORIES,
      excludedLegacyCategories: ['AR-SALE', 'AR-SALE-REVERSAL', 'AR-RETURN', 'AR-RECEIPT'],
      writePolicy: 'read-only from AR-DEBT-* only; submitted debt collections do not reduce official debt until accounting confirm'
    }
  };
}




async function customerDetail(query = {}, options = {}) {
  const customerCode = text(query.customerCode || query.code || query.id);
  if (!customerCode) {
    return {
      ok: false,
      customer: null,
      debtOrders: [],
      movements: [],
      pendingCollections: [],
      diagnostics: {
        source: 'debt-new-detail-guarded-empty',
        endpoint: '/api/new/debt/customers/:customerCode/detail',
        reason: 'CUSTOMER_CODE_REQUIRED',
        searchCriteriaRequired: true
      }
    };
  }
  const result = await listCustomers({ ...query, customerCode, status: query.status || 'all' }, options);
  const customer = (result.customers || []).find((row) => upper(row.customerCode) === upper(customerCode)) || (result.customers || [])[0] || null;
  const movements = (result.ledgers || []).filter((row) => upper(row.customerCode) === upper(customerCode));
  return {
    ok: true,
    customer,
    debtOrders: customer ? (customer.orders || []) : [],
    movements,
    pendingCollections: [],
    diagnostics: {
      source: 'debt-new-detail-ar-debt-read-model',
      endpoint: '/api/new/debt/customers/:customerCode/detail',
      searchCriteriaRequired: false,
      allowedCategories: ALLOWED_CATEGORIES
    }
  };
}

async function findSuggestionLedgers(match = {}, limit = 100, options = {}) {
  const { ArLedger } = getDebtNewModels();
  const query = ArLedger.find(match);
  if (options.session && typeof query.session === 'function') query.session(options.session);
  if (typeof query.sort === 'function') query.sort({ customerCode: 1, customerName: 1, sourceCode: 1, date: -1, createdAt: -1 });
  if (typeof query.limit === 'function') query.limit(Math.max(1, Math.min(200, Number(limit) || 100)));
  if (typeof query.lean === 'function') query.lean();
  return query;
}

function suggestionLimit(value) {
  const n = Number(value || 10);
  return Math.max(1, Math.min(10, Number.isFinite(n) ? Math.round(n) : 10));
}

function suggestionTextMatches(value, q) {
  const hay = upper(value);
  const needle = upper(q);
  return hay.includes(needle);
}

function formatSuggestionMoney(value) {
  return money(value).toLocaleString('vi-VN');
}

function pushUniqueSuggestion(target, seen, item, q) {
  const key = `${item.type || ''}:${item.code || ''}:${item.orderCode || ''}:${item.name || ''}`.toUpperCase();
  if (!key || seen.has(key)) return;
  const starts = upper(item.code || item.orderCode || item.label).startsWith(upper(q));
  target.push({ ...item, _rank: starts ? 0 : 1 });
  seen.add(key);
}

function emptySuggestionResult(type, reason = 'MIN_QUERY_LENGTH') {
  return {
    items: [],
    diagnostics: {
      source: 'debt-new-suggestions-guarded-empty',
      endpoint: '/api/new/debt/suggestions',
      type: text(type || ''),
      reason,
      minQueryLength: 2,
      limit: 10,
      searchCriteriaRequired: true
    }
  };
}

async function customerOrderSuggestions(q, type, limit, options = {}) {
  const rows = await findSuggestionLedgers(buildLedgerMatch({ q }), Math.max(50, limit * 10), options);
  const result = groupLedgers(Array.isArray(rows) ? rows : [], { status: 'all' });
  const items = [];
  const seen = new Set();
  const includeCustomer = !type || type === 'customerorder' || type === 'customers' || type === 'customer';
  const includeOrder = !type || type === 'customerorder' || type === 'orders' || type === 'order';

  for (const customer of result.customers || []) {
    if (includeCustomer && (suggestionTextMatches(customer.customerCode, q) || suggestionTextMatches(customer.customerName, q) || suggestionTextMatches(customer.phone, q))) {
      pushUniqueSuggestion(items, seen, {
        type: 'customer',
        code: customer.customerCode || '',
        name: customer.customerName || '',
        phone: customer.phone || '',
        debtAmount: customer.debt || customer.remainingDebt || 0,
        label: [customer.customerCode, customer.customerName].filter(Boolean).join(' - '),
        subLabel: [customer.phone ? `SĐT: ${customer.phone}` : '', `Nợ: ${formatSuggestionMoney(customer.debt || customer.remainingDebt || 0)}`].filter(Boolean).join(' · ')
      }, q);
    }
    if (includeOrder) {
      for (const order of customer.orders || []) {
        const orderCode = order.orderCode || order.salesOrderCode || order.orderId || order.salesOrderId || '';
        if (!suggestionTextMatches(orderCode, q) && !suggestionTextMatches(customer.customerCode, q) && !suggestionTextMatches(customer.customerName, q)) continue;
        pushUniqueSuggestion(items, seen, {
          type: 'order',
          orderCode,
          code: orderCode,
          customerCode: customer.customerCode || order.customerCode || '',
          customerName: customer.customerName || order.customerName || '',
          debtAmount: order.debt || order.remainingDebt || 0,
          label: [orderCode, customer.customerCode || order.customerCode, customer.customerName || order.customerName].filter(Boolean).join(' - '),
          subLabel: `Còn nợ: ${formatSuggestionMoney(order.debt || order.remainingDebt || 0)}`
        }, q);
      }
    }
  }

  return {
    items: items.sort((a, b) => (a._rank - b._rank) || String(a.label || '').localeCompare(String(b.label || ''), 'vi')).slice(0, limit).map(({ _rank, ...row }) => row),
    diagnostics: {
      source: 'debt-new-suggestions-ar-debt-read-model',
      endpoint: '/api/new/debt/suggestions',
      type: type || 'customerOrder',
      limit,
      searchCriteriaRequired: false
    }
  };
}

async function staffSuggestions(q, role, limit, options = {}) {
  const isDelivery = ['delivery', 'deliverystaff', 'nvgh'].includes(role);
  const rows = await findSuggestionLedgers(buildLedgerMatch(isDelivery ? { delivery: q } : { salesman: q }), Math.max(50, limit * 10), options);
  const result = groupLedgers(Array.isArray(rows) ? rows : [], { status: 'all' });
  const map = new Map();
  for (const customer of result.customers || []) {
    const code = text(isDelivery ? customer.deliveryStaffCode : customer.salesStaffCode);
    const name = text(isDelivery ? customer.deliveryStaffName : customer.salesStaffName);
    if (!code && !name) continue;
    if (!suggestionTextMatches(code, q) && !suggestionTextMatches(name, q)) continue;
    const key = upper(code || name);
    const row = map.get(key) || { code, name, customerCount: 0, debtAmount: 0 };
    row.customerCount += 1;
    row.debtAmount += money(customer.debt || customer.remainingDebt || 0);
    map.set(key, row);
  }
  const items = Array.from(map.values()).map((row) => ({
    type: isDelivery ? 'delivery' : 'salesman',
    code: row.code,
    name: row.name,
    label: [row.code, row.name].filter(Boolean).join(' - '),
    subLabel: `Khách nợ: ${row.customerCount} · Nợ: ${formatSuggestionMoney(row.debtAmount)}`,
    debtAmount: money(row.debtAmount),
    customerCount: row.customerCount,
    _rank: upper(row.code).startsWith(upper(q)) ? 0 : 1
  })).sort((a, b) => (a._rank - b._rank) || String(a.label || '').localeCompare(String(b.label || ''), 'vi')).slice(0, limit).map(({ _rank, ...row }) => row);
  return {
    items,
    diagnostics: {
      source: 'debt-new-staff-suggestions-ar-debt-read-model',
      endpoint: '/api/new/debt/suggestions',
      type: isDelivery ? 'delivery' : 'salesman',
      limit,
      searchCriteriaRequired: false
    }
  };
}

async function suggestions(query = {}, options = {}) {
  const q = text(query.q || query.search || query.keyword);
  const type = upper(query.type || 'customerOrder').replace(/[^A-Z]/g, '').toLowerCase();
  const limit = suggestionLimit(query.limit);
  if (q.length < 2) return emptySuggestionResult(query.type, 'MIN_QUERY_LENGTH');
  if (['salesman', 'sales', 'salesstaff', 'nvbh'].includes(type)) return staffSuggestions(q, 'salesman', limit, options);
  if (['delivery', 'deliverystaff', 'nvgh'].includes(type)) return staffSuggestions(q, 'delivery', limit, options);
  if (['order', 'orders'].includes(type)) return customerOrderSuggestions(q, 'order', limit, options);
  if (['customer', 'customers'].includes(type)) return customerOrderSuggestions(q, 'customer', limit, options);
  return customerOrderSuggestions(q, 'customerorder', limit, options);
}

module.exports = {
  ALLOWED_CATEGORIES,
  buildLedgerMatch,
  hasSearchCriteria,
  ledgerEffect,
  groupLedgers,
  listCustomers,
  customerDetail,
  suggestions,
  setModelsForTest,
  _private: { normalizeLedger, orderKey, hasSearchCriteria, emptyListResult, emptySummary, emptySuggestionResult, suggestionLimit, findSuggestionLedgers }
};
