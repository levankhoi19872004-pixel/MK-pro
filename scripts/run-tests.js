'use strict';

require('./cleanup-retired-files');

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
const result = spawnSync(process.execPath, [
  '--require', preload,
  '--test',
  '--test-force-exit',
  '--test-concurrency=1',
  '--experimental-test-isolation=none',
  ...testFiles
], {
  stdio: 'inherit',
  env
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
