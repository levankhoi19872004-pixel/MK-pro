'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('promotion import preview registers all promotion payload pickers', () => {
  const source = read('src/services/import/preview/importPreview.impl.js');
  const destructuring = source.match(/const \{([\s\S]*?)\} = rows;/);
  assert.ok(destructuring, 'preview service must destructure helpers from importRow.util');

  for (const helper of [
    'pickPromotionProductRulePayload',
    'pickPromotionGroupItemPayload',
    'pickPromotionGroupRulePayload'
  ]) {
    assert.match(destructuring[1], new RegExp(`\\b${helper}\\b`), `${helper} must be imported from importRow.util`);
    assert.match(source, new RegExp(`safeRows\\.map\\(${helper}\\)`), `${helper} must be used by preview branch`);
  }
});

test('promotion group item template and preview contract use the same required columns', () => {
  const template = read('services/excelTemplateService.js');
  const rowUtil = read('src/services/import/core/importRow.util.js');
  const index = read('public/fragments/index/06-index-body.html');

  assert.match(index, /<option value="promotionGroupItems">Import nhóm sản phẩm KM<\/option>/);
  assert.match(template, /promotionGroupItems:\s*\{/);
  assert.match(template, /headers:\s*\['Mã chương trình KM', 'Mã sản phẩm'\]/);
  assert.match(rowUtil, /row\['Mã chương trình KM'\]/);
  assert.match(rowUtil, /row\['Mã sản phẩm'\]/);
});

test('excel parser scoring recognizes promotion group import headers', () => {
  const worker = read('utils/excelParser.worker.js');
  for (const keyword of ['ma chuong trinh', 'ma nhom', 'nhom san pham', 'ctkm', 'km']) {
    assert.match(worker, new RegExp(`'${keyword}'`));
  }
});
