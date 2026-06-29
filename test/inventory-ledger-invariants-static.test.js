'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { readSource } = require('./helpers/sourceBundle.util');

const inventoryPosting = readSource(path.join(__dirname, '..', 'src/domain/posting/InventoryPostingService.js'));
const inventoryService = readSource(path.join(__dirname, '..', 'src/services/inventoryService.source/part-01.jsfrag'))
  + readSource(path.join(__dirname, '..', 'src/services/inventoryService.source/part-02.jsfrag'))
  + readSource(path.join(__dirname, '..', 'src/services/inventoryService.source/part-03.jsfrag'));
const adminCorrection = readSource(path.join(__dirname, '..', 'src/services/admin-correction/AdminDataCorrectionService.js'));
const masterOrderCommand = readSource(path.join(__dirname, '..', 'src/services/master-order/masterOrderCommand.impl.js'));
const masterOrderQuery = readSource(path.join(__dirname, '..', 'src/services/master-order/masterOrderQuery.impl.js'));
const mongoIndexes = readSource(path.join(__dirname, '..', 'src/services/mongoIndexService.js'));

test('inventory OUT posting requires Mongo session to avoid orphan stock transaction', () => {
  assert.match(inventoryPosting, /postSaleOut cần chạy trong Mongo session/);
  assert.match(inventoryPosting, /postSalesOrdersBulkOut cần chạy trong Mongo session/);
  assert.match(inventoryService, /Atomic inventory OUT posting cần Mongo session/);
});

test('stock posting is idempotent by source, product, warehouse and movement type', () => {
  assert.match(inventoryService, /function buildStockMovementIdempotencyKey/);
  assert.match(inventoryService, /findStockTransactionByIdempotencyKey/);
  assert.match(inventoryService, /DUPLICATE_STOCK_MOVEMENT/);
  assert.match(mongoIndexes, /uniq_stock_tx_idempotency_key/);
});

test('master order grouping does not post inventory movements', () => {
  const masterSources = `${masterOrderCommand}\n${masterOrderQuery}`;
  assert.doesNotMatch(masterSources, /postSaleOut|postStockMovement|StockTransaction\.create|InventoryLegacy\.findOneAndUpdate/);
});

test('admin inventory correction must use inventory posting boundary and never create orphan stock transactions', () => {
  assert.match(adminCorrection, /inventoryService\.postStockMovement/);
  assert.match(adminCorrection, /sourceType:\s*'ADMIN_CORRECTION'/);
  assert.doesNotMatch(adminCorrection, /StockTransaction\.create\(\[tx\]/);
});
