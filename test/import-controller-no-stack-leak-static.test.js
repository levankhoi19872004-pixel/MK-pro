'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('importExportController must not expose err.stack directly in JSON responses', () => {
  const src = read('src/controllers/importExportController.js');

  assert.doesNotMatch(
    src,
    /detail:\s*err\.stack/,
    'Controller must not return err.stack in API response'
  );

  assert.doesNotMatch(
    src,
    /res\.status\(500\)\.json\(\{[^}]*err\.stack/s,
    '500 JSON response must not include stack directly'
  );

  assert.match(
    src,
    /sendSafeInternalError/,
    'Controller should use a safe internal error response helper'
  );

  assert.match(
    src,
    /NODE_ENV\s*!==\s*['"]production['"]/,
    'Stack/detail should only be allowed outside production'
  );
});
