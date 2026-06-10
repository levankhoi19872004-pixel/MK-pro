'use strict';

const ArLedger = require('../models/ArLedger');

async function buildCustomerDebtView(match = {}) {
  return ArLedger.aggregate([
    { $match: { status: { $nin: ['void', 'cancelled', 'canceled', 'deleted'] }, ...match } },
    {
      $group: {
        _id: { customerId: '$customerId', customerCode: '$customerCode' },
        customerName: { $last: '$customerName' },
        debit: { $sum: { $ifNull: ['$debit', 0] } },
        credit: { $sum: { $ifNull: ['$credit', 0] } },
        balance: { $sum: { $subtract: [{ $ifNull: ['$debit', 0] }, { $ifNull: ['$credit', 0] }] } },
        lastDate: { $max: '$date' }
      }
    },
    { $match: { balance: { $gt: 1000 } } },
    { $sort: { balance: -1 } }
  ]);
}

module.exports = { buildCustomerDebtView };
