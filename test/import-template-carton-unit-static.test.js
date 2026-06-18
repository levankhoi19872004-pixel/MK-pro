'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(ROOT, file));
}

function getDefinitionBlock(source, key) {
  const start = source.indexOf(`  ${key}: {`);
  assert.ok(start >= 0, `Không tìm thấy template ${key}`);
  const next = source.indexOf('\n  ', start + 1);
  const nextKey = source.indexOf('\n  ', source.indexOf('\n  ', start + 1) + 1);
  const candidates = ['products', 'customers', 'users', 'openingStock', 'importOrders', 'salesOrders', 'salesOrdersS3', 'promotionProductRules'];
  const starts = candidates
    .map((candidate) => source.indexOf(`  ${candidate}: {`, start + 1))
    .filter((index) => index > start)
    .sort((a, b) => a - b);
  const end = starts.length ? starts[0] : source.indexOf('\n};', start);
  return source.slice(start, end);
}

test('opening stock built-in template uses carton and unit quantity columns', () => {
  const source = read('services/excelTemplateService.js');
  const block = getDefinitionBlock(source, 'openingStock');

  assert.match(block, /columns:\s*\['date',\s*'productCode',\s*'productName',\s*'cartons',\s*'units'\]/);
  assert.match(block, /headers:\s*\['Ngày',\s*'Mã sản phẩm',\s*'Tên sản phẩm',\s*'SL thùng',\s*'SL lẻ'\]/);
  assert.doesNotMatch(block, /'Số lượng'/);
  assert.doesNotMatch(block, /'quantity'/);
});

test('import order built-in template uses carton and unit quantity columns', () => {
  const source = read('services/excelTemplateService.js');
  const block = getDefinitionBlock(source, 'importOrders');

  assert.match(block, /'cartons'/);
  assert.match(block, /'units'/);
  assert.match(block, /'SL thùng'/);
  assert.match(block, /'SL lẻ'/);
  assert.doesNotMatch(block, /'Số lượng'/);
  assert.doesNotMatch(block, /'quantity'/);
});

test('S3 compact sales order template also avoids single quantity column', () => {
  const source = read('services/excelTemplateService.js');
  const block = getDefinitionBlock(source, 'salesOrdersS3');

  assert.match(block, /'cartons'/);
  assert.match(block, /'units'/);
  assert.match(block, /'SL thùng'/);
  assert.match(block, /'SL lẻ'/);
  assert.doesNotMatch(block, /'Số lượng'/);
  assert.doesNotMatch(block, /'quantity'/);
});
