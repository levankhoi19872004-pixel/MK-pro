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

test('promotion product rule preview treats missing catalog products as blocking errors', () => {
  const source = read('src/services/import/preview/importPreview.impl.js');
  const branch = source.slice(source.indexOf("type === 'promotionProductRules'"), source.indexOf("type === 'promotionGroupItems'"));

  assert.match(branch, /if \(item\.missingProduct\) item\.errors\.push\(PROMOTION_MISSING_PRODUCT_ERROR\)/);
  assert.doesNotMatch(branch, /item\.warnings\.push\('Mã sản phẩm chưa có trong danh mục'\)/);
  assert.match(branch, /item\.productMatched = Boolean\(product\)/);
  assert.match(branch, /item\.missingProduct = Boolean\(item\.productCode && !product\)/);
  assert.match(branch, /return finalizePromotionGroupItemPreview\(item\)/);
});

test('promotion product resolver maps every catalog code alias back to requested Excel code', () => {
  const rowUtil = read('src/services/import/core/importRow.util.js');

  assert.match(rowUtil, /const PROMOTION_PRODUCT_CODE_FIELDS = \[/);
  for (const field of ['code', 'productCode', 'sku', 'barcode', 'dmsCode', 'sapCode', 'unileverCode']) {
    assert.match(rowUtil, new RegExp(`'${field}'`), `${field} must be considered for promotion product lookup`);
  }
  assert.match(rowUtil, /function normalizePromotionProductCode/);
  assert.match(rowUtil, /scientific notation/);
  assert.match(rowUtil, /function addPromotionProductMapAlias/);
  assert.match(rowUtil, /for \(const field of PROMOTION_PRODUCT_CODE_FIELDS\)/);
  assert.match(rowUtil, /addPromotionProductMapAlias\(map, product\[field\], product\)/);
});

test('promotion product rule commit rejects missing catalog products fail-closed', () => {
  const source = read('src/services/import/operations/adminImport.impl.js');
  const branch = source.slice(source.indexOf('async function importPromotionProductRules'), source.indexOf('async function importPromotionGroupItems'));

  assert.match(branch, /if \(!product\) \{ skipped \+= 1; errors\.push\(\{ row: rowNo, productCode, error: `Mã sản phẩm \$\{productCode\} chưa có trong danh mục` \}\); continue; \}/);
  assert.doesNotMatch(branch, /warnings\.push\(\{ row: rowNo, productCode, warning: `Mã sản phẩm \$\{productCode\} chưa có trong danh mục` \}\)/);
  assert.match(branch, /partialImport: skipped > 0 && imported > 0/);
  assert.match(branch, /Đã import \$\{imported\} dòng CK sản phẩm hợp lệ, bỏ qua \$\{skipped\} dòng lỗi/);
});

test('promotion import preview exposes missing product summary for large CK files', () => {
  const source = read('src/services/import/preview/importPreview.impl.js');

  assert.match(source, /function aggregateMissingPromotionProducts/);
  assert.match(source, /missingProducts/);
  assert.match(source, /rowNos/);
  assert.match(source, /programCodes/);
  assert.match(source, /missingProductCount/);
});

test('promotion CK/product import UI removes invalid product rows from import list and keeps only valid rows selected', () => {
  const part1 = read('public/js/app/admin/08d-import-excel.source/part-01.jsfrag');
  const part2 = read('public/js/app/admin/08d-import-excel.source/part-02.jsfrag');
  const part3 = read('public/js/app/admin/08d-import-excel.source/part-03.jsfrag');

  assert.match(part1, /const PROMOTION_CATALOG_IMPORT_TYPES=new Set\(\['promotionProductRules','promotionGroupItems'\]\)/);
  assert.match(part1, /function isPromotionCatalogImportType/);
  assert.match(part2, /const shouldHideInvalidRows=isPromotionCatalogImportType\(\)&&removableErrorRows\.length>0/);
  assert.match(part2, /displayRows=shouldHideInvalidRows\?indexedRows\.filter\(x=>isImportRowSelectable\(x\.row\)\):indexedRows/);
  assert.match(part2, /Đã loại \$\{formatNumber\(removableErrorRows\.length\)\} dòng lỗi sản phẩm khỏi danh sách import/);
  assert.match(part2, /chỉ còn \$\{formatNumber\(selectableNow\)\} dòng hợp lệ được chọn sẵn/);
  assert.match(part3, /selectedRowNumbers:selectedRows\.map\(\(r,index\)=>getImportRowSourceNumber\(r,index\)\)\.filter\(Boolean\)/);
  assert.doesNotMatch(part3, /rows:selectedRows/);
});

test('import session commit can honor selected row numbers for non-order Excel rows', () => {
  const webDirect = read('src/services/import/ImportWebDirectCommitService.js');
  const commit = read('src/services/import/importCommit.impl.js');
  const session = read('src/services/importSessionService.js');

  assert.match(webDirect, /function normalizeSelectedRowNumbers/);
  assert.match(webDirect, /selectedRowNumbers: normalizeSelectedRowNumbers\(payload\.selectedRowNumbers\)/);
  assert.match(commit, /selectedRowNumbers = \[\]/);
  assert.match(commit, /selectRows\(session, selectedOrderCodes, selectedRowNumbers\)/);
  assert.match(session, /async function selectRows\(session, selectedOrderCodes = \[\], selectedRowNumbers = \[\]\)/);
  assert.match(session, /query\.rowNo = \{ \$in: Array\.from\(selectedRows\) \}/);
  assert.match(session, /selectedRows\.has\(rowNo\)/);
});
