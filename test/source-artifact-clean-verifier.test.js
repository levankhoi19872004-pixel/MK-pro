'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const verifier = path.join(ROOT, 'scripts/verify-source-artifact-clean.js');

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function write(file, content = 'x') {
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, content);
}

function makeZip(sourceDir, zipPath) {
  const result = spawnSync('tar', ['-a', '-cf', zipPath, '-C', sourceDir, '.'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function runVerifier(zipPath) {
  return spawnSync(process.execPath, [verifier, '--zip', zipPath], { encoding: 'utf8', cwd: ROOT });
}

test('artifact verifier passes a clean ZIP and rejects node_modules in ZIP', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-clean-'));
  const cleanSource = path.join(dir, 'clean');
  const dirtySource = path.join(dir, 'dirty-node-modules');
  const cleanZip = path.join(dir, 'clean.zip');
  const dirtyZip = path.join(dir, 'dirty-node-modules.zip');

  write(path.join(cleanSource, 'src/app.js'), 'console.log("ok");\n');
  write(path.join(dirtySource, 'src/app.js'), 'console.log("ok");\n');
  write(path.join(dirtySource, 'node_modules/pkg/index.js'), 'module.exports = 1;\n');
  makeZip(cleanSource, cleanZip);
  makeZip(dirtySource, dirtyZip);

  assert.equal(runVerifier(cleanZip).status, 0);
  const dirty = runVerifier(dirtyZip);
  assert.notEqual(dirty.status, 0);
  assert.match(dirty.stderr, /node_modules/);
});

test('artifact verifier rejects env files and nested archives', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-dirty-'));
  const source = path.join(dir, 'dirty-env');
  const zipPath = path.join(dir, 'dirty-env.zip');

  write(path.join(source, '.env'), 'SECRET=1\n');
  write(path.join(source, 'nested.zip'), 'not really a zip\n');
  makeZip(source, zipPath);

  const result = runVerifier(zipPath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\.env/);
  assert.match(result.stderr, /nested archive/);
});
