'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const readPublicIndex = require('./helpers/readPublicIndex');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

test('master-order facade preserves the pre-refactor public contract', () => {
  const service = require('../src/services/masterOrderService');
  const snapshot = require('./fixtures/master-order/before-refactor.json');
  const expected = [...snapshot.deliveryExports, ...snapshot.accountingExports, ...snapshot.printExports];
  assert.deepEqual(expected.filter((name) => typeof service[name] !== 'function'), []);
  assert.ok(fs.statSync(path.join(ROOT, 'src/services/master-order/masterOrderLegacy.service.js')).size < 8192);
});

test('excel import facade preserves controller contract', () => {
  const service = require('../src/services/excelImportService');
  const expected = ['buildPreviewFromRows', 'previewPastedRows', 'preview', 'getSessionStatus', 'getSessionRows', 'commit', 'importDirect', 'logs'];
  assert.deepEqual(expected.filter((name) => typeof service[name] !== 'function'), []);
  assert.ok(fs.statSync(path.join(ROOT, 'src/services/excelImportService.js')).size < 4096);
});

test('assembled index page matches the approved Phase80 characterization snapshot', () => {
  const html = readPublicIndex(ROOT);
  const expectedHash = require('./helpers/sourceBundle.util').readSource(path.join(ROOT, 'test/fixtures/index-page/phase79-assembled.sha256')).trim();
  assert.equal(sha256(html), expectedHash);
  assert.match(html, /id="salesTab"/);
  assert.match(html, /\/js\/bootstrap\/03-tab-loader\.js/);
});

test('split CSS parts preserve exact legacy cascade order', () => {
  const base = walk(path.join(ROOT, 'public/css/base')).filter((file) => file.endsWith('.css')).sort().map((file) => fs.readFileSync(file)).join('');
  const overrides = walk(path.join(ROOT, 'public/css/overrides')).filter((file) => file.endsWith('.css')).sort().map((file) => fs.readFileSync(file)).join('');
  assert.equal(sha256(base), '3241a50ace3f5d18b9ab1f25f9295c3d8606f5b0e80997a781b9e6527d1d5b6e');
  assert.equal(sha256(overrides), '2b201385219e49d988319457eaaf18ea50b3494cd6fe526095df1545056e6783');
});

test('source size budget blocks new God Files in extracted domains', () => {
  require('../scripts/check-source-size-budget');
});
