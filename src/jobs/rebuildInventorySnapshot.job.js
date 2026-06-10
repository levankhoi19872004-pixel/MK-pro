'use strict';

const StockTransaction = require('../models/StockTransaction');
const InventorySnapshot = require('../models/Inventory');

const ACTIVE_STATUS = { $nin: ['void', 'cancelled', 'canceled', 'deleted'] };

async function rebuildInventorySnapshot({ productCode, warehouseCode, session } = {}) {
  const match = { status: ACTIVE_STATUS };
  if (productCode) match.productCode = productCode;
  if (warehouseCode) match.$or = [{ warehouseCode }, { warehouseId: warehouseCode }];

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: { productCode: '$productCode', warehouseCode: { $ifNull: ['$warehouseCode', '$warehouseId'] } },
        productName: { $last: '$productName' },
        warehouseId: { $last: '$warehouseId' },
        warehouseName: { $last: '$warehouseName' },
        onHand: { $sum: { $ifNull: ['$quantity', '$qty'] } },
        lastTransactionAt: { $max: { $ifNull: ['$date', '$createdAt'] } }
      }
    }
  ];
  const aggregate = StockTransaction.aggregate(pipeline);
  if (session && typeof aggregate.session === 'function') aggregate.session(session);
  const rows = await aggregate;

  const now = new Date().toISOString();
  const ops = rows.map((row) => ({
    updateOne: {
      filter: { productCode: row._id.productCode, warehouseCode: row._id.warehouseCode || '' },
      update: {
        $set: {
          productCode: row._id.productCode,
          productName: row.productName || '',
          warehouseId: row.warehouseId || row._id.warehouseCode || '',
          warehouseCode: row._id.warehouseCode || '',
          warehouseName: row.warehouseName || '',
          onHand: Number(row.onHand || 0),
          availableQty: Number(row.onHand || 0),
          qty: Number(row.onHand || 0),
          quantity: Number(row.onHand || 0),
          lastTransactionAt: row.lastTransactionAt || now,
          updatedAt: now
        }
      },
      upsert: true
    }
  }));

  if (ops.length) await InventorySnapshot.bulkWrite(ops, { ordered: false, session });
  return { rebuilt: ops.length };
}

module.exports = { rebuildInventorySnapshot };
