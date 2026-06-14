'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('print domain has canonical contract, normalizer, merge service and builders', () => {
  for (const file of [
    'src/domain/print/PrintContract.js',
    'src/domain/print/PrintLineNormalizer.js',
    'src/domain/print/PrintMergeService.js',
    'src/domain/print/PrintReadService.js',
    'src/domain/print/LegacyPromotionFallbackService.js',
    'src/domain/print/builders/SalesInvoiceBuilder.js',
    'src/domain/print/builders/MasterPickingBuilder.js',
    'src/domain/print/builders/ImportPickingBuilder.js',
    'src/domain/print/builders/ReturnPickingBuilder.js'
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} must exist`);
  }

  const contract = read('src/domain/print/PrintContract.js');
  assert.match(contract, /SALES_INVOICE/);
  assert.match(contract, /WAREHOUSE_PICKING/);

  const merge = read('src/domain/print/PrintMergeService.js');
  assert.match(merge, /warehouseCode/);
  assert.match(merge, /lineType/);
  assert.match(merge, /productCode/);
  assert.match(merge, /priceField/);
});

test('frontend delegates all print aggregation to backend print domain', () => {
  const sales = read('public/js/app/05-sales-orders.js');
  const master = read('public/js/app/06-master-delivery.js');
  const returns = read('public/js/app/debt/07d-master-return-orders.js');

  assert.match(sales, /\/api\/print\/orders\/batch/);
  assert.match(sales, /\/api\/print\/import-orders\/aggregate/);
  assert.doesNotMatch(sales, /function getImportItemWarehouse/);
  assert.doesNotMatch(sales, /function extractPrintBody/);

  assert.match(master, /\/api\/print\/master-orders\/batch/);
  assert.doesNotMatch(master, /\/api\/master-orders\/print-aggregate/);

  assert.match(returns, /\/api\/print\/master-return-orders\/batch/);
  assert.match(returns, /\/api\/print\/master-return-orders\/\$\{encodeURIComponent\(id\)\}/);
  assert.doesNotMatch(returns, /function buildMasterReturnPrintPages/);
  assert.doesNotMatch(returns, /function buildMasterReturnKpiRows/);
});

test('master-order print facade delegates to canonical PrintReadService', () => {
  const source = read('src/services/master-order/masterOrderPrint.service.js');
  assert.match(source, /PrintReadService\.readMasterOrders/);
  assert.doesNotMatch(source, /masterOrderLegacy\.service/);
});

test('master return batch printing loads masters and children in bulk', () => {
  const source = read('src/domain/print/PrintReadService.js');
  const start = source.indexOf('async function readMasterReturnOrders');
  const end = source.indexOf('async function readMasterReturnOrder(id', start);
  const block = source.slice(start, end);

  assert.match(block, /masterReturnOrderRepository\.findAll/);
  assert.match(block, /returnOrderRepository\.findAll/);
  assert.doesNotMatch(block, /for \(const id of requestedIds\)[\s\S]*await readMasterReturnOrder/);
});

test('print routes expose canonical batch endpoints', () => {
  const routes = read('src/routes/printRoutes.js');
  assert.match(routes, /'\/orders\/batch'/);
  assert.match(routes, /'\/master-orders\/batch'/);
  assert.match(routes, /'\/import-orders\/aggregate'/);
  assert.match(routes, /'\/master-return-orders\/batch'/);
});
