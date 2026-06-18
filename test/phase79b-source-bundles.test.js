'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = require('../config/source-bundles.json');
const readPublicIndex = require('./helpers/readPublicIndex');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readParts(entry) {
  return entry.parts.map((part) => fs.readFileSync(path.join(ROOT, part), 'utf8')).join('');
}

test('phase79b covers every remaining High source file with a locked canonical source bundle', () => {
  assert.equal(CONFIG.bundles.length, 18);
  for (const entry of CONFIG.bundles) {
    assert.equal(sha256(readParts(entry)), entry.sourceSha256, `${entry.target} canonical hash drifted`);
    for (const part of entry.parts) {
      assert.ok(fs.statSync(path.join(ROOT, part)).size <= 24576, `${part} exceeds 24 KiB source-part budget`);
      if (entry.mode !== 'css-imports') assert.ok(part.endsWith('.jsfrag'), `${part} must remain non-executable source`);
    }
  }
});

test('generated runtime bundles are current and remain below the High-file threshold', () => {
  const result = childProcess.spawnSync(process.execPath, ['scripts/build-source-bundles.js', '--check'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  for (const entry of CONFIG.bundles) {
    const runtimeFiles = entry.runtimeFiles || [entry.target];
    for (const file of runtimeFiles) {
      const bytes = fs.statSync(path.join(ROOT, file)).size;
      assert.ok(bytes <= 40960, `${file} remains oversized: ${bytes} bytes`);
    }
  }
});

test('classic browser shards are loaded once and in canonical order', () => {
  const html = readPublicIndex(ROOT);
  for (const entry of CONFIG.bundles.filter((item) => item.mode === 'classic-chunks')) {
    let previous = -1;
    for (const runtimeFile of entry.runtimeFiles) {
      const publicPath = `/${runtimeFile.replace(/^public\//, '')}`;
      const index = html.indexOf(publicPath);
      assert.ok(index > previous, `${publicPath} missing or out of order`);
      assert.equal(html.indexOf(publicPath, index + 1), -1, `${publicPath} loaded more than once`);
      previous = index;
    }
  }
});

test('CSS manifests import every canonical part in original cascade order', () => {
  for (const entry of CONFIG.bundles.filter((item) => item.mode === 'css-imports')) {
    const manifest = fs.readFileSync(path.join(ROOT, entry.target), 'utf8');
    let previous = -1;
    for (const part of entry.parts) {
      const relative = `./${path.relative(path.dirname(entry.target), part).replace(/\\/g, '/')}`;
      const index = manifest.indexOf(relative);
      assert.ok(index > previous, `${entry.target} does not preserve ${part} order`);
      previous = index;
    }
  }
});

test('CommonJS compatibility bundles still expose callable public contracts', () => {
  for (const entry of CONFIG.bundles.filter((item) => item.mode === 'commonjs')) {
    const exported = require(path.join(ROOT, entry.target));
    assert.ok(exported !== undefined && exported !== null, `${entry.target} exports nothing`);
    if (typeof exported === 'object') {
      assert.ok(Object.keys(exported).length > 0, `${entry.target} has an empty export contract`);
    }
  }
});
