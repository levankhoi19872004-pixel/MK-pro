'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('import session mongoose schemas do not use reserved top-level errors path', () => {
  const importSessionModel = read('src/models/ImportSession.js');
  const importSessionRowModel = read('src/models/ImportSessionRow.js');
  const importSessionService = read('src/services/importSessionService.js');

  assert.doesNotMatch(
    importSessionModel,
    /^\s*errors:\s*\{/m,
    'ImportSession schema must not define top-level errors path'
  );

  assert.doesNotMatch(
    importSessionRowModel,
    /^\s*errors:\s*\{/m,
    'ImportSessionRow schema must not define top-level errors path'
  );

  assert.match(importSessionModel, /importErrors:\s*\{/);
  assert.match(importSessionRowModel, /rowErrors:\s*\{/);

  assert.match(importSessionService, /importErrors:\s*errors\.slice/);
  assert.match(importSessionService, /rowErrors/);
  assert.match(importSessionService, /\$unset:\s*\{[\s\S]*errors:\s*''/);
});
