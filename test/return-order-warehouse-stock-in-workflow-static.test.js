'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('returnOrders stock-in workflow is guarded by warehouse matched status and accounting role', () => {
  const route = read('src/routes/returnRoutes.js');
  const controller = read('src/controllers/returnOrderController.js');
  const service = read('src/services/returnOrderLegacy.service.source/part-02.jsfrag');
  const model = read('src/models/ReturnOrder.js');

  assert.match(route, /router\.post\('\/:id\/stock-in',\s*requireRole\(\['admin', 'accountant'\]\)/);
  assert.match(controller, /stockInReturnOrder\(/);
  assert.match(model, /warehouseCheckStatus/);
  assert.match(model, /stockInStatus/);
  assert.match(model, /stockPosted/);

  assert.match(service, /async function stockInReturnOrder/);
  assert.match(service, /findExistingReturnStockTransactions/);
  assert.match(service, /normalizeWarehouseCheckStatus\(current\) !== 'matched'/);
  assert.match(service, /normalizeStockInStatus\(current\) !== 'ready'/);
  assert.match(service, /Phiếu trả chưa được thủ kho xác nhận khớp, chưa thể nhập kho/);
  assert.match(service, /InventoryPostingService\.postReturnIn\(received, \{ session \}\)/);
  assert.match(service, /return_order_stock_in_posted/);
  assert.match(service, /return_order_stock_in_duplicate_attempt/);
  assert.match(service, /return_order_stock_in_blocked/);
});

test('mobile warehouse return check updates returnOrders to ready or blocked before accounting stock-in', () => {
  const warehouseService = read('src/services/mobile/warehouseReturnCheck.service.js');

  assert.match(warehouseService, /function applyReturnOrdersCheckResult/);
  assert.match(warehouseService, /const checkStatus = matched \? 'matched' : 'discrepancy'/);
  assert.match(warehouseService, /const stockInStatus = matched \? 'ready' : 'blocked'/);
  assert.match(warehouseService, /const displayStatus = matched \? 'ready_to_stock_in' : 'warehouse_discrepancy'/);
  assert.match(warehouseService, /warehouse_return_check_confirmed/);
  assert.match(warehouseService, /warehouse_return_check_discrepancy/);
});

test('web returnOrders UI exposes Nhập kho only through canStockIn and removes master return order module from UI', () => {
  const returnUi = read('public/js/app/debt/07b-return-orders.js');
  const nav = read('public/fragments/index/01-index-body.html');
  const masterSection = read('public/fragments/index/03-index-body.html');
  const tabLoader = read('public/js/bootstrap/03-tab-loader.js');

  assert.match(returnUi, /function canStockInReturnOrder/);
  assert.match(returnUi, /data-return-action="stock-in"/);
  assert.match(returnUi, /\/api\/return-orders\/\$\{encodeURIComponent\(order\.id\|\|order\.code\|\|key\)\}\/stock-in/);
  assert.match(returnUi, /Xác nhận nhập kho phiếu trả/);
  assert.match(returnUi, /Hệ thống sẽ cộng hàng trả vào tồn kho MAIN/);

  assert.doesNotMatch(nav, /data-tab="masterReturnOrdersTab"/);
  assert.doesNotMatch(nav, /Đơn tổng trả hàng/);
  assert.doesNotMatch(masterSection, /id="masterReturnOrdersTab"/);
  assert.doesNotMatch(masterSection, /Đơn tổng trả hàng/);
  assert.match(tabLoader, /case 'masterReturnOrdersTab'/);
  assert.match(tabLoader, /data-tab="returnOrdersTab"/);
});
