'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('all legacy import and export routes require explicit business roles', () => {
  const combined = read('src/routes/importExportRoutes.js');
  const excel = read('src/routes/excelImportRoutes.js');
  const runtime = read('src/routes/importRuntimeRoutes.js');

  assert.match(combined, /importRouter\.use\(manageImports\)/);
  assert.match(combined, /exportRouter\.use\(viewExports\)/);
  assert.match(combined, /requireRole\(\['admin', 'accountant', 'warehouse'\]\)/);
  assert.match(combined, /requireRole\(\['admin', 'manager', 'accountant', 'warehouse'\]\)/);
  assert.match(excel, /get\('\/sessions\/:sessionId', manageImports/);
  assert.match(excel, /get\('\/logs', manageImports/);
  assert.match(runtime, /get\('\/sessions\/:sessionId', manageImports/);
  assert.match(runtime, /get\('\/logs', manageImports/);
});
