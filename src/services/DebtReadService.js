'use strict';

const reportService = require('./reportService');
const DebtCollection = require('../models/DebtCollection');
const dateUtil = require('../utils/date.util');
const { toNumber } = require('../utils/common.util');
const { normalizeDebtAmount, hasOpenDebt } = require('../constants/finance.constants');

const PENDING_STATUSES = ['submitted'];

function text(value) {
  return String(value || '').trim();
}

function money(value) {
  return Math.max(0, Math.round(toNumber(value)));
}

function cleanOrderCode(row = {}) {
  return text(row.salesOrderCode || row.orderCode || row.refCode || row.code);
}

function collectionDateFilter(query = {}) {
  const filter = {};
  if (query.fromDate || query.toDate || query.dateFrom || query.dateTo || query.date) {
    const from = dateUtil.toDateOnly(query.fromDate || query.dateFrom || query.date || '');
    const to = dateUtil.toDateOnly(query.toDate || query.dateTo || query.date || '');
    filter.submittedAt = {};
    if (from) filter.submittedAt.$gte = `${from}T00:00:00.000Z`;
    if (to) filter.submittedAt.$lte = `${to}T23:59:59.999Z`;
  }
  return filter;
}

function buildPendingFilter(query = {}) {
  const filter = {
    status: { $in: PENDING_STATUSES },
    ...collectionDateFilter(query)
  };

  if (query.customerCode) filter.customerCode = text(query.customerCode);
  if (query.customerId) filter.customerId = text(query.customerId);
  if (query.excludeCollectionId) {
    const value = text(query.excludeCollectionId);
    filter.$and = filter.$and || [];
    filter.$and.push({ id: { $ne: value } }, { code: { $ne: value } });
  }

  return filter;
}

function summarizePendingCollections(rows = []) {
  const byCustomer = new Map();
  const byOrder = new Map();
  let total = 0;

  for (const collection of rows || []) {
    const amount = money(collection.amount);
    total += amount;
    const customerKey = text(collection.customerCode || collection.customerId || collection.customerName);
    if (customerKey) byCustomer.set(customerKey, money((byCustomer.get(customerKey) || 0) + amount));

    const allocations = Array.isArray(collection.allocations) ? collection.allocations : [];
    for (const allocation of allocations) {
      const orderCode = cleanOrderCode(allocation);
      if (!orderCode) continue;
      const allocated = money(allocation.allocatedAmount ?? allocation.amount);
      byOrder.set(orderCode, money((byOrder.get(orderCode) || 0) + allocated));
    }
  }

  return { total, byCustomer, byOrder };
}

function normalizeDebtOrder(order = {}, pendingByOrder = new Map()) {
  const salesOrderCode = cleanOrderCode(order);
  const debt = normalizeDebtAmount(order.debt ?? order.debtAmount ?? 0);
  const pendingCollectedAmount = money(pendingByOrder.get(salesOrderCode) || 0);
  const availableDebt = Math.max(0, normalizeDebtAmount(debt - pendingCollectedAmount));

  return {
    salesOrderId: text(order.salesOrderId || order.orderId || order.id),
    salesOrderCode,
    orderDate: dateUtil.toDateOnly(order.documentDate || order.dueDate || order.orderDate || order.date || ''),
    documentDate: dateUtil.toDateOnly(order.documentDate || order.dueDate || order.orderDate || order.date || ''),
    debit: toNumber(order.debit),
    credit: toNumber(order.credit),
    debt,
    pendingCollectedAmount,
    availableDebt,
    overdueDays: toNumber(order.overdueDays),
    agingDays: toNumber(order.agingDays),
    status: order.status || ''
  };
}

function normalizeCustomerDebt(row = {}, pending = {}) {
  const customerKey = text(row.customerCode || row.customerId || row.customerName);
  const orders = (Array.isArray(row.orders) ? row.orders : [])
    .map((order) => normalizeDebtOrder(order, pending.byOrder || new Map()))
    .filter((order) => hasOpenDebt(order.debt) || order.pendingCollectedAmount > 0);

  const debtAmount = normalizeDebtAmount(row.debt ?? row.debtAmount ?? row.debtAmountTotal ?? 0);
  const pendingCollectedAmount = money(pending.byCustomer?.get(customerKey) || orders.reduce((sum, order) => sum + toNumber(order.pendingCollectedAmount), 0));
  const availableDebtAmount = Math.max(0, normalizeDebtAmount(debtAmount - pendingCollectedAmount));
  const oldestDebtDate = orders
    .filter((order) => hasOpenDebt(order.debt))
    .map((order) => order.orderDate || order.documentDate || '')
    .filter(Boolean)
    .sort()[0] || '';

  return {
    customerId: text(row.customerId),
    customerCode: text(row.customerCode),
    customerName: text(row.customerName),
    phone: text(row.phone),
    address: text(row.address),
    salesmanCode: text(row.salesmanCode),
    salesmanName: text(row.salesmanName),
    deliveryStaffCode: text(row.deliveryStaffCode),
    deliveryStaffName: text(row.deliveryStaffName),
    debtAmount,
    pendingCollectedAmount,
    availableDebtAmount,
    orderCount: toNumber(row.orderCount || orders.length),
    oldestDebtDate,
    orders,
    ledgers: orders.map((order) => ({
      date: order.documentDate || order.orderDate || '',
      type: 'AR-SALE',
      salesOrderCode: order.salesOrderCode || '',
      refCode: order.salesOrderCode || '',
      debit: toNumber(order.debit),
      credit: toNumber(order.credit),
      debt: normalizeDebtAmount(order.debt)
    }))
  };
}

async function getPendingCollections(query = {}) {
  return DebtCollection.find(buildPendingFilter(query)).limit(5000).lean();
}

async function getCustomerDebts(query = {}) {
  const scopedQuery = {
    ...query,
    limit: query.limit || 100,
    includePaid: query.includePaid || '0'
  };

  if (query.customerKeyword && !scopedQuery.q) scopedQuery.q = query.customerKeyword;

  const [report, pendingRows] = await Promise.all([
    reportService.debtCustomers(scopedQuery),
    String(query.includePendingCollections ?? '1') === '0' ? [] : getPendingCollections(query)
  ]);

  const pending = summarizePendingCollections(pendingRows);
  const sourceRows = Array.isArray(report.customerSummary) ? report.customerSummary : [];
  const items = sourceRows
    .map((row) => normalizeCustomerDebt(row, pending))
    .filter((item) => hasOpenDebt(item.debtAmount) || item.pendingCollectedAmount > 0)
    .sort((a, b) => toNumber(b.availableDebtAmount) - toNumber(a.availableDebtAmount) || toNumber(b.debtAmount) - toNumber(a.debtAmount));

  const summary = {
    ...(report.summary || {}),
    totalDebt: items.reduce((sum, item) => sum + toNumber(item.debtAmount), 0),
    pendingCollected: pending.total,
    availableDebt: items.reduce((sum, item) => sum + toNumber(item.availableDebtAmount), 0),
    customerCount: items.length,
    orderCount: items.reduce((sum, item) => sum + toNumber(item.orderCount), 0)
  };

  return {
    ok: true,
    source: 'DebtReadService',
    summary,
    items
  };
}

async function checkAvailableDebt(input = {}) {
  const customerCode = text(input.customerCode || input.customerId);
  const allocations = Array.isArray(input.allocations) ? input.allocations : [];
  if (!customerCode) return { ok: false, status: 400, message: 'Thiếu mã khách hàng' };
  if (!allocations.length) return { ok: false, status: 400, message: 'Cần chọn ít nhất một đơn nợ' };

  const report = await getCustomerDebts({
    ...(input.query || input.scope || {}),
    customerCode,
    includePendingCollections: '1',
    includePaid: '1',
    limit: input.limit || 100,
    excludeCollectionId: input.excludeCollectionId || ''
  });

  const customer = report.items.find((item) => text(item.customerCode || item.customerId) === customerCode) || report.items[0];
  if (!customer) return { ok: false, status: 404, message: 'Không tìm thấy công nợ của khách hàng' };

  const orderMap = new Map();
  for (const order of customer.orders || []) {
    if (order.salesOrderCode) orderMap.set(order.salesOrderCode, order);
    if (order.salesOrderId) orderMap.set(order.salesOrderId, order);
  }

  const checkedAllocations = [];
  let total = 0;
  for (const row of allocations) {
    const salesOrderCode = text(row.salesOrderCode || row.orderCode || row.refCode || row.code);
    const salesOrderId = text(row.salesOrderId || row.orderId || row.id);
    const key = salesOrderCode || salesOrderId;
    const allocatedAmount = money(row.allocatedAmount ?? row.amount ?? row.paymentAmount);
    if (!key || allocatedAmount <= 0) return { ok: false, status: 400, message: 'Dòng phân bổ thiếu đơn nợ hoặc số tiền' };
    const order = orderMap.get(key);
    if (!order) return { ok: false, status: 409, message: `Không tìm thấy đơn nợ ${key} của khách ${customerCode}` };
    if (allocatedAmount > toNumber(order.availableDebt) + 0.0001) {
      return { ok: false, status: 409, message: `Số tiền thu vượt công nợ còn lại của đơn ${key}` };
    }
    total += allocatedAmount;
    checkedAllocations.push({
      salesOrderId: order.salesOrderId || salesOrderId || '',
      salesOrderCode: order.salesOrderCode || salesOrderCode || '',
      orderDate: order.orderDate || order.documentDate || '',
      beforeDebt: toNumber(order.debt),
      pendingCollectedAmount: toNumber(order.pendingCollectedAmount),
      availableDebt: toNumber(order.availableDebt),
      allocatedAmount
    });
  }

  return {
    ok: true,
    customerId: customer.customerId || '',
    customerCode: customer.customerCode || customerCode,
    customerName: customer.customerName || '',
    debtAmount: customer.debtAmount,
    availableDebtAmount: customer.availableDebtAmount,
    allocatedAmount: total,
    allocations: checkedAllocations
  };
}

module.exports = {
  getCustomerDebts,
  checkAvailableDebt,
  _internal: {
    normalizeCustomerDebt,
    summarizePendingCollections,
    buildPendingFilter
  }
};
