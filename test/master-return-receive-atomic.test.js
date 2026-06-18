'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const master = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/services/masterReturnOrderService.js'));
const child = require('./helpers/sourceBundle.util').readSource('src/services/returnOrderLegacy.service.js');
const repo = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/repositories/returnOrderRepository.js'));

test('return order receive can join a parent transaction', () => {
  assert.match(child, /async function confirmReceiveReturnOrderInSession/);
  assert.match(child, /if \(options\.session\)/);
  assert.match(child, /InventoryPostingService\.postReturnIn\(received, \{ session \}\)/);
  assert.match(repo, /findByIdOrCode\(idOrCode, options = \{\}\)/);
  assert.match(repo, /session: options\.session/);
});

test('master return receive owns one transaction for every child and stock post', () => {
  const start = master.indexOf('async function confirmReceiveMasterReturnOrder');
  const end = master.indexOf('async function cancelMasterReturnOrder', start);
  const block = master.slice(start, end);
  assert.match(block, /return withMongoTransaction\(async \(session\)/);
  assert.match(block, /getChildren\(current, \{ session \}\)/);
  assert.match(block, /confirmReceiveReturnOrder\([\s\S]*?session,/);
  assert.match(block, /masterReturnOrderRepository\.upsert\(received, \{ session \}\)/);
  assert.doesNotMatch(block, /await withMongoTransaction[\s\S]*?await withMongoTransaction/);
});

test('missing or failed master return child aborts the parent transaction', () => {
  assert.match(master, /MASTER_RETURN_CHILD_MISSING/);
  assert.match(master, /MASTER_RETURN_CHILD_FAILED/);
  assert.match(master, /throw error/);
});
