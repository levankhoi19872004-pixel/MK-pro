'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('UI có chế độ cập nhật an toàn và gửi importMode qua preview', () => {
  const html = read('public/index.html');
  const js = read('public/js/app/admin/08d-import-excel.js');
  assert.match(html, /id="importDataMode"/);
  assert.match(html, /Cập nhật an toàn dữ liệu hiện có/);
  assert.match(js, /formData\.append\('importMode',getSelectedImportMode\(\)\)/);
  assert.match(js, /products','customers','users/);
});

test('import session lưu mode và worker truyền mode tới preview', () => {
  const model = read('src/models/ImportSession.js');
  const worker = read('src/jobs/importPreview.worker.js');
  const runner = read('src/jobs/importPreviewRunner.js');
  const sessionService = read('src/services/importSessionService.js');
  assert.match(model, /importMode: \{ type: String, enum: \['create', 'update'\]/);
  assert.match(worker, /importMode: payload\.importMode \|\| 'create'/);
  assert.match(runner, /const effectiveImportMode = parsingSession\?\.importMode === 'update'/);
  assert.match(runner, /importMode: effectiveImportMode/);
  assert.match(sessionService, /importMode: importMode === 'update' \? 'update' : 'create'/);
});

test('update sản phẩm, khách hàng và users không upsert bản ghi thiếu', () => {
  const service = read('src/services/excelImportService.js');
  assert.match(service, /Không tìm thấy sản phẩm để cập nhật/);
  assert.match(service, /Không tìm thấy khách hàng để cập nhật/);
  assert.match(service, /Không tìm thấy tài khoản để cập nhật/);
  assert.match(service, /mode: 'selective-update'/);
  assert.match(service, /upsert: false/);
  assert.match(service, /buildProductSelectiveUpdate/);
  assert.match(service, /buildCustomerSelectiveUpdate/);
  assert.match(service, /buildUserSelectiveUpdate/);
});

test('cập nhật chỉ ghi field khác và giữ ô trống', () => {
  const util = read('src/services/import/selectiveUpdate.util.js');
  const service = read('src/services/excelImportService.js');
  assert.match(util, /String\(value\)\.trim\(\) !== ''/);
  assert.match(util, /omitUnchanged/);
  assert.match(service, /item\.action = item\.errors\.length \? 'error' : \(item\.changeCount \? 'update' : 'no_change'\)/);
  assert.match(service, /item\.canImport = item\.errors\.length === 0 && item\.changeCount > 0/);
});
