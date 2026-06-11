'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('import preview UI polls session when backend returns 202 queued', () => {
  const source = read('public/js/app/08-reports-users-promotions-import-excel.js');

  assert.match(source, /waitImportPreviewSession/);
  assert.match(source, /\/api\/import\/sessions\//);
  assert.match(source, /res\.status\s*===\s*202/);
  assert.match(source, /json\.accepted/);
  assert.match(source, /preview_ready/);
  assert.match(source, /failed/);
});

test('import template download uses authenticated fetch instead of window.location.href', () => {
  const source = read('public/js/app/08-reports-users-promotions-import-excel.js');

  assert.match(source, /downloadImportBlob/);
  assert.match(source, /fetch\(url\)/);
  assert.doesNotMatch(
    source,
    /window\.location\.href\s*=\s*`\/api\/import\/template/
  );
  assert.doesNotMatch(
    source,
    /window\.location\.href\s*=\s*`\/api\/import\/custom-template/
  );
});
