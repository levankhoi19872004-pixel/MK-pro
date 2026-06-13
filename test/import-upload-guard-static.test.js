'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('Excel import upload guard is centralized and bounded', () => {
  const middleware = read('src/middlewares/importUpload.middleware.js');

  assert.match(middleware, /IMPORT_MAX_FILE_SIZE/);
  assert.match(middleware, /IMPORT_MAX_FILES/);
  assert.match(middleware, /IMPORT_MAX_TOTAL_SIZE/);
  assert.match(middleware, /rejectLargeUploadByContentLength/);
  assert.match(middleware, /validateUploadedExcelFiles/);
  assert.match(middleware, /isZipMagic/);
  assert.match(middleware, /hasXlsxInternalSignature/);
  assert.match(middleware, /xl\/workbook\.xml/);
  assert.match(middleware, /\[Content_Types\]\.xml/);

  assert.doesNotMatch(middleware, /files:\s*20/);
});

test('Excel import routes do not parse uploads on disabled direct endpoint', () => {
  const excelRoute = read('src/routes/excelImportRoutes.js');
  const importExportRoute = read('src/routes/importExportRoutes.js');
  const runtimeRoute = read('src/routes/importRuntimeRoutes.js');

  for (const src of [excelRoute, importExportRoute, runtimeRoute]) {
    assert.doesNotMatch(src, /files:\s*20/);
    assert.match(src, /rejectLargeUploadByContentLength/);
    assert.match(src, /validateUploadedExcelFiles/);
  }

  assert.match(excelRoute, /router\.post\('\/direct',\s*manageImports,\s*excelImportController\.direct\)/);
  assert.match(importExportRoute, /importRouter\.post\('\/direct',\s*controller\.directImport\)/);
});
