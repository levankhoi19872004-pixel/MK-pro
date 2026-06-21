'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('import commit runs directly inside web process without mandatory background job', () => {
  const service = read('src/services/import/ImportWebDirectCommitService.js');
  const importExportController = read('src/controllers/importExportController.js');
  const excelController = read('src/controllers/excelImportController.js');
  const runtimeController = read('src/controllers/importRuntimeController.js');
  const routes = read('src/routes/importExportRoutes.js');
  const ui = read('public/js/app/admin/08d-import-excel.js');

  assert.match(service, /excelImportService\.commit/);
  assert.match(service, /currentStatus === 'done'/);
  assert.match(service, /alreadyCompleted: true/);
  assert.match(service, /currentStatus !== 'preview_ready'/);
  assert.doesNotMatch(service, /BackgroundJobService|JobSubmissionService|submitImportCommit/);

  assert.match(importExportController, /ImportWebDirectCommitService\.commitSession/);
  assert.match(excelController, /ImportWebDirectCommitService\.commitSession/);
  assert.match(runtimeController, /ImportWebDirectCommitService\.commitSession/);
  assert.doesNotMatch(importExportController, /submitImportCommit\(req\)/);
  assert.doesNotMatch(excelController, /AsyncJobHttpAdapter/);
  assert.doesNotMatch(runtimeController, /AsyncJobHttpAdapter/);

  assert.match(routes, /\/sessions\/:sessionId\/commit/);
  assert.match(ui, /\/api\/import\/sessions\/\$\{encodeURIComponent\(importPreviewSessionId\)\}\/commit/);
  assert.doesNotMatch(ui, /fetch\('\/api\/import\/commit'/);
});
