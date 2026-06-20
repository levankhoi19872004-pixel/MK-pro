'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const CONFIG = require('../config/source-bundles.json');

const ROOT = path.resolve(__dirname, '..');
const TARGET = 'public/mobile/js/delivery-mobile-view.js';
const CANONICAL = 'public/mobile/js/delivery-mobile-view.source.js';
const MAP_TARGET = 'public/mobile/js/delivery-mobile-view.js.map';
const LEGACY_PARTS = [
  'public/mobile/js/delivery-mobile-view.source/part-01.jsfrag',
  'public/mobile/js/delivery-mobile-view.source/part-02.jsfrag'
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function executableBody(runtime) {
  return runtime
    .replace(/^\/\* GENERATED FILE - DO NOT EDIT\.[\s\S]*?\*\/\n/, '')
    .replace(/\n?\/\/# sourceMappingURL=[^\r\n]+\s*$/, '');
}

test('pilot has one editable canonical source and no legacy fragments', () => {
  const entry = CONFIG.bundles.find((item) => item.target === TARGET);
  assert.ok(entry, 'pilot bundle must be registered');
  assert.equal(entry.canonicalSource, CANONICAL);
  assert.equal(entry.parts, undefined);
  assert.equal(entry.sourceMap, true);
  assert.equal(entry.sourceMapTarget, MAP_TARGET);
  assert.ok(fs.existsSync(path.join(ROOT, CANONICAL)));
  for (const oldPart of LEGACY_PARTS) assert.equal(fs.existsSync(path.join(ROOT, oldPart)), false, `${oldPart} must be retired`);
});

test('pilot canonical source, executable behavior hash and source map are locked', () => {
  const entry = CONFIG.bundles.find((item) => item.target === TARGET);
  const canonical = read(CANONICAL);
  const runtime = read(TARGET);
  const map = JSON.parse(read(MAP_TARGET));

  assert.equal(sha256(canonical), entry.sourceSha256);
  assert.match(runtime, /^\/\* GENERATED FILE - DO NOT EDIT\./);
  assert.match(runtime, /Canonical source: public\/mobile\/js\/delivery-mobile-view\.source\.js/);
  assert.match(runtime, /\/\/# sourceMappingURL=delivery-mobile-view\.js\.map/);
  assert.equal(sha256(`${executableBody(runtime)}\n`), entry.executableSha256);
  assert.equal(map.file, 'delivery-mobile-view.js');
  assert.deepEqual(map.sources, ['delivery-mobile-view.source.js']);
  assert.deepEqual(map.sourcesContent, [canonical]);
});
