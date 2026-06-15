'use strict';

const SalesOrder = require('../../models/SalesOrder');
const ReturnOrder = require('../../models/ReturnOrder');
const {
  activeDocumentFilter,
  accountingConfirmedFilter,
  returnConfirmedFilter,
  businessDateStages,
  numberExpression,
  salesStaffCodeExpression,
  salesStaffNameExpression
} = require('./DashboardMongoExpressions');

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function mapStaffRows(rows = [], amountField) {
  return rows.map((row) => ({
    salesStaffCode: String(row?._id?.code || '').trim(),
    salesStaffName: String(row?._id?.name || '').trim(),
    orderCount: normalizeMoney(row.orderCount),
    returnCount: normalizeMoney(row.returnCount),
    [amountField]: Math.max(0, normalizeMoney(row[amountField]))
  })).filter((row) => row.salesStaffCode || row.salesStaffName || row[amountField] > 0);
}

async function aggregateSales(dateFrom, dateTo) {
  const totalAmount = numberExpression(['totalAmount', 'amount', 'grandTotal', 'total', 'value'], 0);
  const result = await SalesOrder.aggregate([
    {
      $match: {
        $and: [activeDocumentFilter(), accountingConfirmedFilter()]
      }
    },
    ...businessDateStages(dateFrom, dateTo, ['orderDate', 'date', 'documentDate']),
    {
      $facet: {
        byStaff: [
          {
            $group: {
              _id: {
                code: salesStaffCodeExpression(),
                name: salesStaffNameExpression()
              },
              orderCount: { $sum: 1 },
              salesAmount: { $sum: totalAmount }
            }
          },
          { $sort: { '_id.name': 1, '_id.code': 1 } }
        ],
        totals: [
          {
            $group: {
              _id: null,
              orderCount: { $sum: 1 },
              salesAmount: { $sum: totalAmount }
            }
          }
        ]
      }
    }
  ]).allowDiskUse(true).exec();

  const facet = result?.[0] || {};
  const totals = facet.totals?.[0] || {};
  return {
    rows: mapStaffRows(facet.byStaff, 'salesAmount'),
    totals: {
      orderCount: normalizeMoney(totals.orderCount),
      salesAmount: Math.max(0, normalizeMoney(totals.salesAmount))
    },
    source: 'mongo:orders'
  };
}

async function aggregateReturns(dateFrom, dateTo) {
  const returnAmount = numberExpression(['returnAmount', 'amount', 'totalAmount', 'debtReduction'], 0);
  const result = await ReturnOrder.aggregate([
    {
      $match: {
        $and: [activeDocumentFilter(), returnConfirmedFilter()]
      }
    },
    ...businessDateStages(dateFrom, dateTo, ['returnDate', 'documentDate', 'date', 'deliveryDate']),
    {
      $facet: {
        byStaff: [
          {
            $group: {
              _id: {
                code: salesStaffCodeExpression(),
                name: salesStaffNameExpression()
              },
              returnCount: { $sum: 1 },
              returnAmount: { $sum: returnAmount }
            }
          }
        ],
        totals: [
          {
            $group: {
              _id: null,
              returnCount: { $sum: 1 },
              returnAmount: { $sum: returnAmount }
            }
          }
        ]
      }
    }
  ]).allowDiskUse(true).exec();

  const facet = result?.[0] || {};
  const totals = facet.totals?.[0] || {};
  return {
    rows: mapStaffRows(facet.byStaff, 'returnAmount'),
    totals: {
      returnCount: normalizeMoney(totals.returnCount),
      returnAmount: Math.max(0, normalizeMoney(totals.returnAmount))
    },
    source: 'mongo:returnOrders'
  };
}

module.exports = {
  aggregateSales,
  aggregateReturns
};
