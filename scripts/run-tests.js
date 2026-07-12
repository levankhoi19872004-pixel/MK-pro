'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const testDir = path.join(ROOT, 'test');
const testFiles = fs.readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => path.join(testDir, name));

const env = { ...process.env, NODE_ENV: process.env.NODE_ENV || 'test' };
const preload = path.join(testDir, 'helpers', 'refactorReadCompat.js');

function usesGlobalModulePatch(file) {
  const source = fs.readFileSync(file, 'utf8');
  return /Module\._load\s*=/.test(source);
}

function runNodeTest(files, label) {
  if (!files.length) return 0;
  const result = spawnSync(process.execPath, [
    '--require', preload,
    '--test',
    '--test-force-exit',
    '--test-concurrency=1',
    '--experimental-test-isolation=none',
    ...files
  ], {
    stdio: 'inherit',
    env
  });

  if (result.error) {
    console.error(`[run-tests] ${label} failed to start`, result.error);
    return 1;
  }
  return result.status ?? 1;
}

const isolatedFiles = [];
const sharedFiles = [];
for (const file of testFiles) {
  if (usesGlobalModulePatch(file)) isolatedFiles.push(file);
  else sharedFiles.push(file);
}

let status = 0;
for (const file of isolatedFiles) {
  const code = runNodeTest([file], `isolated ${path.relative(ROOT, file)}`);
  if (code !== 0) status = code;
}

const sharedChunkSize = Math.max(1, Math.floor(Number(process.env.TEST_SHARED_CHUNK_SIZE || 40)) || 40);
for (let i = 0; i < sharedFiles.length; i += sharedChunkSize) {
  const chunk = sharedFiles.slice(i, i + sharedChunkSize);
  const first = path.relative(ROOT, chunk[0] || '');
  const last = path.relative(ROOT, chunk[chunk.length - 1] || '');
  const code = runNodeTest(chunk, `shared suite ${i + 1}-${i + chunk.length} ${first}..${last}`);
  if (code !== 0) status = code;
}

process.exit(status);
