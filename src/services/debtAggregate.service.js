'use strict';

const ArLedger = require('../models/ArLedger');
const dateUtil = require('../utils/date.util');
const { toNumber } = require('../utils/common.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt, isOverpaid } = require('../constants/finance.constants');

function daysBetween(from, to) {
  const a = new Date(dateUtil.toDateOnly(from));
  const b = new Date(dateUtil.toDateOnly(to));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function cleanKey(value) {
  return String(value || '').trim();
}

function customerMetaLookup(customerMetaMap, rowId = {}) {
  if (!customerMetaMap || typeof customerMetaMap.get !== 'function') return {};
  return customerMetaMap.get(cleanKey(rowId.customerCode))
    || customerMetaMap.get(cleanKey(rowId.customerId))
    || customerMetaMap.get(cleanKey(rowId.customerName))
    || {};
}

function buildCustomerDebtAggregatePipeline(match = {}, options = {}) {
  const tolerance = toNumber(options.tolerance ?? DEBT_ZERO_TOLERANCE);
  const limit = Math.max(1, Math.min(toNumber(options.limit || 500), 5000));
  const includePaid = Boolean(options.includePaid);

  const pipeline = [
    { $match: match },
    {
      $project: {
        date: { $ifNull: ['$date', '$createdAt'] },
        customerId: 1,
        customerCode: 1,
        customerName: 1,
        orderId: { $ifNull: ['$orderId', '$salesOrderId'] },
        orderCode: { $ifNull: ['$orderCode', '$salesOrderCode'] },
        debit: { $ifNull: ['$debit', 0] },
        credit: { $ifNull: ['$credit', 0] },
        amount: { $ifNull: ['$amount', 0] },
        type: 1,
        salesmanCode: { $ifNull: ['$salesmanCode', { $ifNull: ['$salesStaffCode', { $ifNull: ['$nvbhCode', '$staffCode'] }] }] },
        salesmanName: { $ifNull: ['$salesmanName', { $ifNull: ['$salesStaffName', { $ifNull: ['$nvbhName', '$staffName'] }] }] },
        deliveryStaffCode: { $ifNull: ['$deliveryStaffCode', { $ifNull: ['$deliveryCode', { $ifNull: ['$deliveryStaff', { $ifNull: ['$nvghCode', '$staffCode'] }] }] }] },
        deliveryStaffName: { $ifNull: ['$deliveryStaffName', { $ifNull: ['$deliveryName', { $ifNull: ['$nvghName', '$staffName'] }] }] }
      }
    },
    {
      $group: {
        _id: {
          customerId: '$customerId',
          customerCode: '$customerCode',
          customerName: '$customerName'
        },
        firstDate: { $min: '$date' },
        lastDate: { $max: '$date' },
        debit: { $sum: { $cond: [{ $gt: ['$debit', 0] }, '$debit', { $cond: [{ $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'sale' } }, '$amount', 0] }] } },
        credit: { $sum: { $cond: [{ $gt: ['$credit', 0] }, '$credit', { $cond: [{ $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'sale' } }, 0, '$amount'] }] } },
        receiptAmount: { $sum: { $cond: [{ $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'receipt|payment|collection|debt' } }, { $ifNull: ['$credit', '$amount'] }, 0] } },
        returnAmount: { $sum: { $cond: [{ $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'return' } }, { $ifNull: ['$credit', '$amount'] }, 0] } },
        bonusAmount: { $sum: { $cond: [{ $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'bonus|discount|allowance' } }, { $ifNull: ['$credit', '$amount'] }, 0] } },
        salesmanCode: { $max: '$salesmanCode' },
        salesmanName: { $max: '$salesmanName' },
        deliveryStaffCode: { $max: '$deliveryStaffCode' },
        deliveryStaffName: { $max: '$deliveryStaffName' },
        orderCodes: { $addToSet: '$orderCode' }
      }
    },
    { $addFields: { debt: { $subtract: ['$debit', '$credit'] } } }
  ];

  if (!includePaid) {
    pipeline.push({ $match: { debt: { $gt: tolerance } } });
  }

  pipeline.push(
    { $sort: { debt: -1, lastDate: -1 } },
    { $limit: limit }
  );

  return pipeline;
}

function normalizeCustomerDebtAggregateRows(rows = [], options = {}) {
  const now = dateUtil.toDateOnly(options.now || dateUtil.todayVN());
  const customerMetaMap = options.customerMetaMap;

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const id = row._id || {};
    const cmeta = customerMetaLookup(customerMetaMap, id);
    const debt = normalizeDebtAmount(toNumber(row.debit) - toNumber(row.credit));
    const documentDate = dateUtil.toDateOnly(row.firstDate || row.lastDate || new Date());
    const overdueDays = hasOpenDebt(debt) ? Math.max(0, daysBetween(now, documentDate)) : 0;
    const status = isOverpaid(debt) ? 'overpaid' : (hasOpenDebt(debt) ? (overdueDays > 0 ? 'overdue' : 'open') : 'paid');
    const orderCodes = (Array.isArray(row.orderCodes) ? row.orderCodes : []).map(cleanKey).filter(Boolean);

    return {
      customerId: cmeta.customerId || id.customerId || '',
      customerCode: cmeta.customerCode || id.customerCode || '',
      customerName: cmeta.customerName || id.customerName || 'Chưa rõ khách',
      phone: cmeta.phone || '',
      address: cmeta.address || '',
      salesmanCode: row.salesmanCode || cmeta.salesmanCode || '',
      salesmanName: row.salesmanName || cmeta.salesmanName || '',
      deliveryStaffCode: row.deliveryStaffCode || cmeta.deliveryStaffCode || '',
      deliveryStaffName: row.deliveryStaffName || cmeta.deliveryStaffName || '',
      debit: toNumber(row.debit),
      credit: toNumber(row.credit),
      receiptAmount: Math.max(0, toNumber(row.receiptAmount)),
      returnAmount: Math.max(0, toNumber(row.returnAmount)),
      bonusAmount: Math.max(0, toNumber(row.bonusAmount)),
      debt,
      overpaidAmount: Math.max(0, -debt),
      status,
      debtZeroTolerance: DEBT_ZERO_TOLERANCE,
      orderCount: orderCodes.length,
      overdueCount: status === 'overdue' ? 1 : 0,
      overdueDays,
      agingDays: documentDate ? Math.max(0, daysBetween(now, documentDate)) : 0,
      orders: orderCodes.map((code) => ({ orderCode: code, debtZeroTolerance: DEBT_ZERO_TOLERANCE }))
    };
  });
}

async function aggregateCustomerDebt(options = {}) {
  const pipeline = buildCustomerDebtAggregatePipeline(options.match || {}, {
    limit: options.limit,
    includePaid: options.includePaid,
    tolerance: options.tolerance
  });
  const rows = await ArLedger.aggregate(pipeline).allowDiskUse(true).exec();
  return normalizeCustomerDebtAggregateRows(rows, {
    customerMetaMap: options.customerMetaMap,
    now: options.now
  });
}

module.exports = {
  aggregateCustomerDebt,
  buildCustomerDebtAggregatePipeline,
  normalizeCustomerDebtAggregateRows
};
