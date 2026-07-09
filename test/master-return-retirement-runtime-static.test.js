'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const routeSource = fs.readFileSync(path.join(ROOT, 'src/routes/masterReturnOrderRoutes.js'), 'utf8');
const retiredFlows = require('../config/retired-flows.json');

test('master-return write routes stay retired at runtime', () => {
  assert.match(routeSource, /retiredMasterReturnWrite/);
  assert.match(routeSource, /retiredMasterReturnStockIn/);
  assert.match(routeSource, /router\.post\('\/'/);
  assert.match(routeSource, /router\.put\('\/:id'/);
  assert.match(routeSource, /router\.patch\('\/:id'/);
  assert.match(routeSource, /router\.post\('\/:id\/receive'/);
  assert.match(routeSource, /router\.post\('\/:id\/cancel'/);
  assert.doesNotMatch(routeSource, /controller\.create/);
  assert.doesNotMatch(routeSource, /controller\.receive/);
});

test('retired-flows documents master-return write and receive replacement flows', () => {
  const writeFlow = retiredFlows.find((flow) => flow.id === 'master-return-orders-write-flow');
  const receiveFlow = retiredFlows.find((flow) => flow.id === 'master-return-orders-receive-flow');
  assert.ok(writeFlow, 'master return write flow must be retired');
  assert.ok(receiveFlow, 'master return receive flow must be retired');
  assert.equal(writeFlow.replacementFlow, 'returnOrders');
  assert.equal(receiveFlow.replacementFlow, 'returnStockInAccounting');
});
