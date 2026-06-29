'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('financialService manual return posts AR through ArPostingService boundary', () => {
  const source = read('src/services/financialService.js');

  assert.match(source, /const ArPostingService = require\('\.\.\/domain\/posting\/ArPostingService'\);/);
  assert.match(source, /ArPostingService\.postReturnAllocations\(/);
  assert.doesNotMatch(source, /type:\s*['"]return_manual['"]/);
  assert.doesNotMatch(source, /paymentRepository\.upsert\(payment,\s*\{\s*session\s*\}\)/);
  assert.doesNotMatch(source, /const\s+payments\s*=/);
});

test('ArPostingService return allocation wrapper delegates to returnArPostingService only once per returnOrder', () => {
  const source = read('src/domain/posting/ArPostingService.js');
  const fn = source.match(/async function postReturnAllocations\(returnOrder = \{\}, allocations = \[\], options = \{\}\) \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(source, /const returnArPostingService = require\('\.\.\/\.\.\/services\/accounting\/returnArPostingService'\);/);
  assert.match(source, /async function postReturnAllocations\(returnOrder = \{\}, allocations = \[\], options = \{\}\)/);
  assert.match(fn, /byReturnOrderKey = new Map\(\)/);
  assert.match(fn, /returnArPostingService\.postReturnOrderToAR\(/);
  assert.doesNotMatch(fn, /await postReturn\(/);
  assert.doesNotMatch(fn, /allocationKey/);
  assert.doesNotMatch(fn, /id:\s*`\$\{returnOrder\.id \|\| returnOrder\.code\}-/);
  assert.match(source, /postReturnAllocations,/);
});
