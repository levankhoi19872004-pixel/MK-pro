'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('import session does not embed full import rows in parent document', () => {
  const model = read('src/models/ImportSession.js');
  const service = read('src/services/importSessionService.js');
  const excelImportService = read('src/services/excelImportService.js');
  const rowModel = read('src/models/ImportSessionRow.js');

  assert.match(rowModel, /import_session_rows/);
  assert.match(service, /ImportSessionRow/);
  assert.match(service, /insertMany/);

  assert.doesNotMatch(service, /validDataRows:\s*rows/);
  assert.doesNotMatch(service, /rawRows:\s*rawRows/);

  assert.match(service, /\$unset:\s*\{[\s\S]*validDataRows/);
  assert.match(service, /\$unset:\s*\{[\s\S]*rawRows/);

  assert.match(excelImportService, /await\s+importSessionService\.selectRows/);

  assert.doesNotMatch(model, /validDataRows:\s*\{\s*type:\s*\[mongoose\.Schema\.Types\.Mixed\]/);
  assert.doesNotMatch(model, /rawRows:\s*\{\s*type:\s*\[mongoose\.Schema\.Types\.Mixed\]/);
});
