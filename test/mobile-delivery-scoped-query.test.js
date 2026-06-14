'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const serviceSource = fs.readFileSync('src/services/mobile/delivery.service.js', 'utf8');
const repositorySource = fs.readFileSync('src/repositories/mobile/delivery.repository.js', 'utf8');

test('mobile delivery list does not load the primary full snapshot', () => {
  const block = serviceSource.match(/async function listDeliveryOrders[\s\S]*?\n  function mobileDeliveryActorPayload/)?.[0] || '';
  assert.ok(block);
  assert.doesNotMatch(block, /getPrimaryDataSnapshot/);
  assert.match(block, /findAssignedMasterOrders/);
  assert.match(block, /findDeliveryOrders/);
  assert.match(block, /findArLedgersForOrders/);
});

test('mobile delivery repository scopes Mongo queries by delivery date and staff code', () => {
  assert.match(repositorySource, /deliveryDate:\s*date/);
  assert.match(repositorySource, /deliveryStaffCode:\s*staffCode/);
  assert.match(repositorySource, /MasterOrder\.find/);
  assert.match(repositorySource, /SalesOrder\.find/);
  assert.match(repositorySource, /ArLedger\.find/);
  assert.doesNotMatch(repositorySource, /readCollection|getPrimaryDataSnapshot/);
});

test('mobile delivery response keeps ownership verification after scoped query', () => {
  const block = serviceSource.match(/async function listDeliveryOrders[\s\S]*?\n  function mobileDeliveryActorPayload/)?.[0] || '';
  assert.match(block, /order\.deliveryStaffCode === actorCode/);
  assert.match(block, /order\.deliveryDate === targetDate/);
});
