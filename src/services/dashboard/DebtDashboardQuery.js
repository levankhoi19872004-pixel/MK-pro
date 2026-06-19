'use strict';

const ArLedger = require('../../models/ArLedger');
const { normalizeDebtAmount } = require('../../constants/finance.constants');
const {
  INACTIVE_STATUSES,
  firstNonBlankExpression,
  numberExpression,
  salesStaffCodeExpression,
  salesStaffNameExpression
} = require('./DashboardMongoExpressions');

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function normalizeOpenDebt(value) {
  return Math.max(0, normalizeMoney(normalizeDebtAmount(normalizeMoney(value))));
}

async function aggregateCurrentDebt() {
  const debit = numberExpression(['debit', 'arDebit'], 0);
  const credit = numberExpression(['credit', 'arCredit'], 0);
  const amount = numberExpression(['amount'], 0);
  const type = { $toLower: firstNonBlankExpression(['type'], '') };
  const isSaleType = { $regexMatch: { input: type, regex: 'sale|external_debt' } };
  const customerFallback = {
    $let: {
      vars: {
        customerCode: firstNonBlankExpression(['customerCode', 'customerId', 'customerName'], '')
      },
      in: {
        $cond: [
          { $gt: [{ $strLenCP: '$$customerCode' }, 0] },
          { $concat: ['customer:', '$$customerCode'] },
          { $concat: ['orphan:', { $toString: '$_id' }] }
        ]
      }
    }
  };
  const orderKey = firstNonBlankExpression(
    ['orderCode', 'salesOrderCode', 'orderId', 'salesOrderId', 'refCode', 'refId', 'sourceCode', 'sourceId'],
    customerFallback
  );

  const result = await ArLedger.aggregate([
    {
      $match: {
        status: { $nin: [...INACTIVE_STATUSES, 'reversed'] },
        reversed: { $ne: true },
        refType: { $ne: 'AR_LEDGER_REVERSAL' },
        type: { $nin: ['ar_reversal', 'reversal', 'ar_void'] }
      }
    },
    {
      $group: {
        _id: orderKey,
        debit: {
          $sum: {
            $cond: [
              { $gt: [debit, 0] },
              debit,
              { $cond: [isSaleType, amount, 0] }
            ]
          }
        },
        credit: {
          $sum: {
            $cond: [
              { $gt: [credit, 0] },
              credit,
              { $cond: [isSaleType, 0, amount] }
            ]
          }
        },
        salesStaffCode: { $max: { $cond: [isSaleType, salesStaffCodeExpression(), ''] } },
        salesStaffName: { $max: { $cond: [isSaleType, salesStaffNameExpression(), ''] } }
      }
    },
    { $set: { debtAmount: { $subtract: ['$debit', '$credit'] } } },
    {
      $facet: {
        byStaff: [
          {
            $group: {
              _id: {
                code: '$salesStaffCode',
                name: '$salesStaffName'
              },
              debtAmount: { $sum: '$debtAmount' },
              debtDocumentCount: { $sum: { $cond: [{ $gt: ['$debtAmount', 0] }, 1, 0] } }
            }
          }
        ],
        totals: [
          {
            $group: {
              _id: null,
              debit: { $sum: '$debit' },
              credit: { $sum: '$credit' },
              debtDocumentCount: { $sum: { $cond: [{ $gt: ['$debtAmount', 0] }, 1, 0] } }
            }
          }
        ]
      }
    }
  ]).allowDiskUse(true).exec();

  const facet = result?.[0] || {};
  const total = facet.totals?.[0] || {};
  const rows = (facet.byStaff || []).map((row) => ({
    salesStaffCode: String(row?._id?.code || '').trim(),
    salesStaffName: String(row?._id?.name || '').trim(),
    debtAmount: normalizeOpenDebt(row.debtAmount),
    debtDocumentCount: normalizeMoney(row.debtDocumentCount)
  })).filter((row) => row.debtAmount > 0 || row.salesStaffCode || row.salesStaffName);

  return {
    rows,
    totals: {
      debit: Math.max(0, normalizeMoney(total.debit)),
      credit: Math.max(0, normalizeMoney(total.credit)),
      debtAmount: normalizeOpenDebt(normalizeMoney(total.debit) - normalizeMoney(total.credit)),
      debtDocumentCount: normalizeMoney(total.debtDocumentCount)
    },
    source: 'mongo:arLedgers'
  };
}

module.exports = {
  aggregateCurrentDebt
};
