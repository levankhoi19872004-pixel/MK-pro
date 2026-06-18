'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);
function readPhysical(file) {
  const fd = fs.openSync(path.join(ROOT, file), 'r');
  try { return fs.readFileSync(fd, 'utf8'); } finally { fs.closeSync(fd); }
}

test('master-order facade is composed from explicit query/command boundaries', () => {
  const facade = read('src/services/master-order/masterOrderDelivery.service.js');
  assert.match(facade, /masterOrderQuery\.service/);
  assert.match(facade, /masterOrderCommand\.service/);
  assert.match(facade, /deliveryTodayQuery\.service/);
  assert.match(facade, /deliveryOrderCommand\.service/);
});

test('identity rules are physically extracted from legacy service', () => {
  const facade = readPhysical('src/services/master-order/masterOrderLegacy.service.js');
  const queryImpl = read('src/services/master-order/masterOrderQuery.impl.js');
  const identity = read('src/services/master-order/masterOrderIdentity.util.js');
  assert.match(queryImpl, /require\('\.\/masterOrderIdentity\.util'\)/);
  assert.doesNotMatch(facade, /function normalizeMasterSalesOrderRefs/);
  assert.match(identity, /function normalizeMasterSalesOrderRefs/);
  assert.match(identity, /function buildIdentityInFilter/);
});

test('accounting boundary keeps feature-flagged rollback path', () => {
  const accounting = read('src/services/master-order/deliveryAccounting.service.js');
  assert.match(accounting, /USE_NEW_DELIVERY_SETTLEMENT/);
  assert.match(accounting, /DeliverySettlementService\.confirmAccounting/);
  assert.match(accounting, /legacyImplementation\.confirmDeliveryAccounting/);
  assert.doesNotMatch(accounting, /masterOrderLegacy\.service/);
});
