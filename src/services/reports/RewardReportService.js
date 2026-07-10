'use strict';

const mongoose = require('mongoose');
const orderRepository = require('../../repositories/orderRepository');
const DeliveryCloseoutVersion = require('../../models/DeliveryCloseoutVersion');
const OrderPaymentAllocation = require('../../models/OrderPaymentAllocation');
const rewardResolver = require('./rewardReportSourceResolver');
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

const REWARD_AMOUNT_FIELDS = rewardResolver.ORDER_REWARD_FIELDS;

const REWARD_VERSION_AMOUNT_FIELDS = rewardResolver.VERSION_REWARD_FIELDS;
const REWARD_ALLOCATION_AMOUNT_FIELDS = rewardResolver.ALLOCATION_REWARD_FIELDS;


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


function isMongoConnected() {
  return Boolean(mongoose && mongoose.connection && mongoose.connection.readyState === 1);
}

function rewardJoinWarningsUnavailable(reason = '') {
  // Unit/static tests often run without an opened Mongo connection; optional joins are skipped there.
  // Runtime app keeps the connection open before serving reports, so unavailable source warnings are
  // still emitted for real query failures.
  if (!reason || reason === 'mongoose-not-connected') return [];
  return [{ code: 'REWARD_SECONDARY_SOURCE_UNAVAILABLE', reason }];
}

function orderIdentityValues(rows = []) {
  return Array.from(new Set((Array.isArray(rows) ? rows : [])
    .flatMap((row) => rewardResolver.orderIdentityKeys(row))
    .map(text)
    .filter(Boolean)));
}

async function findModelRows(model, filter, options = {}) {
  if (!model || typeof model.find !== 'function') return [];
  let query = model.find(filter, options.projection || undefined);
  if (options.sort && query && typeof query.sort === 'function') query = query.sort(options.sort);
  if (options.limit && query && typeof query.limit === 'function') query = query.limit(options.limit);
  if (options.session && query && typeof query.session === 'function') query = query.session(options.session);
  return query && typeof query.lean === 'function' ? query.lean() : query;
}

async function loadRewardCloseoutVersions(rows = [], options = {}) {
  const keys = orderIdentityValues(rows);
  if (!keys.length) return { lookup: new Map(), rows: [], warnings: [] };
  if (!isMongoConnected() && !options.allowDisconnectedSecondaryReads) {
    return { lookup: new Map(), rows: [], warnings: rewardJoinWarningsUnavailable('mongoose-not-connected') };
  }
  const filter = {
    status: { $nin: ['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'inactive'] },
    $or: [
      { orderId: { $in: keys } },
      { orderCode: { $in: keys } },
      { salesOrderId: { $in: keys } },
      { salesOrderCode: { $in: keys } },
      { originalOrderId: { $in: keys } },
      { originalOrderCode: { $in: keys } }
    ]
  };
  const found = await findModelRows(DeliveryCloseoutVersion, filter, {
    sort: { closeoutVersion: -1, updatedAt: -1, createdAt: -1 },
    limit: Math.min(Math.max(Number(options.maxSecondaryRows || 50000), 1), 50000)
  });
  return {
    lookup: rewardResolver.buildCloseoutVersionLookup(found || []),
    rows: found || [],
    warnings: []
  };
}

async function loadRewardPaymentAllocations(rows = [], options = {}) {
  const keys = orderIdentityValues(rows);
  if (!keys.length) return { lookup: new Map(), rows: [], warnings: [] };
  if (!isMongoConnected() && !options.allowDisconnectedSecondaryReads) {
    return { lookup: new Map(), rows: [], warnings: rewardJoinWarningsUnavailable('mongoose-not-connected') };
  }
  const filter = {
    status: { $nin: ['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'inactive', 'stale'] },
    $or: [
      { orderId: { $in: keys } },
      { orderCode: { $in: keys } },
      { salesOrderId: { $in: keys } },
      { salesOrderCode: { $in: keys } },
      { sourceId: { $in: keys } },
      { sourceCode: { $in: keys } }
    ]
  };
  const found = await findModelRows(OrderPaymentAllocation, filter, {
    sort: { sourceVersion: -1, postedAt: -1, updatedAt: -1, createdAt: -1 },
    limit: Math.min(Math.max(Number(options.maxSecondaryRows || 50000), 1), 50000)
  });
  return {
    lookup: rewardResolver.buildAllocationLookup(found || []),
    rows: found || [],
    warnings: []
  };
}

async function enrichRewardRowsWithFinalSource(rows = [], options = {}) {
  const warnings = [];
  const [versions, allocations] = await Promise.all([
    loadRewardCloseoutVersions(rows, options).catch((error) => ({ lookup: new Map(), rows: [], warnings: rewardJoinWarningsUnavailable(error.message) })),
    loadRewardPaymentAllocations(rows, options).catch((error) => ({ lookup: new Map(), rows: [], warnings: rewardJoinWarningsUnavailable(error.message) }))
  ]);
  warnings.push(...(versions.warnings || []), ...(allocations.warnings || []));

  const enriched = (Array.isArray(rows) ? rows : []).map((row) => {
    const latestCloseoutVersion = rewardResolver.findRelatedByOrder(row, versions.lookup);
    const currentPaymentAllocation = rewardResolver.findRelatedByOrder(row, allocations.lookup);
    const resolved = rewardResolver.resolveRewardSource({ order: row, latestCloseoutVersion, currentPaymentAllocation });
    return {
      ...row,
      _rewardResolved: resolved,
      _rewardSourceBreakdown: resolved.sourceBreakdown,
      _rewardWarnings: resolved.warnings || [],
      _latestRewardCloseoutVersion: latestCloseoutVersion || null,
      _currentRewardPaymentAllocation: currentPaymentAllocation || null
    };
  });

  return {
    rows: enriched,
    joins: {
      closeoutVersionRows: (versions.rows || []).length,
      paymentAllocationRows: (allocations.rows || []).length
    },
    warnings
  };
}

function hasOwnNestedValue(source = {}, field = '') {
  const raw = field.split('.').reduce((current, key) => current?.[key], source);
  return raw !== undefined && raw !== null && text(raw) !== '';
}

function rewardAmountOf(order = {}) {
  if (order && order._rewardResolved && order._rewardResolved.rewardAmount !== undefined) {
    return Math.max(0, toNumber(order._rewardResolved.rewardAmount));
  }
  return Math.max(0, firstNumber(order, REWARD_AMOUNT_FIELDS, { positiveOnly: true }));
}

function rewardDateOf(order = {}) {
  return order._reportBusinessDate || businessDate(order, REWARD_DATE_FIELDS);
}

function rewardSourceFieldOf(order = {}) {
  if (order && order._rewardResolved && order._rewardResolved.rewardSource) return order._rewardResolved.rewardSource;
  for (const field of REWARD_AMOUNT_FIELDS) {
    if (hasOwnNestedValue(order, field) && toNumber(field.split('.').reduce((current, key) => current?.[key], order)) > 0) return `orders.${field}`;
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
        latestRewardSourceField: rewardSourceFieldOf(order),
        latestRewardSourceBreakdown: order._rewardSourceBreakdown || null,
        rewardWarnings: [...(order._rewardWarnings || [])]
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
      if (order._rewardSourceBreakdown) target.latestRewardSourceBreakdown = order._rewardSourceBreakdown;
    }
    if (Array.isArray(order._rewardWarnings) && order._rewardWarnings.length) {
      target.rewardWarnings = [...(target.rewardWarnings || []), ...order._rewardWarnings];
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
    ...accountingConfirmedFilter()
  };
}

async function loadRewardOrderRows(query = {}, dateFrom, dateTo) {
  const rows = await orderRepository.findAll(rewardOrderFilter(), {
    limit: Math.min(Math.max(Number(query.maxScanRows || query.__exportMaxRows || 50000), 1), 50000),
    projection: REWARD_SOURCE_PROJECTION,
    sort: { accountingConfirmedAt: -1, 'deliveryCloseout.confirmedAt': -1, deliveryDate: -1, date: -1, updatedAt: -1 }
  });
  const scoped = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ ...row, _reportBusinessDate: rewardDateOf(row) }))
    .filter((row) => inDateRange(row._reportBusinessDate, { dateFrom, dateTo }));
  return enrichRewardRowsWithFinalSource(scoped, {
    maxSecondaryRows: query.maxSecondaryRows || query.__exportMaxRows || 50000,
    allowDisconnectedSecondaryReads: query.__allowDisconnectedSecondaryReads === true
  });
}

async function rewardByCustomerReport(query = {}) {
  const dateFrom = String(query.dateFrom || query.from || query.fromDate || '0000-01-01');
  const dateTo = String(query.dateTo || query.to || query.toDate || '9999-12-31');
  const loaded = await loadRewardOrderRows(query, dateFrom, dateTo);
  const rows = Array.isArray(loaded) ? loaded : (loaded.rows || []);
  const joinWarnings = Array.isArray(loaded) ? [] : (loaded.warnings || []);
  const sourceJoinStats = Array.isArray(loaded) ? {} : (loaded.joins || {});

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
  const rewardSourceWarnings = [
    ...joinWarnings,
    ...filtered.flatMap((row) => Array.isArray(row._rewardWarnings) ? row._rewardWarnings : [])
  ];
  const source = {
    primary: 'orders',
    rewardSources: [
      'orderPaymentAllocations.current',
      'deliveryCloseoutVersions.latest',
      'orders.deliveryCloseout',
      'orders.rewardAmount fallback'
    ],
    service: 'RewardReportService.rewardByCustomerReport',
    sourceKey: 'reward_final_state_current',
    warnings: rewardSourceWarnings
  };
  const sourceBreakdown = {
    rewardPolicy: {
      priority: [
        'orderPaymentAllocations.current.rewardAmount',
        'deliveryCloseoutVersions.latest.rewardAmount',
        'orders.deliveryCloseout.rewardAmount',
        'orders.rewardAmount fallback'
      ],
      dedupeKey: 'salesOrderId/orderId/orderCode',
      doubleCountPolicy: 'one reward row per canonical sales order before customer aggregation'
    },
    dateFilter: {
      from: String(query.dateFrom || query.from || query.fromDate || ''),
      to: String(query.dateTo || query.to || query.toDate || ''),
      businessDateField: 'deliveryCloseout.confirmedAt || accountingConfirmedAt || deliveryDate fallback',
      fallbackDateFieldsUsed: ['deliveryDate', 'date', 'orderDate', 'documentDate'],
      warning: 'confirmed date is preferred when available; fallback date fields are used only for legacy confirmed orders'
    },
    joinedSources: sourceJoinStats
  };

  return {
    source: 'reward_final_state_current',
    rewardCollection: 'orders',
    sourceInfo: source,
    sourceBreakdown,
    sourceWarnings: rewardSourceWarnings,
    sourceContract: {
      primaryCollection: 'orders',
      rewardSources: source.rewardSources,
      amountFields: {
        allocation: REWARD_ALLOCATION_AMOUNT_FIELDS,
        closeoutVersion: REWARD_VERSION_AMOUNT_FIELDS,
        orderFallback: REWARD_AMOUNT_FIELDS
      },
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
  enrichRewardRowsWithFinalSource,
  rewardAmountOf,
  rewardDateOf,
  rewardSourceFieldOf,
  aggregateRewardCustomers,
  rewardByCustomerReport
};
