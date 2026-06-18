'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('runtime import parser must not depend on vulnerable xlsx package', () => {
  const packageJson = JSON.parse(read('package.json'));
  const parser = read('utils/excelParser.js');
  const worker = read('utils/excelParser.worker.js');

  assert.ok(
    !packageJson.dependencies || !packageJson.dependencies.xlsx,
    'xlsx must not stay in production dependencies'
  );

  assert.doesNotMatch(parser, /require\(['"]xlsx['"]\)/);
  assert.doesNotMatch(worker, /require\(['"]xlsx['"]\)/);

  assert.match(parser, /child_process/);
  assert.match(parser, /fork/);
  assert.match(parser, /IMPORT_PARSE_TIMEOUT_MS/);

  assert.match(worker, /read-excel-file\/node/);
});
