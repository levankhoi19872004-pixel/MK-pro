'use strict';

const StockTransaction = require('../models/StockTransaction');

async function buildInventoryView(match = {}) {
  return StockTransaction.aggregate([
    { $match: { status: { $nin: ['void', 'cancelled', 'canceled', 'deleted'] }, ...match } },
    {
      $group: {
        _id: { productCode: '$productCode', warehouseCode: { $ifNull: ['$warehouseCode', '$warehouseId'] } },
        productName: { $last: '$productName' },
        onHand: { $sum: { $ifNull: ['$quantity', '$qty'] } },
        lastDate: { $max: '$date' }
      }
    },
    { $sort: { '_id.productCode': 1 } }
  ]);
}

module.exports = { buildInventoryView };
