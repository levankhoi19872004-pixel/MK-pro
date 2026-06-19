'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('S3 Qc is accepted as the line packing snapshot without multiplying raw Số lượng', () => {
  const source = read('src/services/excelImportService.js');
  const packingStart = source.indexOf('function getPackingFromRow');
  const packingEnd = source.indexOf('const CARTON_QTY_FIELDS', packingStart);
  const packingBlock = source.slice(packingStart, packingEnd);
  const qtyStart = source.indexOf('function getDmsQuantityFromRow');
  const qtyEnd = source.indexOf('function getDmsPromoQuantityFromRow', qtyStart);
  const qtyBlock = source.slice(qtyStart, qtyEnd);

  assert.match(packingBlock, /row\['Qc'\]/);
  assert.match(packingBlock, /if \(rowPacking > 1\) return rowPacking/);
  assert.match(qtyBlock, /return getRawDmsQuantityValue\(row\)/);
  assert.doesNotMatch(qtyBlock, /getRawDmsQuantityValue\(row\)\s*\*/);
});

test('preview and commit shortage rows carry conversionRate for correct thùng/lẻ display', () => {
  const source = read('src/services/excelImportService.js');
  const matches = source.match(/conversionRate:\s*getPackingFromRow\(row, product\)/g) || [];
  assert.ok(matches.length >= 3, 'conversionRate must exist in preview detail, preview shortage and commit shortage rows');
  assert.match(source, /sourcePackingRate:\s*toNumber\(row\['Qc'\]/);
});

test('old shortage reports infer packing from product name and aggregate totals stay in SU', () => {
  const ui = read('public/js/app/admin/08a-reports.js');
  const reportService = read('src/services/importShortageReportService.js');

  assert.match(ui, /function resolveImportPackingRate/);
  assert.match(ui, /inferPackingRateFromTextClient\(row\)/);
  assert.match(ui, /function displayImportAggregateQty/);
  assert.match(reportService, /function inferPackingRate/);
  assert.match(reportService, /conversionRate:\s*inferPackingRate\(row\)/);
});
