'use strict';

const SalesOrder = require('../models/SalesOrder');
const dateUtil = require('../utils/date.util');
const { toNumber } = require('../utils/common.util');

const INACTIVE_ORDER_STATUSES = new Set([
  'void',
  'voided',
  'cancelled',
  'canceled',
  'deleted',
  'removed',
  'reversed',
  'duplicate_cancelled'
]);

const TRUTHY_DELETE_VALUES = [true, 1, '1', 'true', 'TRUE', 'yes', 'YES'];

function text(value) {
  return String(value ?? '').trim();
}

function customerKey(value) {
  return text(value).toLowerCase();
}

function normalizeMonthKey(value = '') {
  const raw = text(value);
  const match = raw.match(/^(\d{4})[-/](\d{1,2})/);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return `${match[1]}-${String(month).padStart(2, '0')}`;
  }
  return dateUtil.todayVN().slice(0, 7);
}

function nextMonthStart(monthKey) {
  const [year, month] = normalizeMonthKey(monthKey).split('-').map(Number);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return `${next.year}-${String(next.month).padStart(2, '0')}-01`;
}

function monthDateContext(value = '') {
  const monthKey = normalizeMonthKey(value);
  const [year, month] = monthKey.split('-');
  const monthNumber = String(Number(month));
  const vnDatePattern = `^\\d{1,2}[-/.]0?${monthNumber}[-/.]${year}(?:\\D|$)`;
  return {
    monthKey,
    monthStart: `${monthKey}-01`,
    nextMonthStart: nextMonthStart(monthKey),
    vnDatePattern
  };
}

function activeOrderFilter() {
  return {
    status: { $nin: Array.from(INACTIVE_ORDER_STATUSES) },
    isDeleted: { $nin: TRUTHY_DELETE_VALUES },
    deleted: { $nin: TRUTHY_DELETE_VALUES },
    deletedAt: { $in: [null, ''] }
  };
}

function buildMonthlyOrderFilter(customerCodes = [], month = '') {
  const codes = [...new Set((customerCodes || []).map(text).filter(Boolean))];
  if (!codes.length) return { _id: { $exists: false } };

  const context = monthDateContext(month);
  const isoRegex = new RegExp(`^${context.monthKey}`);
  const vnRegex = new RegExp(context.vnDatePattern);
  const createdAtRange = {
    $gte: `${context.monthStart}T00:00:00.000Z`,
    $lt: `${context.nextMonthStart}T00:00:00.000Z`
  };

  return {
    customerCode: { $in: codes },
    ...activeOrderFilter(),
    $or: [
      { orderDate: isoRegex },
      { date: isoRegex },
      { documentDate: isoRegex },
      { orderDate: vnRegex },
      { date: vnRegex },
      { documentDate: vnRegex },
      { createdAt: createdAtRange }
    ]
  };
}

function isInactiveOrder(order = {}) {
  const status = text(order.status || order.lifecycleStatus).toLowerCase();
  return INACTIVE_ORDER_STATUSES.has(status)
    || TRUTHY_DELETE_VALUES.includes(order.isDeleted)
    || TRUTHY_DELETE_VALUES.includes(order.deleted)
    || Boolean(text(order.deletedAt));
}

function orderBusinessDate(order = {}) {
  return order.orderDate || order.date || order.documentDate || order.createdAt || '';
}

function isOrderInMonth(order = {}, month = '') {
  const normalizedDate = dateUtil.toDateOnly(orderBusinessDate(order));
  return Boolean(normalizedDate) && normalizedDate.startsWith(normalizeMonthKey(month));
}

function orderRevenue(order = {}) {
  return Math.max(0, toNumber(
    order.afterPromoAmount
    ?? order.totalAfterPromotion
    ?? order.totalAmount
    ?? order.amount
    ?? order.grandTotal
    ?? order.payableAmount
    ?? 0
  ));
}

function summarizeMonthlySales(orders = [], month = '') {
  const monthKey = normalizeMonthKey(month);
  const map = new Map();

  for (const order of orders || []) {
    if (isInactiveOrder(order) || !isOrderInMonth(order, monthKey)) continue;
    const key = customerKey(order.customerCode || order.customerId || order.customerName);
    if (!key) continue;
    const current = map.get(key) || { revenue: 0, orderCount: 0 };
    current.revenue += orderRevenue(order);
    current.orderCount += 1;
    map.set(key, current);
  }

  return map;
}

async function loadMonthlySalesByCustomer(customers = [], options = {}) {
  const codes = [...new Set((customers || [])
    .map((customer) => text(customer.code || customer.customerCode))
    .filter(Boolean))];
  const monthKey = normalizeMonthKey(options.month);
  if (!codes.length) return new Map();

  const orders = await SalesOrder.find(buildMonthlyOrderFilter(codes, monthKey))
    .select('customerId customerCode customerName orderDate date documentDate createdAt status lifecycleStatus isDeleted deleted deletedAt afterPromoAmount totalAfterPromotion totalAmount amount grandTotal payableAmount')
    .lean();

  return summarizeMonthlySales(orders, monthKey);
}

function attachMonthlySales(customers = [], metrics = new Map(), month = '') {
  const monthKey = normalizeMonthKey(month);
  return (customers || []).map((customer) => {
    const keys = [customer.code, customer.customerCode, customer.id, customer._id, customer.name, customer.customerName]
      .map(customerKey)
      .filter(Boolean);
    const metric = keys.map((key) => metrics.get(key)).find(Boolean) || { revenue: 0, orderCount: 0 };
    const monthRevenue = Math.round(toNumber(metric.revenue));
    return {
      ...customer,
      monthRevenue,
      monthSales: monthRevenue,
      customerMonthRevenue: monthRevenue,
      monthOrderCount: Math.max(0, Math.trunc(toNumber(metric.orderCount))),
      salesMonth: monthKey
    };
  });
}

module.exports = {
  loadMonthlySalesByCustomer,
  attachMonthlySales,
  normalizeMonthKey,
  _internal: {
    activeOrderFilter,
    buildMonthlyOrderFilter,
    isInactiveOrder,
    isOrderInMonth,
    monthDateContext,
    orderRevenue,
    summarizeMonthlySales
  }
};
