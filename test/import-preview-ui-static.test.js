'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(ROOT, file));
}

test('import preview UI polls session when backend returns 202 queued', () => {
  const source = [read('public/js/app/admin/08a-reports.js'),read('public/js/app/admin/08b-users.js'),read('public/js/app/admin/08c-promotions-legacy.js'),read('public/js/app/admin/08d-import-excel.js'),read('public/js/app/admin/08e-promotion-programs.js'),read('public/js/app/admin/08f-vat-export.js')].join('\n');

  assert.match(source, /waitImportPreviewSession/);
  assert.match(source, /\/api\/import\/sessions\//);
  assert.match(source, /res\.status\s*===\s*202/);
  assert.match(source, /json\.accepted/);
  assert.match(source, /preview_ready/);
  assert.match(source, /failed/);
});

test('import template download uses authenticated fetch instead of window.location.href', () => {
  const source = [read('public/js/app/admin/08a-reports.js'),read('public/js/app/admin/08b-users.js'),read('public/js/app/admin/08c-promotions-legacy.js'),read('public/js/app/admin/08d-import-excel.js'),read('public/js/app/admin/08e-promotion-programs.js'),read('public/js/app/admin/08f-vat-export.js')].join('\n');

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
