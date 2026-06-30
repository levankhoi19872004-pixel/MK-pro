'use strict';

const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt } = require('../../constants/finance.constants');
const { normalizeAccountingAmount } = require('../../domain/ar/arLedgerValidator');
const arLedgerReadService = require('../arLedgerRead.service');

const ALLOWED_CATEGORIES = Object.freeze([
  'AR-DEBT-OPEN',
  'AR-DEBT-PAYMENT',
  'AR-DEBT-ADJUSTMENT',
  'AR-DEBT-VOID'
]);

function setModelsForTest(nextModels) {
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

  const q = text(query.q || query.search || query.keyword);
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

  const customer = text(query.customerCode || query.customerId || query.code);
  if (customer) {
    const rx = new RegExp(`^${escapeRegExp(customer)}$`, 'i');
    match.$and = Array.isArray(match.$and) ? match.$and : [];
    match.$and.push({ $or: [{ customerCode: rx }, { customerId: rx }] });
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
    acc.totalDebt += row.debt;
    acc.totalDebit += row.debit;
    acc.totalCredit += row.credit;
    acc.ledgerCount += row.ledgerCount;
    return acc;
  }, { customerCount: 0, orderCount: 0, totalDebt: 0, totalDebit: 0, totalCredit: 0, ledgerCount: ledgers.length });

  summary.totalDebt = money(summary.totalDebt);
  summary.totalDebit = money(summary.totalDebit);
  summary.totalCredit = money(summary.totalCredit);

  return { ledgers, orders, customers, summary };
}

async function listCustomers(query = {}, options = {}) {
  const limit = Math.max(1, Math.min(500, Number(query.ledgerLimit || query.limit || 500)));
  const ledgerRows = await arLedgerReadService.getCanonicalArLedgers({
    ...query,
    limit,
    status: 'all'
  }, options);
  const grouped = groupLedgers(ledgerRows, query);
  return {
    ...grouped,
    diagnostics: {
      source: 'debt-new-v1',
      endpoint: '/api/debt-new/customers',
      allowedCategories: ALLOWED_CATEGORIES,
      excludedLegacyCategories: ['AR-SALE', 'AR-SALE-REVERSAL', 'AR-RETURN', 'AR-RECEIPT'],
      writePolicy: 'read-only from AR-DEBT-* only'
    }
  };
}

module.exports = {
  ALLOWED_CATEGORIES,
  buildLedgerMatch,
  ledgerEffect,
  groupLedgers,
  listCustomers,
  setModelsForTest,
  _private: { normalizeLedger, orderKey }
};
