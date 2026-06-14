'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('delivery engine writes returnOrders through ReturnLifecycleService boundary', () => {
  const source = read('src/engines/delivery.legacy.engine.js');
  const saveReturnBlock = source.match(/async saveReturn\(body = \{\}\) \{[\s\S]*?\n  async savePayment\(/)?.[0] || '';

  assert.match(source, /function getReturnLifecycleService\(\)/);
  assert.match(saveReturnBlock, /getReturnLifecycleService\(\)\.createPendingReturn\(patch\)/);
  assert.doesNotMatch(saveReturnBlock, /this\.ReturnOrder\.findOneAndUpdate\s*\(/);
  assert.doesNotMatch(saveReturnBlock, /ReturnOrder\.findOneAndUpdate\s*\(/);
});

test('ReturnLifecycleService owns return lifecycle posting boundaries', () => {
  const source = read('src/domain/lifecycle/ReturnLifecycleService.js');

  assert.match(source, /async function createPendingReturn\(body = \{\}, options = \{\}\)/);
  assert.match(source, /async function confirmReceive\(idOrCode, options = \{\}\)/);
  assert.match(source, /async function confirmAccounting\(returnOrder = \{\}, options = \{\}\)/);
  assert.match(source, /async function postReturnStock\(returnOrder = \{\}, options = \{\}\)/);
  assert.match(source, /async function postReturnAR\(returnOrder = \{\}, options = \{\}\)/);
  assert.match(source, /InventoryPostingService\.postReturnIn\(returnOrder, options\)/);
  assert.match(source, /ArPostingService\.postReturn\(\{/);
  assert.match(source, /return \{ returnOrder, arEntry \};/);
  assert.match(source, /function getReturnOrderService\(\)/);
  assert.doesNotMatch(source.split('\n').slice(0, 5).join('\n'), /returnOrderService/);
});
