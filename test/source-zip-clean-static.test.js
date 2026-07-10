'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('repository root is free of nested phase folders and node_modules for clean ZIP output', () => {
  const entries = fs.readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const nested = entries.filter((name) => name !== 'node_modules' && /^(mk\d+|phase\d+|phase\d+_|.*_work)$/.test(name));
  assert.deepEqual(nested, []);
  assert.equal(fs.existsSync(path.join(ROOT, '.env')), false, 'real .env must not sit in repository root');
  assert.equal(fs.existsSync(path.join(ROOT, 'npm-debug.log')), false, 'runtime logs must not sit in repository root');
});
