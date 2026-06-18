'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const controller = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/controllers/reportController.js'));
const service = require('./helpers/sourceBundle.util').readSource('src/services/inventoryService.js');
const routes = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/routes/index.js'));
const middleware = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/middlewares/inventoryMaintenance.middleware.js'));

test('destructive inventory rebuild is disabled by default and requires explicit confirmation', () => {
  assert.match(controller, /ENABLE_DESTRUCTIVE_INVENTORY_REBUILD/);
  assert.match(controller, /SYSTEM_MAINTENANCE_MODE=inventory/);
  assert.match(controller, /CONFIRM_REBUILD_INVENTORY|DESTRUCTIVE_INVENTORY_CONFIRMATION/);
  assert.match(controller, /resetTransactions \?\? req\.query\?\.resetTransactions \?\? '0'/);
});

test('inventory service blocks direct destructive calls without confirmation', () => {
  assert.match(service, /assertDestructiveInventoryOperation\(options, 'Rebuild stock ledger'\)/);
  assert.match(service, /const resetTransactions = options\.resetTransactions === true/);
  assert.match(service, /assertDestructiveInventoryOperation\(options, 'Chuẩn hóa tồn về một kho'\)/);
  assert.match(service, /assertDestructiveInventoryOperation\(options, 'Rebuild inventories from stockTransactions'\)|assertDestructiveInventoryOperation\(options, 'Rebuild inventories từ stockTransactions'\)/);
});

test('inventory maintenance mode blocks concurrent stock-changing commands', () => {
  assert.match(routes, /app\.use\('\/api', inventoryMaintenanceGuard\)/);
  assert.match(middleware, /INVENTORY_MAINTENANCE_MODE/);
  assert.match(middleware, /\/mobile\/sales/);
  assert.match(middleware, /\/return-orders/);
  assert.match(middleware, /\/import/);
});
