'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('docs:generate check keeps OpenAPI synchronized with route code', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-openapi.js', '--check'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /OpenAPI document is up to date/);
});
