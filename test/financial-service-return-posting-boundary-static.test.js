'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('financialService manual return posts AR through ArPostingService boundary', () => {
  const source = read('src/services/financialService.js');

  assert.match(source, /const ArPostingService = require\('\.\.\/domain\/posting\/ArPostingService'\);/);
  assert.match(source, /ArPostingService\.postReturnAllocations\(/);
  assert.doesNotMatch(source, /type:\s*['"]return_manual['"]/);
  assert.doesNotMatch(source, /paymentRepository\.upsert\(payment,\s*\{\s*session\s*\}\)/);
  assert.doesNotMatch(source, /const\s+payments\s*=/);
});

test('ArPostingService exposes return allocation posting wrapper', () => {
  const source = read('src/domain/posting/ArPostingService.js');

  assert.match(source, /async function postReturnAllocations\(returnOrder = \{\}, allocations = \[\], options = \{\}\)/);
  assert.match(source, /const \{ toNumber \} = require\('\.\.\/\.\.\/utils\/common\.util'\);/);
  assert.match(source, /await postReturn\(/);
  assert.match(source, /postReturnAllocations,/);
});
