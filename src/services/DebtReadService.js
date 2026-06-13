'use strict';

const reportService = require('./reportService');
const DebtCollection = require('../models/DebtCollection');
const ArLedger = require('../models/ArLedger');
const dateUtil = require('../utils/date.util');
const { toNumber } = require('../utils/common.util');
const { normalizeDebtAmount, hasOpenDebt } = require('../constants/finance.constants');

const PENDING_STATUSES = ['submitted', 'under_review'];
const INACTIVE_AR_STATUSES = ['void', 'cancelled', 'canceled', 'deleted', 'duplicate_cancelled', 'reversed'];

function text(value) {
  return String(value || '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function money(value) {
  return Math.max(0, Math.round(toNumber(value)));
}

function withSession(query, session) {
  return session && query && typeof query.session === 'function' ? query.session(session) : query;
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
  if (Array.isArray(query.orderCodes) && query.orderCodes.length) {
    const orderCodes = [...new Set(query.orderCodes.map(text).filter(Boolean))];
    filter.allocations = {
      $elemMatch: {
        $or: [
          { salesOrderCode: { $in: orderCodes } },
          { orderCode: { $in: orderCodes } },
          { salesOrderId: { $in: orderCodes } },
          { orderId: { $in: orderCodes } }
        ]
      }
    };
  }
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
  const orderType = text(order.orderType) || (/^NDNBLH/i.test(salesOrderCode) ? 'external_debt' : 'sales_order');

  return {
    salesOrderId: text(order.salesOrderId || order.orderId || order.id),
    salesOrderCode,
    orderType,
    orderDate: dateUtil.toDateOnly(order.documentDate || order.dueDate || order.orderDate || order.date || ''),
    documentDate: dateUtil.toDateOnly(order.documentDate || order.dueDate || order.orderDate || order.date || ''),
    debit: toNumber(order.debit),
    credit: toNumber(order.credit),
    debt,
    pendingCollectedAmount,
    availableDebt,
    overdueDays: toNumber(order.overdueDays),
    agingDays: toNumber(order.agingDays),
    status: order.status || '',
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode),
    salesStaffName: text(order.salesStaffName || order.salesmanName),
    deliveryStaffCode: text(order.deliveryStaffCode),
    deliveryStaffName: text(order.deliveryStaffName)
  };
}

function normalizeCustomerDebt(row = {}, pending = {}) {
  const customerKey = text(row.customerCode || row.customerId || row.customerName);
  const orders = (Array.isArray(row.orders) ? row.orders : [])
    .map((order) => normalizeDebtOrder(order, pending.byOrder || new Map()))
    .filter((order) => hasOpenDebt(order.debt) || order.pendingCollectedAmount > 0);

  const debtAmount = normalizeDebtAmount(row.debt ?? row.debtAmount ?? row.debtAmountTotal ?? 0);
  const orderPendingTotal = orders.reduce((sum, order) => sum + toNumber(order.pendingCollectedAmount), 0);
  const pendingCollectedAmount = money(orders.length ? orderPendingTotal : (pending.byCustomer?.get(customerKey) || 0));
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
    salesStaffCode: text(row.salesStaffCode || row.salesmanCode),
    salesStaffName: text(row.salesStaffName || row.salesmanName),
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
      type: order.orderType === 'external_debt' ? 'AR-EXTERNAL-DEBT' : 'AR-SALE',
      orderType: order.orderType,
      salesOrderCode: order.salesOrderCode || '',
      refCode: order.salesOrderCode || '',
      debit: toNumber(order.debit),
      credit: toNumber(order.credit),
      debt: normalizeDebtAmount(order.debt)
    }))
  };
}

async function getPendingCollections(query = {}, options = {}) {
  let q = DebtCollection.find(buildPendingFilter(query)).limit(5000);
  q = withSession(q, options.session || query.session);
  return q.lean();
}

async function getCustomerDebts(query = {}) {
  const scopedQuery = {
    ...query,
    limit: query.limit || 100,
    includePaid: query.includePaid || '0'
  };

  if (query.customerKeyword && !scopedQuery.q) scopedQuery.q = query.customerKeyword;

  const report = await reportService.debtCustomers(scopedQuery);
  const sourceRows = Array.isArray(report.customerSummary) ? report.customerSummary : [];
  const visibleOrderCodes = sourceRows.flatMap((row) => Array.isArray(row.orders) ? row.orders : [])
    .map((order) => cleanOrderCode(order))
    .filter(Boolean);
  // Pending phải khóa chung giữa NVBH/NVGH, nhưng chỉ tính các đơn thuộc scope đang xem.
  // Không lọc theo collectorCode vì người còn lại vẫn phải nhìn thấy phần tiền đã báo thu.
  const pendingRows = String(query.includePendingCollections ?? '1') === '0'
    ? []
    : await getPendingCollections({ ...query, orderCodes: visibleOrderCodes });
  const pending = summarizePendingCollections(pendingRows);
  const items = sourceRows
    .map((row) => normalizeCustomerDebt(row, pending))
    .filter((item) => hasOpenDebt(item.debtAmount) || item.pendingCollectedAmount > 0)
    .sort((a, b) => toNumber(b.availableDebtAmount) - toNumber(a.availableDebtAmount) || toNumber(b.debtAmount) - toNumber(a.debtAmount));

  const summary = {
    ...(report.summary || {}),
    totalDebt: items.reduce((sum, item) => sum + toNumber(item.debtAmount), 0),
    pendingCollected: items.reduce((sum, item) => sum + toNumber(item.pendingCollectedAmount), 0),
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

function activeArFilter() {
  return {
    status: { $nin: INACTIVE_AR_STATUSES },
    reversed: { $ne: true },
    refType: { $ne: 'AR_LEDGER_REVERSAL' },
    type: { $nin: ['ar_reversal', 'reversal', 'ar_void'] }
  };
}

function orderRefCondition(keys = []) {
  const values = [...new Set(keys.map(text).filter(Boolean))];
  return {
    $or: [
      { orderCode: { $in: values } },
      { salesOrderCode: { $in: values } },
      { refCode: { $in: values } },
      { orderId: { $in: values } },
      { salesOrderId: { $in: values } },
      { refId: { $in: values } }
    ]
  };
}

function rowMatchesOrder(row = {}, key = '') {
  const expected = text(key);
  return [row.orderCode, row.salesOrderCode, row.refCode, row.orderId, row.salesOrderId, row.refId]
    .some((value) => text(value) === expected);
}

function pickDebtSourceRow(rows = []) {
  return rows.find((row) => ['ar_sale', 'ar_external_debt'].includes(lower(row.type))) || rows.find((row) => toNumber(row.debit) > 0) || rows[0] || null;
}

function assignmentFromRow(row = {}) {
  return {
    salesStaffCode: text(row.salesStaffCode || row.salesmanCode || row.nvbhCode),
    salesStaffName: text(row.salesStaffName || row.salesmanName || row.nvbhName),
    deliveryStaffCode: text(row.deliveryStaffCode || row.deliveryCode || row.nvghCode),
    deliveryStaffName: text(row.deliveryStaffName || row.deliveryName || row.nvghName)
  };
}

function scopeMatches(source = {}, scope = {}) {
  const salesman = lower(scope.salesman || scope.salesStaffCode);
  const delivery = lower(scope.delivery || scope.deliveryStaffCode);
  const assignment = assignmentFromRow(source);
  if (salesman && ![assignment.salesStaffCode, assignment.salesStaffName].some((value) => lower(value) === salesman)) return false;
  if (delivery && ![assignment.deliveryStaffCode, assignment.deliveryStaffName].some((value) => lower(value) === delivery)) return false;
  return true;
}

async function loadOrderDebtRows(orderKeys = [], options = {}) {
  const keys = [...new Set(orderKeys.map(text).filter(Boolean))];
  if (!keys.length) return [];
  let query = ArLedger.find({ $and: [activeArFilter(), orderRefCondition(keys)] }).limit(Math.max(200, keys.length * 50));
  query = withSession(query, options.session);
  return query.lean();
}

async function loadPendingRows(orderKeys = [], options = {}) {
  const keys = [...new Set(orderKeys.map(text).filter(Boolean))];
  if (!keys.length) return [];
  const filter = {
    status: { $in: PENDING_STATUSES },
    allocations: {
      $elemMatch: {
        $or: [
          { salesOrderCode: { $in: keys } },
          { orderCode: { $in: keys } },
          { salesOrderId: { $in: keys } },
          { orderId: { $in: keys } }
        ]
      }
    }
  };
  if (options.excludeCollectionId) {
    const value = text(options.excludeCollectionId);
    filter.$and = [{ id: { $ne: value } }, { code: { $ne: value } }];
  }
  let query = DebtCollection.find(filter).limit(5000);
  query = withSession(query, options.session);
  return query.lean();
}

function pendingForOrder(rows = [], key = '') {
  return rows.reduce((sum, collection) => {
    const allocations = Array.isArray(collection.allocations) ? collection.allocations : [];
    return sum + allocations.reduce((inner, allocation) => {
      return rowMatchesOrder(allocation, key) ? inner + money(allocation.allocatedAmount ?? allocation.amount) : inner;
    }, 0);
  }, 0);
}

async function getOrderDebt(orderCode, options = {}) {
  const key = text(orderCode);
  if (!key) return { officialDebt: 0, pendingAmount: 0, availableDebt: 0, source: null };
  const [rows, pendingRows] = await Promise.all([
    loadOrderDebtRows([key], options),
    loadPendingRows([key], options)
  ]);
  const matching = rows.filter((row) => rowMatchesOrder(row, key));
  const officialDebt = normalizeDebtAmount(matching.reduce((sum, row) => sum + toNumber(row.debit) - toNumber(row.credit), 0));
  const pendingAmount = pendingForOrder(pendingRows, key);
  return {
    officialDebt,
    pendingAmount,
    availableDebt: Math.max(0, normalizeDebtAmount(officialDebt - pendingAmount)),
    source: pickDebtSourceRow(matching),
    rows: matching
  };
}

async function sumPendingAllocation(orderCode, options = {}) {
  const rows = await loadPendingRows([orderCode], options);
  return pendingForOrder(rows, orderCode);
}

async function checkAvailableDebt(input = {}) {
  const customerCode = text(input.customerCode || input.customerId);
  const allocations = Array.isArray(input.allocations) ? input.allocations : [];
  if (!customerCode) return { ok: false, status: 400, message: 'Thiếu mã khách hàng' };
  if (!allocations.length) return { ok: false, status: 400, message: 'Cần chọn ít nhất một đơn nợ' };

  const normalized = allocations.map((row) => ({
    key: text(row.salesOrderCode || row.orderCode || row.refCode || row.code || row.salesOrderId || row.orderId || row.id),
    requestedOrderId: text(row.salesOrderId || row.orderId || row.id),
    allocatedAmount: money(row.allocatedAmount ?? row.amount ?? row.paymentAmount)
  }));

  if (normalized.some((row) => !row.key || row.allocatedAmount <= 0)) {
    return { ok: false, status: 400, message: 'Dòng phân bổ thiếu đơn nợ hoặc số tiền' };
  }

  const keys = normalized.map((row) => row.key);
  const options = {
    session: input.session,
    excludeCollectionId: input.excludeCollectionId || ''
  };
  const [ledgerRows, pendingRows] = await Promise.all([
    loadOrderDebtRows(keys, options),
    loadPendingRows(keys, options)
  ]);

  const checkedAllocations = [];
  let total = 0;
  let firstSource = null;
  let firstAssignment = null;

  for (const row of normalized) {
    const matching = ledgerRows.filter((ledger) => rowMatchesOrder(ledger, row.key));
    const source = pickDebtSourceRow(matching);
    if (!source) return { ok: false, status: 409, message: `Không tìm thấy đơn nợ ${row.key}` };

    const sourceCustomerCode = text(source.customerCode || source.customerId);
    if (sourceCustomerCode && sourceCustomerCode !== customerCode) {
      return { ok: false, status: 409, message: `Đơn nợ ${row.key} không thuộc khách ${customerCode}` };
    }
    if (!scopeMatches(source, input.scope || input.query || {})) {
      return { ok: false, status: 403, message: `Bạn không được thu công nợ của đơn ${row.key}` };
    }

    const officialDebt = normalizeDebtAmount(matching.reduce((sum, ledger) => sum + toNumber(ledger.debit) - toNumber(ledger.credit), 0));
    const pendingAmount = pendingForOrder(pendingRows, row.key);
    const availableDebt = Math.max(0, normalizeDebtAmount(officialDebt - pendingAmount));
    if (row.allocatedAmount > availableDebt + 0.0001) {
      return { ok: false, status: 409, message: `Số tiền thu vượt công nợ còn có thể thu của đơn ${row.key}` };
    }

    const assignment = assignmentFromRow(source);
    if (!firstSource) {
      firstSource = source;
      firstAssignment = assignment;
    }

    total += row.allocatedAmount;
    checkedAllocations.push({
      salesOrderId: text(source.salesOrderId || source.orderId || source.refId || row.requestedOrderId),
      salesOrderCode: text(source.salesOrderCode || source.orderCode || source.refCode || row.key),
      orderType: text(source.orderType) || (lower(source.type) === 'ar_external_debt' ? 'external_debt' : 'sales_order'),
      orderDate: dateUtil.toDateOnly(source.date || source.documentDate || source.createdAt || ''),
      beforeDebt: officialDebt,
      pendingCollectedAmount: pendingAmount,
      availableDebt,
      allocatedAmount: row.allocatedAmount,
      ...assignment
    });
  }

  const assignment = firstAssignment || {};
  return {
    ok: true,
    customerId: text(firstSource?.customerId || input.customerId),
    customerCode: text(firstSource?.customerCode || customerCode),
    customerName: text(firstSource?.customerName),
    debtAmount: checkedAllocations.reduce((sum, row) => sum + toNumber(row.beforeDebt), 0),
    availableDebtAmount: checkedAllocations.reduce((sum, row) => sum + toNumber(row.availableDebt), 0),
    allocatedAmount: total,
    ...assignment,
    allocations: checkedAllocations
  };
}

module.exports = {
  getCustomerDebts,
  checkAvailableDebt,
  getOrderDebt,
  sumPendingAllocation,
  _internal: {
    normalizeCustomerDebt,
    summarizePendingCollections,
    buildPendingFilter,
    activeArFilter,
    orderRefCondition,
    assignmentFromRow,
    scopeMatches,
    pendingForOrder
  }
};
