'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('backend preview exposes invalidRows warning contract without requiring full-row review', () => {
  const preview = read('src/services/import/preview/importPreview.impl.js');
  const session = read('src/services/importSessionService.js');
  const model = read('src/models/ImportSession.js');
  const util = read('src/services/import/core/importWarningContract.util.js');

  assert.match(preview, /attachImportWarningContract/);
  assert.match(util, /function buildImportInvalidRows/);
  assert.match(util, /MISSING_REQUIRED/);
  assert.match(util, /REFERENCE_NOT_FOUND/);
  assert.match(util, /INVALID_FORMAT/);
  assert.match(util, /DUPLICATE_IN_FILE/);
  assert.match(util, /BUSINESS_RULE_ERROR/);
  assert.match(session, /invalidRows: invalidRows\.slice\(0, 1000\)/);
  assert.match(session, /importableRows: warningSummary\.importableRows/);
  assert.match(model, /invalidRows: \{ type: \[ImportInvalidRowSchema\], default: \[\] \}/);
});

test('import warning popup only displays error or missing rows and can import valid rows', () => {
  const warningModal = read('public/js/app/admin/import-warning-modal.js');
  const part2 = read('public/js/app/admin/08d-import-excel.source/part-02.jsfrag');
  const indexFragment = read('public/fragments/index/07-index-body.html');

  assert.match(warningModal, /function renderImportWarningModal/);
  assert.match(warningModal, /function buildImportWarningRowsFromPreview/);
  assert.match(warningModal, /function rowHasImportWarningIssue/);
  assert.match(warningModal, /Import dòng hợp lệ/);
  assert.match(warningModal, /Xuất danh sách lỗi/);
  assert.match(warningModal, /Chỉ liệt kê dòng lỗi hoặc dòng thiếu dữ liệu/);
  assert.match(warningModal, /await commitImportExcel\(\)/);
  assert.match(warningModal, /importPreviewRows\.filter\(isImportRowSelectable\)/);
  assert.match(part2, /renderImportWarningModal\(result\)/);
  assert.match(indexFragment, /import-warning-modal\.js\?v=phase174-import-warning-popup-v1/);
});
