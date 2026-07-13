'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('Phase257A shortage review popup exposes exactly the pre-commit choices', () => {
  const source = [
    read('public/js/app/admin/08d-import-excel.source/part-02b.jsfrag'),
    read('public/js/app/admin/08d-import-excel.source/part-03.jsfrag')
  ].join('\n');
  const runtime = [
    read('public/js/app/admin/08d-import-excel.part05.js'),
    read('public/js/app/admin/08d-import-excel.part03.js')
  ].join('\n');
  const css = read('public/css/40-import-sales.css');

  for (const text of [source, runtime]) {
    assert.match(text, /Review đơn thiếu hàng trước khi import/);
    assert.match(text, /Bỏ qua/);
    assert.match(text, /Import tất cả – loại trừ hàng thiếu/);
    assert.match(text, /Import tất cả – loại trừ đơn thiếu/);
    assert.match(text, /id="importShortageReviewTable"/);
    assert.match(text, /confirmImportShortageReviewAndCommit\(['"]exclude_shortage_quantity['"]\)/);
    assert.match(text, /confirmImportShortageReviewAndCommit\(['"]exclude_shortage_orders['"]\)/);
    assert.doesNotMatch(text, /shortageMode:importShortageActionMode\|\|'cut'/);
  }

  assert.match(css, /PHASE257A_IMPORT_SHORTAGE_REVIEW_START/);
  assert.match(css, /import-shortage-review-table-wrap/);
});

test('Phase257A shortage review API routes are mounted before generic session route', () => {
  const excelRoutes = read('src/routes/excelImportRoutes.js');
  const runtimeRoutes = read('src/routes/importRuntimeRoutes.js');
  const excelController = read('src/controllers/excelImportController.js');
  const runtimeController = read('src/controllers/importRuntimeController.js');

  assert.ok(excelRoutes.indexOf("'/sessions/:sessionId/shortage-review'") < excelRoutes.indexOf("'/sessions/:sessionId'"));
  assert.ok(runtimeRoutes.indexOf("'/sessions/:sessionId/shortage-review'") < runtimeRoutes.indexOf("'/sessions/:sessionId'"));
  assert.match(excelRoutes, /router\.put\('\/sessions\/:sessionId\/shortage-review'/);
  assert.match(runtimeRoutes, /router\.put\('\/sessions\/:sessionId\/shortage-review'/);
  assert.match(excelController, /importShortageReviewService\.getReview/);
  assert.match(excelController, /importShortageReviewService\.confirmReview/);
  assert.match(runtimeController, /importShortageReviewService\.getReview/);
  assert.match(runtimeController, /importShortageReviewService\.confirmReview/);
});
