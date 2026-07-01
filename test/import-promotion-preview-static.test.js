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

test('promotion group item preview treats missing catalog products as blocking errors', () => {
  const source = read('src/services/import/preview/importPreview.impl.js');
  const branch = source.slice(source.indexOf("type === 'promotionGroupItems'"), source.indexOf("type === 'promotionGroupRules'"));

  assert.match(branch, /PROMOTION_MISSING_PRODUCT_ERROR/);
  assert.doesNotMatch(branch, /item\.warnings\.push\('Mã sản phẩm chưa có trong danh mục'\)/);
  assert.match(branch, /item\.missingProduct = Boolean\(item\.productCode && !product\)/);
  assert.match(branch, /if \(item\.missingProduct\) item\.errors\.push\(PROMOTION_MISSING_PRODUCT_ERROR\)/);
  assert.match(branch, /return finalizePromotionGroupItemPreview\(item\)/);
  assert.match(source, /const valid = item\.errors\.length === 0 && item\.missingProduct !== true && item\.productMatched !== false/);
  assert.match(source, /missingProductCount/);
});

test('promotion group item commit rejects missing catalog products even when frontend sends them', () => {
  const source = read('src/services/import/operations/adminImport.impl.js');
  const branch = source.slice(source.indexOf('async function importPromotionGroupItems'), source.indexOf('async function importPromotionGroupRules'));

  assert.match(branch, /if \(!product\) \{/);
  assert.match(branch, /errors\.push\(\{ row: rowNo, productCode, error: `Mã sản phẩm \$\{productCode\} chưa có trong danh mục` \}\)/);
  assert.match(branch, /continue;/);
  assert.match(branch, /const productName = cleanText\(product\.name \|\| payload\.productName \|\| ''\)/);
});

test('promotion group item frontend blocks invalid rows from status, checkbox and selected payload', () => {
  const part1 = read('public/js/app/admin/08d-import-excel.source/part-01.jsfrag');
  const part2 = read('public/js/app/admin/08d-import-excel.source/part-02.jsfrag');

  assert.match(part1, /function importRowHasMissingCatalogProduct/);
  assert.match(part1, /row\.missingProduct===true/);
  assert.match(part1, /productCode&&row\.productMatched===false/);
  assert.match(part1, /warningText\.includes\('mã sản phẩm chưa có trong danh mục'\)/);
  assert.match(part1, /function normalizeImportPreviewRowValidity/);
  assert.match(part1, /next\.valid=false/);
  assert.match(part1, /next\.canImport=false/);
  assert.match(part1, /function isImportRowSelectable/);
  assert.match(part1, /getSelectedImportRows\(\)\{\n  return importPreviewRows\.filter\(\(row,index\)=>isImportRowSelectable\(row\)/);

  assert.match(part2, /\.map\(normalizeImportPreviewRowValidity\)/);
  assert.match(part2, /disabled title="Dòng lỗi không được import"/);
  assert.match(part2, /missingProductNow=importPreviewRows\.filter\(importRowHasMissingCatalogProduct\)\.length/);
  assert.match(part2, /Vui lòng cập nhật danh mục sản phẩm hoặc chỉ import các dòng hợp lệ/);
});

test('import preview normalizes mojibake uploaded file names before rows reach the UI', () => {
  const preview = read('src/services/import/preview/importPreview.impl.js');
  const runner = read('src/jobs/importPreviewRunner.js');

  assert.match(preview, /function normalizeUploadedFileName/);
  assert.match(preview, /Buffer\.from\(text, 'latin1'\)\.toString\('utf8'\)/);
  assert.match(preview, /normalizeUploadedFileName\(file\.originalname \|\| file\.filename \|\| file\.name/);
  assert.match(runner, /function normalizePreviewFileName/);
  assert.match(runner, /const currentFileName = normalizePreviewFileName/);
});
