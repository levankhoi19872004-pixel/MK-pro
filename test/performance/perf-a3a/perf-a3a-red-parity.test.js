'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const reader = require('../../../src/services/delivery/deliveryTodayCanonicalOrderReader');
const { buildPerfA3aFixture } = require('./fixture-factory');
const { FakeModel } = require('./fake-mongo');

function modelsFor(fixture) {
  return {
    SalesOrder: new FakeModel(fixture.orders, 'SalesOrder'),
    MasterOrder: new FakeModel(fixture.masterOrders, 'MasterOrder')
  };
}

test('RED evidence: legacy reader overfetches 5x and filters delivery after DB limit', async () => {
  const fixture = buildPerfA3aFixture(10000);
  const models = modelsFor(fixture);
  const result = await reader.listSalesOrders({
    date: fixture.target.date,
    deliveryStaffCode: fixture.target.deliveryStaffCode,
    limit: 100
  }, models, { deliveryCanonicalFilterV1: false });

  assert.equal(result.diagnostics.dbLimit, 500);
  assert.equal(result.diagnostics.rawOrderCount, 500);
  assert.ok(result.diagnostics.rawOrderCount >= result.diagnostics.limit * 5);
  assert.equal(models.SalesOrder.metrics.queries, 1);
  assert.ok(models.SalesOrder.metrics.rowsReturned >= 500);
});

test('GREEN contract is absent before implementation', async () => {
  const fixture = buildPerfA3aFixture(10000);
  const models = modelsFor(fixture);
  const result = await reader.listSalesOrders({
    date: fixture.target.date,
    deliveryStaffCode: fixture.target.deliveryStaffCode,
    limit: 100
  }, models, { deliveryCanonicalFilterV1: true });

  assert.equal(result.diagnostics.readerMode, 'db-native');
  assert.ok(result.diagnostics.rowsProcessed <= 300);
  assert.ok(result.pagination);
  assert.equal(result.pagination.limit, 100);
});
