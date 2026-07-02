'use strict';

const orderRepository = require('../../repositories/orderRepository');
const {
  activeDocumentFilter,
  accountingConfirmedFilter
} = require('../dashboard/DashboardMongoExpressions');
const {
  businessDate,
  firstText,
  firstNumber,
  inDateRange,
  paginate,
  staffIdentity,
  text,
  toNumber
} = require('./ReportDomainUtils');

const REWARD_AMOUNT_FIELDS = Object.freeze([
  'deliveryCloseout.rewardAmount',
  'rewardAmount',
  'bonusAmount',
  'allowanceAmount',
  'promotionRewardAmount',
  'displayRewardAmount',
  'bonusReturnAmount',
  'rewardOffsetAmount',
  'promotionOffsetAmount',
  // Fallback cho dữ liệu closeout cũ chỉ lưu TH/cấn trừ ở offsetAmount.
  'deliveryCloseout.offsetAmount',
  'offsetAmount',
  'debtOffsetAmount',
  'deliveryOffsetAmount',
  'otherOffsetAmount'
]);

const REWARD_DATE_FIELDS = Object.freeze([
  'deliveryCloseout.confirmedAt',
  'accountingConfirmedAt',
  'deliveryDate',
  'date',
  'orderDate',
  'documentDate',
  'createdAt'
]);

const REWARD_SOURCE_PROJECTION = [
  'id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderId', 'salesOrderCode',
  'date', 'orderDate', 'documentDate', 'deliveryDate', 'createdAt', 'updatedAt',
  'customerId', 'customerCode', 'customerName',
  'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName', 'nvbhCode', 'nvbhName',
  'deliveryStaffCode', 'deliveryStaffName', 'deliveryCode', 'deliveryName', 'nvghCode', 'nvghName',
  'status', 'deliveryStatus', 'accountingStatus', 'accountingConfirmed', 'accountingConfirmedAt', 'accountingConfirmedBy',
  'rewardAmount', 'bonusAmount', 'allowanceAmount', 'promotionRewardAmount', 'displayRewardAmount',
  'bonusReturnAmount', 'rewardOffsetAmount', 'promotionOffsetAmount',
  'offsetAmount', 'debtOffsetAmount', 'deliveryOffsetAmount', 'otherOffsetAmount',
  'deliveryCloseout', 'masterOrderId', 'masterOrderCode', 'deliveryMasterId', 'deliveryMasterCode',
  'note', 'deliveryNote'
].join(' ');

function hasOwnNestedValue(source = {}, field = '') {
  const raw = field.split('.').reduce((current, key) => current?.[key], source);
  return raw !== undefined && raw !== null && text(raw) !== '';
}

function rewardAmountOf(order = {}) {
  return Math.max(0, firstNumber(order, REWARD_AMOUNT_FIELDS, { positiveOnly: true }));
}

function rewardDateOf(order = {}) {
  return order._reportBusinessDate || businessDate(order, REWARD_DATE_FIELDS);
}

function rewardSourceFieldOf(order = {}) {
  for (const field of REWARD_AMOUNT_FIELDS) {
    if (hasOwnNestedValue(order, field) && toNumber(field.split('.').reduce((current, key) => current?.[key], order)) > 0) return field;
  }
  return '';
}

function orderCodeOf(order = {}) {
  return firstText(order, ['code', 'orderCode', 'salesOrderCode', 'documentCode', 'invoiceCode', 'id']);
}

function matchesRewardQuery(order = {}, query = {}) {
  const customerCode = text(query.customerCode || query.customerId);
  if (customerCode && ![order.customerCode, order.customerId].map(text).includes(customerCode)) return false;

  const salesStaffCode = text(query.salesStaffCode || query.salesmanCode || query.nvbhCode);
  if (salesStaffCode && ![order.salesStaffCode, order.salesmanCode, order.nvbhCode].map(text).includes(salesStaffCode)) return false;

  const deliveryStaffCode = text(query.deliveryStaffCode || query.deliveryCode || query.nvghCode);
  if (deliveryStaffCode && ![order.deliveryStaffCode, order.deliveryCode, order.nvghCode].map(text).includes(deliveryStaffCode)) return false;

  const needle = text(query.q || query.search || query.keyword).toLowerCase();
  if (!needle) return true;
  return [
    order.customerCode, order.customerId, order.customerName,
    order.salesStaffCode, order.salesmanCode, order.salesStaffName, order.salesmanName,
    order.deliveryStaffCode, order.deliveryStaffName,
    orderCodeOf(order), order.masterOrderCode, order.deliveryMasterCode, order.note, order.deliveryNote
  ].some((value) => text(value).toLowerCase().includes(needle));
}

function aggregateRewardCustomers(orders = []) {
  const grouped = new Map();

  for (const order of Array.isArray(orders) ? orders : []) {
    const rewardAmount = rewardAmountOf(order);
    if (rewardAmount <= 0) continue;

    const customerCode = firstText(order, ['customerCode', 'customerId']);
    const customerName = firstText(order, ['customerName']);
    const customerKey = customerCode || customerName;
    if (!customerKey) continue;

    const date = rewardDateOf(order);
    const salesStaff = staffIdentity(order, 'sales');
    const deliveryStaff = staffIdentity(order, 'delivery');
    const orderCode = orderCodeOf(order);

    if (!grouped.has(customerKey)) {
      grouped.set(customerKey, {
        customerCode,
        customerName,
        salesStaffCode: salesStaff.code,
        salesStaffName: salesStaff.name,
        deliveryStaffCode: deliveryStaff.code,
        deliveryStaffName: deliveryStaff.name,
        rewardCount: 0,
        orderCodes: new Set(),
        totalRewardAmount: 0,
        firstRewardDate: date,
        lastRewardDate: date,
        latestOrderCode: orderCode,
        latestRewardSourceField: rewardSourceFieldOf(order)
      });
    }

    const target = grouped.get(customerKey);
    target.rewardCount += 1;
    target.totalRewardAmount += rewardAmount;
    if (orderCode) target.orderCodes.add(orderCode);
    if (date && (!target.firstRewardDate || date < target.firstRewardDate)) target.firstRewardDate = date;
    if (date && (!target.lastRewardDate || date >= target.lastRewardDate)) {
      target.lastRewardDate = date;
      target.latestOrderCode = orderCode || target.latestOrderCode;
      target.latestRewardSourceField = rewardSourceFieldOf(order) || target.latestRewardSourceField;
    }
    if (!target.customerCode && customerCode) target.customerCode = customerCode;
    if (!target.customerName && customerName) target.customerName = customerName;
    if (!target.salesStaffCode && salesStaff.code) target.salesStaffCode = salesStaff.code;
    if (!target.salesStaffName && salesStaff.name) target.salesStaffName = salesStaff.name;
    if (!target.deliveryStaffCode && deliveryStaff.code) target.deliveryStaffCode = deliveryStaff.code;
    if (!target.deliveryStaffName && deliveryStaff.name) target.deliveryStaffName = deliveryStaff.name;
  }

  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      orderCount: row.orderCodes.size,
      averageRewardAmount: row.rewardCount > 0 ? row.totalRewardAmount / row.rewardCount : 0,
      orderCodes: undefined
    }))
    .sort((a, b) => b.totalRewardAmount - a.totalRewardAmount
      || text(b.lastRewardDate).localeCompare(text(a.lastRewardDate))
      || text(a.customerName).localeCompare(text(b.customerName), 'vi'));
}

function rewardOrderFilter() {
  return {
    ...activeDocumentFilter(),
    ...accountingConfirmedFilter(),
    $or: REWARD_AMOUNT_FIELDS.map((field) => ({ [field]: { $gt: 0 } }))
  };
}

async function loadRewardOrderRows(query = {}, dateFrom, dateTo) {
  const rows = await orderRepository.findAll(rewardOrderFilter(), {
    limit: Math.min(Math.max(Number(query.maxScanRows || query.__exportMaxRows || 50000), 1), 50000),
    projection: REWARD_SOURCE_PROJECTION,
    sort: { deliveryDate: -1, date: -1, updatedAt: -1 }
  });
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({ ...row, _reportBusinessDate: rewardDateOf(row) }))
    .filter((row) => inDateRange(row._reportBusinessDate, { dateFrom, dateTo }));
}

async function rewardByCustomerReport(query = {}) {
  const dateFrom = String(query.dateFrom || query.from || query.fromDate || '0000-01-01');
  const dateTo = String(query.dateTo || query.to || query.toDate || '9999-12-31');
  const rows = await loadRewardOrderRows(query, dateFrom, dateTo);

  const filtered = rows
    .filter((row) => rewardAmountOf(row) > 0)
    .filter((row) => matchesRewardQuery(row, query));
  const customers = aggregateRewardCustomers(filtered);
  const summary = customers.reduce((acc, row) => {
    acc.customerCount += 1;
    acc.rewardTransactionCount += toNumber(row.rewardCount);
    acc.orderCount += toNumber(row.orderCount);
    acc.totalRewardAmount += toNumber(row.totalRewardAmount);
    return acc;
  }, {
    customerCount: 0,
    rewardTransactionCount: 0,
    orderCount: 0,
    totalRewardAmount: 0,
    averageRewardPerCustomer: 0,
    averageRewardPerTransaction: 0,
    sourceOrderCount: filtered.length
  });
  summary.averageRewardPerCustomer = summary.customerCount > 0
    ? summary.totalRewardAmount / summary.customerCount
    : 0;
  summary.averageRewardPerTransaction = summary.rewardTransactionCount > 0
    ? summary.totalRewardAmount / summary.rewardTransactionCount
    : 0;

  const paged = paginate(customers, query, { defaultLimit: 50, maxLimit: 200 });
  return {
    source: 'orders_delivery_closeout_reward',
    rewardCollection: 'orders',
    sourceContract: {
      primaryCollection: 'orders',
      amountFields: REWARD_AMOUNT_FIELDS,
      dateFields: REWARD_DATE_FIELDS,
      accountingScope: 'accounting_confirmed_delivery_closeout'
    },
    dateFrom: String(query.dateFrom || query.from || query.fromDate || ''),
    dateTo: String(query.dateTo || query.to || query.toDate || ''),
    rewards: paged.rows,
    items: paged.rows,
    meta: paged.meta,
    summary
  };
}

module.exports = {
  REWARD_AMOUNT_FIELDS,
  REWARD_DATE_FIELDS,
  rewardOrderFilter,
  loadRewardOrderRows,
  rewardAmountOf,
  rewardDateOf,
  rewardSourceFieldOf,
  aggregateRewardCustomers,
  rewardByCustomerReport
};
