'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const dmsService = require('../src/services/dmsInventoryReconciliation.service');
const quotaService = require('../src/services/internalSaleAllocation.service');

function read(relativePath) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', relativePath));
}

test('DMS parser normalizes yellow-column headers and SAP workbook wrapper', () => {
  assert.equal(dmsService.normalizeHeader('Số hiệu hàng hóa'), 'so hieu hang hoa');
  assert.equal(dmsService.normalizeHeader('Mô tả mặt hàng'), 'mo ta mat hang');
  assert.equal(dmsService.normalizeHeader('Qui cách đóng gói'), 'qui cach dong goi');
  assert.equal(dmsService.normalizeHeader('Tồn cuối (CS/SU)'), 'ton cuoi cs su');
  assert.equal(dmsService.normalizeHeader('Tồn kho cuối kỳ (SU)'), 'ton kho cuoi ky su');

  const workbook = [{ sheet: 'Sheet1', data: [['Số hiệu hàng hóa'], ['65734754']] }];
  assert.deepEqual(dmsService.normalizeWorkbookSheets(workbook), [
    { name: 'Sheet1', rows: [['Số hiệu hàng hóa'], ['65734754']] }
  ]);
});

test('DMS CS/SU formula uses SU as canonical quantity', () => {
  const parsed = dmsService.parseCaseLoose('45/3', 5);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.cases, 45);
  assert.equal(parsed.loose, 3);
  assert.equal(parsed.total, 228);
  assert.equal(dmsService.parseCaseLoose('-1/2', 5).valid, false);
});

test('latest comparison summary separates DMS excess and actual-stock excess', () => {
  const summary = dmsService.buildSummary([
    { comparisonType: 'dms_greater', dmsBaseQty: 100, internalBaseQty: 80, dmsExcessQty: 20, internalExcessQty: 0 },
    { comparisonType: 'internal_greater', dmsBaseQty: 40, internalBaseQty: 65, dmsExcessQty: 0, internalExcessQty: 25 },
    { comparisonType: 'matched', dmsBaseQty: 10, internalBaseQty: 10, dmsExcessQty: 0, internalExcessQty: 0 }
  ]);
  assert.equal(summary.dmsGreaterRows, 1);
  assert.equal(summary.internalGreaterRows, 1);
  assert.equal(summary.matchedRows, 1);
  assert.equal(summary.totalDmsExcessQty, 20);
  assert.equal(summary.totalInternalExcessQty, 25);
});

test('quota item aggregation is product-code based and sums duplicate lines', () => {
  const map = quotaService.aggregateItems([
    { productCode: ' 65734754 ', quantity: 3 },
    { code: '65734754', qty: 2 },
    { productCode: '64806954', quantity: 4 }
  ]);
  assert.equal(map.get('65734754'), 5);
  assert.equal(map.get('64806954'), 4);
});

test('mobile order consumes quota before order creation and actual stock posting in one transaction', () => {
  const source = read('src/services/mobile/sales.service.js');
  const transactionAt = source.indexOf('withMongoTransaction(async (session)');
  const quotaAt = source.indexOf('internalSaleAllocationService.consumeForOrder');
  const createAt = source.indexOf('SalesOrder.create([canonicalSalesOrder]');
  const stockAt = source.indexOf('InventoryPostingService.postSaleOut');
  assert.ok(transactionAt >= 0);
  assert.ok(quotaAt > transactionAt);
  assert.ok(createAt > quotaAt);
  assert.ok(stockAt > createAt);
  assert.match(source, /err\.code === 'DMS_APP_QUOTA_EXCEEDED'/);
});

test('hard delete reverses quota in the same lifecycle transaction before removing order', () => {
  const source = read('src/domain/lifecycle/SalesOrderDeletionService.js');
  const releaseAt = source.indexOf('releaseForDeletedOrder(order, actor, { session })');
  const removeAt = source.indexOf('orderRepository.remove(');
  assert.ok(releaseAt >= 0);
  assert.ok(removeAt > releaseAt);
});

test('DMS routes, indexes, and feature flags are registered', () => {
  const routes = read('src/routes/dmsInventoryRoutes.js');
  const routeIndex = read('src/routes/index.js');
  const indexes = read('src/services/mongoIndexService.js');
  const env = read('.env.example');
  assert.match(routes, /router\.post\('\/preview'/);
  assert.match(routes, /router\.post\('\/:importId\/commit'/);
  assert.match(routeIndex, /app\.use\('\/api\/dms-inventory', dmsInventoryRoutes\)/);
  assert.match(indexes, /uniq_internal_sale_allocation_active/);
  assert.match(indexes, /partialFilterExpression: \{ status: 'active' \}/);
  assert.match(indexes, /uniq_dms_inventory_completed_file/);
  assert.match(env, /ENABLE_DMS_APP_SALE_QUOTA=true/);
});



test('morning commit recomputes actual inventory inside the quota replacement transaction', () => {
  const source = read('src/services/dmsInventoryReconciliation.service.js');
  const transactionAt = source.indexOf('withMongoTransaction(async (session)');
  const recomputeAt = source.indexOf('buildComparisonRows(dmsItems, { session })');
  const supersedeAt = source.indexOf('InternalSaleAllocation.updateMany(');
  assert.ok(transactionAt >= 0);
  assert.ok(recomputeAt > transactionAt);
  assert.ok(supersedeAt > recomputeAt);
});

test('emergency feature rollback restores actual-stock selling limit in mobile catalog', () => {
  const source = read('src/services/mobile/catalog.service.js');
  assert.match(source, /const quotaEnforced = internalSaleAllocationService\.isQuotaEnabled\(\)/);
  assert.match(source, /quotaEnforced\s*\?\s*Math\.max\(0, Math\.min\(availableQty, recommendedRemainingQty\)\)\s*:\s*Math\.max\(0, availableQty\)/);
});

test('admin and mobile UI expose actual stock, DMS difference, and App selling limit', () => {
  const indexHtml = read('public/index.html');
  const adminJs = read('public/js/app/10-dms-inventory.js');
  const mobileJs = read('public/mobile/js/sales.js');
  const catalog = read('src/services/mobile/catalog.service.js');
  const mobileHtml = read('public/mobile/sales.html');

  assert.match(indexHtml, /Đối chiếu tồn DMS/);
  assert.match(indexHtml, /Hạn mức mở/);
  assert.match(adminJs, /Thực tế nhiều hơn DMS/);
  assert.match(catalog, /maxOrderQty/);
  assert.match(catalog, /Math\.min\(availableQty, recommendedRemainingQty\)/);
  assert.match(mobileJs, /Tồn thực tế/);
  assert.match(mobileJs, /Được bán App/);
  assert.match(mobileJs, /qty > maxOrderQty/);
  assert.match(mobileHtml, /sales\.js\?v=phase86-production-hardening-v1/);
});
