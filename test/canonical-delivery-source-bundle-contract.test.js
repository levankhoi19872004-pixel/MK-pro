'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const ENGINE_PARTS = [
  'src/engines/delivery.legacy.engine.source/part-01.jsfrag',
  'src/engines/delivery.legacy.engine.source/part-02.jsfrag',
  'src/engines/delivery.legacy.engine.source/part-03.jsfrag'
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('SRC-001: generated delivery engine identifies its canonical source fragments', () => {
  const generated = fs.readFileSync(path.join(ROOT, 'src/engines/delivery.legacy.engine.js'), 'utf8');
  assert.match(generated, /^\/\* GENERATED FILE/);
  for (const part of ENGINE_PARTS) assert.match(generated, new RegExp(path.basename(part).replace('.', '\\.')));
});

test('SRC-002: generated mobile bundle identifies source-of-truth file', () => {
  const generated = fs.readFileSync(path.join(ROOT, 'public/mobile/js/delivery-mobile-view.js'), 'utf8');
  assert.match(generated, /^\/\* GENERATED FILE/);
  assert.match(generated, /delivery-mobile-view\.source\.js/);
});

test('SRC-003: delivery engine generated runtime is assembled from reviewed source fragments', () => {
  const source = ENGINE_PARTS.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('');
  const generated = fs.readFileSync(path.join(ROOT, 'src/engines/delivery.legacy.engine.js'), 'utf8');
  const bannerEnd = generated.indexOf('\n') + 1;
  assert.equal(generated.slice(bannerEnd), source);
});

test('SRC-004: source bundle registry hash matches canonical delivery engine source', () => {
  const source = ENGINE_PARTS.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('');
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/source-bundles.json'), 'utf8'));
  const entry = config.bundles.find((row) => row.target === 'src/engines/delivery.legacy.engine.js');
  assert.ok(entry);
  assert.equal(entry.sourceSha256, sha256(source));
});
