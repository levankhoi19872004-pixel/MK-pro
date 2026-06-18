'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const sales = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/services/master-order/masterOrderLegacy.service.js'));
const returns = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/services/masterReturnOrderService.js'));

test('master sales order atomically claims only unmerged active children', () => {
  assert.match(sales, /function buildUnclaimedChildOrderFilter/);
  assert.match(sales, /masterOrderId: \{ \$exists: false \}/);
  assert.match(sales, /mergeStatus: \{ \$ne: 'merged' \}/);
  assert.match(sales, /bulkWrite\(children\.map[\s\S]*?ordered: true, session/);
  assert.match(sales, /claimResult\.matchedCount[\s\S]*?children\.length/);
  assert.match(sales, /CHILD_ORDER_ALREADY_CLAIMED/);
});

test('master return order deduplicates input and atomically claims unmerged children', () => {
  assert.match(returns, /const returnOrderIds = \[\.\.\.new Set/);
  assert.match(returns, /MongoStore\.returnOrders\.updateMany/);
  assert.match(returns, /masterReturnOrderId: \{ \$exists: false \}/);
  assert.match(returns, /returnMergeStatus: \{ \$ne: 'merged' \}/);
  assert.match(returns, /claimResult\.matchedCount[\s\S]*?children\.length/);
  assert.match(returns, /RETURN_ORDER_ALREADY_CLAIMED/);
});
