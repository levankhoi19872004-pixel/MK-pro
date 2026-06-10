'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('dashboard aggregate service does not use find/map/reduce or await inside loops', () => {
  const file = path.join(__dirname, '..', 'src', 'services', 'dashboardAggregate.service.js');
  const content = fs.readFileSync(file, 'utf8');
  assert.equal(/\.find\s*\(/.test(content), false, 'dashboard aggregate must not use Model.find()');
  assert.equal(/\.map\s*\(/.test(content), false, 'dashboard aggregate must not map large result sets in JS');
  assert.equal(/\.reduce\s*\(/.test(content), false, 'dashboard aggregate must not reduce large result sets in JS');
  assert.equal(/for\s*\([^)]*\)\s*{[^}]*await/s.test(content), false, 'dashboard aggregate must not await inside loops');
});
