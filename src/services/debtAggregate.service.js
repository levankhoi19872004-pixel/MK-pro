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

  const ledgerTypeExpr = { $toLower: { $ifNull: ['$type', ''] } };
  const debitExpr = {
    $cond: [
      { $gt: ['$debit', 0] },
      '$debit',
      { $cond: [{ $regexMatch: { input: ledgerTypeExpr, regex: 'sale' } }, '$amount', 0] }
    ]
  };
  const creditExpr = {
    $cond: [
      { $gt: ['$credit', 0] },
      '$credit',
      { $cond: [{ $regexMatch: { input: ledgerTypeExpr, regex: 'sale' } }, 0, '$amount'] }
    ]
  };

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
    // Bước 1: gom theo KH + đơn để mỗi order trong customer.orders có đủ số nợ riêng.
    // Frontend màn Công nợ lọc orders bằng orders[].debt; nếu chỉ có orderCode thì đơn nợ sẽ không hiện.
    {
      $group: {
        _id: {
          customerId: '$customerId',
          customerCode: '$customerCode',
          customerName: '$customerName',
          orderId: '$orderId',
          orderCode: '$orderCode'
        },
        firstDate: { $min: '$date' },
        lastDate: { $max: '$date' },
        debit: { $sum: debitExpr },
        credit: { $sum: creditExpr },
        receiptAmount: { $sum: { $cond: [{ $regexMatch: { input: ledgerTypeExpr, regex: 'receipt|payment|collection|debt' } }, creditExpr, 0] } },
        returnAmount: { $sum: { $cond: [{ $regexMatch: { input: ledgerTypeExpr, regex: 'return' } }, creditExpr, 0] } },
        bonusAmount: { $sum: { $cond: [{ $regexMatch: { input: ledgerTypeExpr, regex: 'bonus|discount|allowance' } }, creditExpr, 0] } },
        salesmanCode: { $max: '$salesmanCode' },
        salesmanName: { $max: '$salesmanName' },
        deliveryStaffCode: { $max: '$deliveryStaffCode' },
        deliveryStaffName: { $max: '$deliveryStaffName' }
      }
    },
    { $addFields: { debt: { $subtract: ['$debit', '$credit'] } } }
  ];

  if (!includePaid) {
    pipeline.push({ $match: { debt: { $gt: tolerance } } });
  }

  pipeline.push(
    // Bước 2: gom lại theo khách, đồng thời push đủ thông tin từng đơn nợ.
    {
      $group: {
        _id: {
          customerId: '$_id.customerId',
          customerCode: '$_id.customerCode',
          customerName: '$_id.customerName'
        },
        firstDate: { $min: '$firstDate' },
        lastDate: { $max: '$lastDate' },
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' },
        receiptAmount: { $sum: '$receiptAmount' },
        returnAmount: { $sum: '$returnAmount' },
        bonusAmount: { $sum: '$bonusAmount' },
        salesmanCode: { $max: '$salesmanCode' },
        salesmanName: { $max: '$salesmanName' },
        deliveryStaffCode: { $max: '$deliveryStaffCode' },
        deliveryStaffName: { $max: '$deliveryStaffName' },
        orders: {
          $push: {
            orderId: '$_id.orderId',
            orderCode: '$_id.orderCode',
            documentDate: '$firstDate',
            dueDate: '$firstDate',
            debit: '$debit',
            credit: '$credit',
            receiptAmount: '$receiptAmount',
            returnAmount: '$returnAmount',
            bonusAmount: '$bonusAmount',
            debt: '$debt',
            salesmanCode: '$salesmanCode',
            salesmanName: '$salesmanName',
            deliveryStaffCode: '$deliveryStaffCode',
            deliveryStaffName: '$deliveryStaffName'
          }
        }
      }
    },
    { $addFields: { debt: { $subtract: ['$debit', '$credit'] } } }
  );

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
    const rawOrders = Array.isArray(row.orders) ? row.orders : [];
    const fallbackOrderCodes = (Array.isArray(row.orderCodes) ? row.orderCodes : []).map(cleanKey).filter(Boolean);
    const orders = rawOrders.length
      ? rawOrders.map((order) => {
        const orderDebt = normalizeDebtAmount(toNumber(order.debit) - toNumber(order.credit));
        const orderDocumentDate = dateUtil.toDateOnly(order.documentDate || order.dueDate || row.firstDate || row.lastDate || new Date());
        const orderOverdueDays = hasOpenDebt(orderDebt) ? Math.max(0, daysBetween(now, orderDocumentDate)) : 0;
        return {
          orderId: order.orderId || order.orderCode || '',
          orderCode: order.orderCode || order.orderId || '',
          documentDate: orderDocumentDate,
          dueDate: dateUtil.toDateOnly(order.dueDate || orderDocumentDate),
          debit: toNumber(order.debit),
          credit: toNumber(order.credit),
          receiptAmount: Math.max(0, toNumber(order.receiptAmount)),
          returnAmount: Math.max(0, toNumber(order.returnAmount)),
          bonusAmount: Math.max(0, toNumber(order.bonusAmount)),
          debt: orderDebt,
          rawDebt: orderDebt,
          overdueDays: orderOverdueDays,
          agingDays: orderDocumentDate ? Math.max(0, daysBetween(now, orderDocumentDate)) : 0,
          status: isOverpaid(orderDebt) ? 'overpaid' : (hasOpenDebt(orderDebt) ? (orderOverdueDays > 0 ? 'overdue' : 'open') : 'paid'),
          salesmanCode: order.salesmanCode || row.salesmanCode || cmeta.salesmanCode || '',
          salesmanName: order.salesmanName || row.salesmanName || cmeta.salesmanName || '',
          deliveryStaffCode: order.deliveryStaffCode || row.deliveryStaffCode || cmeta.deliveryStaffCode || '',
          deliveryStaffName: order.deliveryStaffName || row.deliveryStaffName || cmeta.deliveryStaffName || '',
          debtZeroTolerance: DEBT_ZERO_TOLERANCE
        };
      }).filter((order) => cleanKey(order.orderCode || order.orderId))
      : fallbackOrderCodes.map((code) => ({
        orderId: code,
        orderCode: code,
        documentDate,
        dueDate: documentDate,
        debit: 0,
        credit: 0,
        receiptAmount: 0,
        returnAmount: 0,
        bonusAmount: 0,
        debt: 0,
        rawDebt: 0,
        overdueDays: 0,
        agingDays: 0,
        status: 'unknown',
        debtZeroTolerance: DEBT_ZERO_TOLERANCE
      }));

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
      orderCount: orders.length,
      overdueCount: orders.filter((order) => order.status === 'overdue').length || (status === 'overdue' ? 1 : 0),
      overdueDays,
      agingDays: documentDate ? Math.max(0, daysBetween(now, documentDate)) : 0,
      orders
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
