'use strict';

const ArLedger = require('../../models/ArLedger');
const DebtCollection = require('../../models/DebtCollection');
const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const { escapeRegex } = require('../../utils/query.util');
const { normalizeDebtAmount, DEBT_ZERO_TOLERANCE } = require('../../constants/finance.constants');
const { arEntryBalanceEffect } = require('../../utils/arLedger.util');
const { parseMobilePagination, buildPagination } = require('./mobilePagination.util');

const PENDING_STATUSES = ['submitted', 'under_review'];
const INACTIVE_AR_STATUSES = ['void', 'cancelled', 'canceled', 'deleted', 'duplicate_cancelled', 'reversed'];
const SALE_TYPES = ['ar_sale', 'ar_external_debt'];

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(text).filter(Boolean))];
}

function caseVariants(value) {
  const raw = text(value);
  return raw ? unique([raw, raw.toUpperCase(), raw.toLowerCase()]) : [];
}

function activeArFilter() {
  return {
    status: { $nin: INACTIVE_AR_STATUSES },
    reversed: { $ne: true },
    refType: { $ne: 'AR_LEDGER_REVERSAL' },
    type: { $nin: ['ar_reversal', 'reversal', 'ar_void'] }
  };
}

function staffSeedCondition(query = {}) {
  const salesCode = text(query.salesStaffCode || query.salesmanCode);
  const deliveryCode = text(query.deliveryStaffCode);
  const salesName = !salesCode ? text(query.salesStaffName || query.salesmanName) : '';
  const deliveryName = !deliveryCode ? text(query.deliveryStaffName) : '';
  const clauses = [];

  if (salesCode) {
    const values = caseVariants(salesCode);
    clauses.push({
      $or: [
        { salesStaffCode: { $in: values } },
        { salesmanCode: { $in: values } },
        { nvbhCode: { $in: values } }
      ]
    });
  } else if (salesName) {
    const values = caseVariants(salesName);
    clauses.push({
      $or: [
        { salesStaffName: { $in: values } },
        { salesmanName: { $in: values } },
        { nvbhName: { $in: values } }
      ]
    });
  }

  if (deliveryCode) {
    const values = caseVariants(deliveryCode);
    clauses.push({
      $or: [
        { deliveryStaffCode: { $in: values } },
        { deliveryCode: { $in: values } },
        { nvghCode: { $in: values } }
      ]
    });
  } else if (deliveryName) {
    const values = caseVariants(deliveryName);
    clauses.push({
      $or: [
        { deliveryStaffName: { $in: values } },
        { deliveryName: { $in: values } },
        { nvghName: { $in: values } }
      ]
    });
  }

  if (!clauses.length) return null;
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function orderKeysFromSeed(rows = []) {
  return {
    ids: unique(rows.flatMap((row) => [row.orderId, row.salesOrderId, row.refId])),
    codes: unique(rows.flatMap((row) => [row.orderCode, row.salesOrderCode, row.refCode]))
  };
}

async function scopedArContext(query = {}) {
  const seedCondition = staffSeedCondition(query);
  if (!seedCondition) return { match: { ...activeArFilter() }, ids: [], codes: [] };

  const seedRows = await ArLedger.find({
    ...activeArFilter(),
    type: { $in: SALE_TYPES },
    ...seedCondition
  })
    .select('orderId salesOrderId refId orderCode salesOrderCode refCode')
    .limit(10000)
    .lean();

  const { ids, codes } = orderKeysFromSeed(seedRows);
  if (!ids.length && !codes.length) {
    return { match: { _id: '__NO_MOBILE_DEBT_SCOPE__' }, ids: [], codes: [] };
  }

  return {
    ids,
    codes,
    match: {
      ...activeArFilter(),
      $or: [
        ...(ids.length ? [
          { orderId: { $in: ids } },
          { salesOrderId: { $in: ids } },
          { refId: { $in: ids } }
        ] : []),
        ...(codes.length ? [
          { orderCode: { $in: codes } },
          { salesOrderCode: { $in: codes } },
          { refCode: { $in: codes } }
        ] : [])
      ]
    }
  };
}

async function scopedArMatch(query = {}) {
  return (await scopedArContext(query)).match;
}

function pendingFilter(query = {}, scope = {}) {
  const filter = { status: { $in: PENDING_STATUSES } };
  const ids = unique(scope.ids);
  const codes = unique(scope.codes);
  if (ids.length || codes.length) {
    filter.allocations = {
      $elemMatch: {
        $or: [
          ...(ids.length ? [
            { salesOrderId: { $in: ids } },
            { orderId: { $in: ids } }
          ] : []),
          ...(codes.length ? [
            { salesOrderCode: { $in: codes } },
            { orderCode: { $in: codes } }
          ] : [])
        ]
      }
    };
    return filter;
  }

  const salesCode = text(query.salesStaffCode || query.salesmanCode);
  const deliveryCode = text(query.deliveryStaffCode);
  if (salesCode) filter.salesStaffCode = { $in: caseVariants(salesCode) };
  if (deliveryCode) filter.deliveryStaffCode = { $in: caseVariants(deliveryCode) };
  return filter;
}

function orderCodeOf(row = {}) {
  return text(row.salesOrderCode || row.orderCode || row.refCode || row.code);
}

function allocationScopeKey(row = {}) {
  return lower(row.salesOrderCode || row.orderCode || row.salesOrderId || row.orderId || row.refCode || row.refId);
}

function summarizePending(rows = [], scope = {}) {
  const byOrder = new Map();
  const byCustomer = new Map();
  const allowed = new Set(unique([...(scope.ids || []), ...(scope.codes || [])]).map(lower));
  let total = 0;
  for (const row of rows || []) {
    const allocations = Array.isArray(row.allocations) ? row.allocations : [];
    const scopedAllocations = allowed.size
      ? allocations.filter((allocation) => allowed.has(allocationScopeKey(allocation)))
      : allocations;
    let scopedAmount = 0;
    for (const allocation of scopedAllocations) {
      const key = orderCodeOf(allocation);
      if (!key) continue;
      const allocated = Math.max(0, toNumber(allocation.allocatedAmount ?? allocation.amount));
      scopedAmount += allocated;
      byOrder.set(key, (byOrder.get(key) || 0) + allocated);
    }
    const amount = allocations.length ? scopedAmount : Math.max(0, toNumber(row.amount));
    total += amount;
    const customerKey = lower(row.customerCode || row.customerId || row.customerName);
    if (customerKey) byCustomer.set(customerKey, (byCustomer.get(customerKey) || 0) + amount);
  }
  return { total, byOrder, byCustomer };
}

function numberField(field) {
  return { $convert: { input: field, to: 'double', onError: 0, onNull: 0 } };
}

function typeText() {
  return { $toLower: { $ifNull: ['$type', ''] } };
}

function debitExpression() {
  return {
    $cond: [
      { $gt: [numberField('$debit'), 0] },
      numberField('$debit'),
      {
        $cond: [
          { $regexMatch: { input: typeText(), regex: 'sale|external_debt' } },
          numberField('$amount'),
          0
        ]
      }
    ]
  };
}

function creditExpression() {
  return {
    $cond: [
      { $gt: [numberField('$credit'), 0] },
      numberField('$credit'),
      {
        $cond: [
          { $regexMatch: { input: typeText(), regex: 'sale|external_debt' } },
          0,
          numberField('$amount')
        ]
      }
    ]
  };
}

async function getMobileCustomerDebts(query = {}) {
  const { page, limit, skip } = parseMobilePagination(query, { defaultLimit: 30, maxLimit: 100 });
  const scope = await scopedArContext(query);
  const match = scope.match;
  const keyword = text(query.q || query.customerKeyword || query.search);
  if (keyword && match._id !== '__NO_MOBILE_DEBT_SCOPE__') {
    const rx = new RegExp(escapeRegex(keyword), 'i');
    match.$and = [...(match.$and || []), {
      $or: [
        { customerCode: rx },
        { customerName: rx },
        { customerId: rx },
        { orderCode: rx },
        { salesOrderCode: rx },
        { refCode: rx }
      ]
    }];
  }

  const includePaid = String(query.includePaid || '0') === '1';
  const openDebtMatch = includePaid ? [] : [{ $match: { debt: { $gt: DEBT_ZERO_TOLERANCE } } }];

  const [facets, pendingRows] = await Promise.all([
    ArLedger.aggregate([
      { $match: match },
      {
        $project: {
          date: { $ifNull: ['$date', '$createdAt'] },
          orderId: { $ifNull: ['$orderId', { $ifNull: ['$salesOrderId', '$refId'] }] },
          orderCode: { $ifNull: ['$orderCode', { $ifNull: ['$salesOrderCode', '$refCode'] }] },
          customerId: 1,
          customerCode: 1,
          customerName: 1,
          phone: { $ifNull: ['$phone', '$customerPhone'] },
          address: { $ifNull: ['$address', '$customerAddress'] },
          salesStaffCode: { $ifNull: ['$salesStaffCode', { $ifNull: ['$salesmanCode', '$nvbhCode'] }] },
          salesStaffName: { $ifNull: ['$salesStaffName', { $ifNull: ['$salesmanName', '$nvbhName'] }] },
          deliveryStaffCode: { $ifNull: ['$deliveryStaffCode', { $ifNull: ['$deliveryCode', '$nvghCode'] }] },
          deliveryStaffName: { $ifNull: ['$deliveryStaffName', { $ifNull: ['$deliveryName', '$nvghName'] }] },
          debitValue: debitExpression(),
          creditValue: creditExpression()
        }
      },
      {
        $group: {
          _id: {
            customerCode: '$customerCode',
            customerId: '$customerId',
            customerName: '$customerName',
            orderCode: '$orderCode',
            orderId: '$orderId'
          },
          firstDate: { $min: '$date' },
          phone: { $max: '$phone' },
          address: { $max: '$address' },
          debit: { $sum: '$debitValue' },
          credit: { $sum: '$creditValue' },
          salesStaffCode: { $max: '$salesStaffCode' },
          salesStaffName: { $max: '$salesStaffName' },
          deliveryStaffCode: { $max: '$deliveryStaffCode' },
          deliveryStaffName: { $max: '$deliveryStaffName' }
        }
      },
      { $addFields: { debt: { $subtract: ['$debit', '$credit'] } } },
      ...openDebtMatch,
      {
        $group: {
          _id: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ['$_id.customerCode', ''] } }, 0] },
              { $concat: ['CODE:', { $toLower: '$_id.customerCode' }] },
              {
                $cond: [
                  { $gt: [{ $strLenCP: { $ifNull: ['$_id.customerId', ''] } }, 0] },
                  { $concat: ['ID:', { $toLower: '$_id.customerId' }] },
                  { $concat: ['NAME:', { $toLower: { $ifNull: ['$_id.customerName', ''] } }] }
                ]
              }
            ]
          },
          customerId: { $max: '$_id.customerId' },
          customerCode: { $max: '$_id.customerCode' },
          customerName: { $max: '$_id.customerName' },
          phone: { $max: '$phone' },
          address: { $max: '$address' },
          salesStaffCode: { $max: '$salesStaffCode' },
          salesStaffName: { $max: '$salesStaffName' },
          deliveryStaffCode: { $max: '$deliveryStaffCode' },
          deliveryStaffName: { $max: '$deliveryStaffName' },
          debit: { $sum: '$debit' },
          credit: { $sum: '$credit' },
          debt: { $sum: '$debt' },
          orderCount: { $sum: 1 },
          oldestDebtDate: { $min: '$firstDate' },
          orders: {
            $push: {
              salesOrderId: '$_id.orderId',
              salesOrderCode: '$_id.orderCode',
              orderDate: '$firstDate',
              documentDate: '$firstDate',
              debit: '$debit',
              credit: '$credit',
              debt: '$debt'
            }
          }
        }
      },
      { $sort: { debt: -1, customerName: 1, _id: 1 } },
      {
        $facet: {
          rows: [{ $skip: skip }, { $limit: limit }],
          totals: [{
            $group: {
              _id: null,
              totalRows: { $sum: 1 },
              totalDebt: { $sum: '$debt' },
              totalDebit: { $sum: '$debit' },
              totalCredit: { $sum: '$credit' },
              orderCount: { $sum: '$orderCount' }
            }
          }]
        }
      }
    ]).allowDiskUse(true).exec(),
    DebtCollection.find(pendingFilter(query, scope))
      .select('customerId customerCode customerName amount allocations salesStaffCode deliveryStaffCode status')
      .limit(5000)
      .lean()
  ]);

  const facet = facets?.[0] || {};
  const totals = facet.totals?.[0] || {};
  const pending = summarizePending(pendingRows, scope);
  const items = (facet.rows || []).map((row) => {
    const customerKey = lower(row.customerCode || row.customerId || row.customerName);
    const orders = (row.orders || []).map((order) => {
      const orderCode = text(order.salesOrderCode);
      const pendingCollectedAmount = Math.max(0, toNumber(pending.byOrder.get(orderCode) || 0));
      const debt = normalizeDebtAmount(order.debt);
      return {
        ...order,
        salesOrderId: text(order.salesOrderId),
        salesOrderCode: orderCode,
        orderDate: dateUtil.toDateOnly(order.orderDate || order.documentDate || ''),
        documentDate: dateUtil.toDateOnly(order.documentDate || order.orderDate || ''),
        debt,
        pendingCollectedAmount,
        availableDebt: Math.max(0, normalizeDebtAmount(debt - pendingCollectedAmount))
      };
    });
    const debtAmount = normalizeDebtAmount(row.debt);
    const orderPending = orders.reduce((sum, order) => sum + toNumber(order.pendingCollectedAmount), 0);
    const pendingCollectedAmount = Math.max(0, orderPending || toNumber(pending.byCustomer.get(customerKey) || 0));
    return {
      customerId: text(row.customerId),
      customerCode: text(row.customerCode),
      customerName: text(row.customerName),
      phone: text(row.phone),
      address: text(row.address),
      salesStaffCode: text(row.salesStaffCode),
      salesStaffName: text(row.salesStaffName),
      salesmanCode: text(row.salesStaffCode),
      salesmanName: text(row.salesStaffName),
      deliveryStaffCode: text(row.deliveryStaffCode),
      deliveryStaffName: text(row.deliveryStaffName),
      debtAmount,
      pendingCollectedAmount,
      availableDebtAmount: Math.max(0, normalizeDebtAmount(debtAmount - pendingCollectedAmount)),
      orderCount: Math.max(0, toNumber(row.orderCount)),
      oldestDebtDate: dateUtil.toDateOnly(row.oldestDebtDate || ''),
      orders,
      ledgers: orders.map((order) => ({
        date: order.documentDate,
        type: 'AR-SALE',
        salesOrderCode: order.salesOrderCode,
        refCode: order.salesOrderCode,
        debit: toNumber(order.debit),
        credit: toNumber(order.credit),
        debt: order.debt
      }))
    };
  });

  const pagination = buildPagination({ page, limit, totalRows: totals.totalRows || 0 });
  pagination.total = pagination.totalRows;
  pagination.nextPage = pagination.hasMore ? page + 1 : null;
  return {
    ok: true,
    source: 'mobile-ar-ledger-paged',
    summary: {
      totalDebt: normalizeDebtAmount(totals.totalDebt || 0),
      totalDebit: toNumber(totals.totalDebit),
      totalCredit: toNumber(totals.totalCredit),
      pendingCollected: Math.max(0, toNumber(pending.total)),
      availableDebt: Math.max(0, normalizeDebtAmount(toNumber(totals.totalDebt) - toNumber(pending.total))),
      customerCount: Math.max(0, toNumber(totals.totalRows)),
      orderCount: Math.max(0, toNumber(totals.orderCount))
    },
    items,
    pagination
  };
}

async function loadDebtBalancesForCustomers(customers = []) {
  const codes = unique(customers.flatMap((customer) => [customer.code, customer.customerCode]));
  const ids = unique(customers.flatMap((customer) => [customer.id, customer._id, customer.customerId]));
  if (!codes.length && !ids.length) return new Map();

  const rows = await ArLedger.find({
    ...activeArFilter(),
    $or: [
      ...(codes.length ? [{ customerCode: { $in: codes } }] : []),
      ...(ids.length ? [{ customerId: { $in: ids } }] : [])
    ]
  })
    .select('customerId customerCode debit credit amount type direction')
    .lean();

  const byStableKey = new Map();
  for (const row of rows || []) {
    const amount = arEntryBalanceEffect(row);
    const keys = unique([row.customerCode, row.customerId]).map(lower);
    for (const key of keys) byStableKey.set(key, (byStableKey.get(key) || 0) + amount);
  }

  const result = new Map();
  for (const customer of customers || []) {
    const keys = unique([customer.code, customer.customerCode, customer.id, customer._id, customer.customerId]).map(lower);
    const balance = keys.map((key) => byStableKey.get(key)).find((value) => value !== undefined) || 0;
    for (const key of keys) result.set(key, normalizeDebtAmount(balance));
  }
  return result;
}

module.exports = {
  getMobileCustomerDebts,
  loadDebtBalancesForCustomers,
  _internal: {
    activeArFilter,
    staffSeedCondition,
    scopedArContext,
    scopedArMatch,
    pendingFilter,
    summarizePending,
    orderKeysFromSeed
  }
};
