'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('sales import commit uses bulk inventory posting and one order status update per chunk', () => {
  const service = read('src/services/excelImportService.js');
  assert.match(service, /InventoryPostingService\.postSalesOrdersBulkOut\(/);
  assert.match(service, /SalesOrder\.updateMany\(/);
  assert.match(service, /mode:\s*'atomicBulkSalesOrderChunks'/);
  assert.doesNotMatch(
    service,
    /for \(const order of insertedOrders\) \{[\s\S]{0,800}InventoryPostingService\.postSaleOut\(order/
  );
});

test('inventory service exposes transactional bulk sales OUT posting', () => {
  const inventory = read('src/services/inventoryService.js');
  const facade = read('src/domain/posting/InventoryPostingService.js');

  assert.match(inventory, /async function postStockMovementBulkSalesOut\(/);
  assert.match(inventory, /StockTransaction\.insertMany\(txDocs/);
  assert.match(inventory, /InventoryLegacy\.bulkWrite\(inventoryOps/);
  assert.match(inventory, /normalizeBulkSalesInventoryToMain/);
  assert.match(facade, /async function postSalesOrdersBulkOut\(/);
  assert.match(facade, /postStockMovementBulkSalesOut\(orders, options\)/);
});

test('import session reports commit progress and frontend polls it', () => {
  const transaction = read('src/services/import/importTransaction.service.js');
  const importService = read('src/services/excelImportService.js');
  const sessionService = read('src/services/importSessionService.js');
  const ui = read('public/js/app/admin/08d-import-excel.js');
  const html = read('public/index.html');

  assert.match(transaction, /options\.onChunkComplete/);
  assert.match(importService, /step:\s*`committing:\$\{completedChunks\}\/\$\{totalChunks\}`/);
  assert.match(sessionService, /percent:\s*100,[\s\S]*step:\s*'done'/);
  assert.match(ui, /startImportCommitProgressPolling/);
  assert.match(ui, /refreshAfterImport/);
  assert.match(html, /phase47-import-performance-v1/);
});
