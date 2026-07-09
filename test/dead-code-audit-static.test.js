'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('dead-code audit config and script exist and reject nested phase folders', () => {
  const configPath = path.join(ROOT, 'config/retired-files.json');
  const scriptPath = path.join(ROOT, 'scripts/audit-dead-code.js');
  assert.ok(fs.existsSync(configPath));
  assert.ok(fs.existsSync(scriptPath));
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(config.version, 1);
  assert.ok(Array.isArray(config.retired));
  const output = execFileSync(process.execPath, [scriptPath], { cwd: ROOT, encoding: 'utf8' });
  assert.match(output, /\[dead-code-audit\] OK/);
});

test('cleanup report documents candidate-only cleanup policy', () => {
  const report = fs.readFileSync(path.join(ROOT, 'docs/CODEBASE_CLEANUP_REPORT.md'), 'utf8');
  assert.match(report, /không xóa mù/i);
  assert.match(report, /retired-files\.json/);
  assert.match(report, /Nested phase folder guard/);
});
