'use strict';

const mongoose = require('mongoose');
const StockTransaction = require('../../models/StockTransaction');
const Inventory = require('../../models/InventoryLegacy');
const Product = require('../../models/Product');
const { STOCK_WAREHOUSE_CODE, STOCK_WAREHOUSE_NAME } = require('../../constants/business.constants');
const { isInventoryMaintenanceMode } = require('../../utils/inventoryMaintenance.util');

const INACTIVE_STATUSES = ['void', 'cancelled', 'canceled', 'deleted', 'reversed'];

function safeName(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

function requireConnectedDb() {
  const db = mongoose.connection && mongoose.connection.db;
  if (!db) {
    const error = new Error('MongoDB chưa kết nối để rebuild tồn kho');
    error.code = 'INVENTORY_REBUILD_DB_NOT_CONNECTED';
    throw error;
  }
  return db;
}

function assertMaintenanceMode() {
  if (!isInventoryMaintenanceMode()) {
    const error = new Error('Rebuild tồn kho chỉ được chạy khi SYSTEM_MAINTENANCE_MODE=inventory');
    error.code = 'INVENTORY_MAINTENANCE_MODE_REQUIRED';
    error.status = 409;
    throw error;
  }
}

async function collectionExists(db, name) {
  const rows = await db.listCollections({ name }, { nameOnly: true }).toArray();
  return rows.length > 0;
}

async function cloneIndexes(db, sourceName, targetName) {
  if (!(await collectionExists(db, sourceName)) || !(await collectionExists(db, targetName))) return;
  const indexes = await db.collection(sourceName).indexes();
  const specs = indexes
    .filter((index) => index.name !== '_id_')
    .map((index) => {
      const { key, name, unique, sparse, partialFilterExpression, expireAfterSeconds, collation } = index;
      return {
        key,
        name,
        ...(unique ? { unique: true } : {}),
        ...(sparse ? { sparse: true } : {}),
        ...(partialFilterExpression ? { partialFilterExpression } : {}),
        ...(expireAfterSeconds !== undefined ? { expireAfterSeconds } : {}),
        ...(collation ? { collation } : {})
      };
    });
  if (specs.length) await db.collection(targetName).createIndexes(specs);
}

async function atomicSwapCollection(db, currentName, shadowName, options = {}) {
  const backupName = safeName(`${currentName}_backup`);
  const currentExists = await collectionExists(db, currentName);
  let movedCurrent = false;

  if (!(await collectionExists(db, shadowName))) {
    const error = new Error(`Không tìm thấy shadow collection ${shadowName}`);
    error.code = 'INVENTORY_SHADOW_COLLECTION_MISSING';
    throw error;
  }

  try {
    if (currentExists) {
      await db.collection(currentName).rename(backupName, { dropTarget: false });
      movedCurrent = true;
    }
    await db.collection(shadowName).rename(currentName, { dropTarget: false });
  } catch (error) {
    if (movedCurrent && !(await collectionExists(db, currentName)) && await collectionExists(db, backupName)) {
      await db.collection(backupName).rename(currentName, { dropTarget: false }).catch(() => null);
    }
    throw error;
  }

  if (options.dropBackup === true && movedCurrent && await collectionExists(db, backupName)) {
    await db.collection(backupName).drop();
    return { backupName: '', backupDropped: true };
  }

  return { backupName: movedCurrent ? backupName : '', backupDropped: false };
}

async function validateInventoryShadow(db, shadowName) {
  const shadow = db.collection(shadowName);
  const [rowCount, missingCode, duplicates, negativeRows, shadowTotalRows, txTotalRows] = await Promise.all([
    shadow.countDocuments({}),
    shadow.countDocuments({ $or: [{ productCode: { $exists: false } }, { productCode: '' }, { productCode: null }] }),
    shadow.aggregate([
      { $group: { _id: { productCode: '$productCode', warehouseCode: '$warehouseCode' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 20 }
    ]).toArray(),
    shadow.find({ availableQty: { $lt: 0 } }).project({ _id: 0, productCode: 1, availableQty: 1 }).limit(100).toArray(),
    shadow.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ['$availableQty', 0] } } } }]).toArray(),
    StockTransaction.aggregate([
      { $match: { status: { $nin: INACTIVE_STATUSES } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$quantity', { $ifNull: ['$qty', 0] }] } } } }
    ])
  ]);

  const shadowTotal = Number(shadowTotalRows[0]?.total || 0);
  const transactionTotal = Number(txTotalRows[0]?.total || 0);
  const delta = shadowTotal - transactionTotal;
  const errors = [];
  if (missingCode > 0) errors.push(`Có ${missingCode} dòng thiếu productCode`);
  if (duplicates.length) errors.push(`Có ${duplicates.length} nhóm productCode/warehouse bị trùng`);
  if (Math.abs(delta) > 0.000001) errors.push(`Tổng shadow lệch stockTransactions ${delta}`);

  return {
    ok: errors.length === 0,
    errors,
    rowCount,
    missingCode,
    duplicates,
    negativeStockCount: negativeRows.length,
    negativeRows,
    shadowTotal,
    transactionTotal,
    delta
  };
}

async function rebuildInventoryFromTransactions(options = {}) {
  assertMaintenanceMode();
  const db = requireConnectedDb();
  const currentName = Inventory.collection.name;
  const shadowName = safeName(`${currentName}_rebuild`);
  const warehouseCode = STOCK_WAREHOUSE_CODE || 'MAIN';
  const warehouseName = STOCK_WAREHOUSE_NAME || 'Kho chính';

  await StockTransaction.aggregate([
    { $match: { status: { $nin: INACTIVE_STATUSES } } },
    {
      $group: {
        _id: '$productCode',
        productId: { $last: '$productId' },
        productName: { $last: '$productName' },
        availableQty: { $sum: { $ifNull: ['$quantity', { $ifNull: ['$qty', 0] }] } },
        lastTransactionAt: { $max: { $ifNull: ['$updatedAt', '$createdAt'] } }
      }
    },
    { $match: { _id: { $nin: [null, ''] } } },
    {
      $lookup: {
        from: Product.collection.name,
        localField: '_id',
        foreignField: 'code',
        as: 'product'
      }
    },
    { $set: { product: { $first: '$product' } } },
    {
      $project: {
        _id: 0,
        id: { $concat: ['IV-', { $toString: '$_id' }] },
        productId: { $toString: { $ifNull: ['$product.id', { $ifNull: ['$productId', '$_id'] }] } },
        productCode: { $toString: '$_id' },
        productName: { $ifNull: ['$product.name', { $ifNull: ['$productName', ''] }] },
        warehouseId: { $literal: warehouseCode },
        warehouseCode: { $literal: warehouseCode },
        warehouseName: { $literal: warehouseName },
        qty: '$availableQty',
        quantity: '$availableQty',
        onHand: '$availableQty',
        reservedQty: { $literal: 0 },
        availableQty: '$availableQty',
        lastTransactionAt: 1,
        createdAt: { $dateToString: { date: '$$NOW', format: '%Y-%m-%dT%H:%M:%S.%LZ' } },
        updatedAt: { $dateToString: { date: '$$NOW', format: '%Y-%m-%dT%H:%M:%S.%LZ' } }
      }
    },
    { $out: shadowName }
  ]).allowDiskUse(true);

  await cloneIndexes(db, currentName, shadowName);
  const validation = await validateInventoryShadow(db, shadowName);
  if (!validation.ok) {
    if (options.keepInvalidShadow !== true && await collectionExists(db, shadowName)) await db.collection(shadowName).drop();
    const error = new Error(`Shadow inventory không hợp lệ: ${validation.errors.join('; ')}`);
    error.code = 'INVENTORY_SHADOW_VALIDATION_FAILED';
    error.validation = validation;
    throw error;
  }

  const swap = await atomicSwapCollection(db, currentName, shadowName, options);
  return {
    rebuilt: true,
    source: StockTransaction.collection.name,
    collection: currentName,
    ...swap,
    validation
  };
}

async function replaceStockTransactions(transactions = [], options = {}) {
  assertMaintenanceMode();
  const db = requireConnectedDb();
  const currentName = StockTransaction.collection.name;
  const shadowName = safeName(`${currentName}_rebuild`);
  await db.createCollection(shadowName);
  if (transactions.length) await db.collection(shadowName).insertMany(transactions, { ordered: true });
  await cloneIndexes(db, currentName, shadowName);

  const [count, duplicateKeys] = await Promise.all([
    db.collection(shadowName).countDocuments({}),
    db.collection(shadowName).aggregate([
      { $match: { idempotencyKey: { $nin: [null, ''] } } },
      { $group: { _id: '$idempotencyKey', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 20 }
    ]).toArray()
  ]);
  if (count !== transactions.length || duplicateKeys.length) {
    await db.collection(shadowName).drop().catch(() => null);
    const error = new Error('Shadow stockTransactions không hợp lệ');
    error.code = 'STOCK_TRANSACTION_SHADOW_VALIDATION_FAILED';
    error.validation = { expected: transactions.length, count, duplicateKeys };
    throw error;
  }

  const swap = await atomicSwapCollection(db, currentName, shadowName, options);
  return { replaced: true, count, collection: currentName, ...swap };
}

module.exports = {
  rebuildInventoryFromTransactions,
  replaceStockTransactions,
  validateInventoryShadow,
  atomicSwapCollection,
  _internal: { safeName, collectionExists, cloneIndexes, assertMaintenanceMode }
};
