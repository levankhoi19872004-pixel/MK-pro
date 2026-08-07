'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const searchServicePath = require.resolve('../../../src/services/searchService');
require.cache[searchServicePath] = { id: searchServicePath, filename: searchServicePath, loaded: true, exports: {} };
const returnGuardPath = require.resolve('../../../src/domain/returns/ReturnMutationGuard');
require.cache[returnGuardPath] = {
  id: returnGuardPath,
  filename: returnGuardPath,
  loaded: true,
  exports: {
    RETURN_ORDER_LOCK_PROJECTION: '',
    resolveDeliveryAccountingLockState: () => ({ locked: false, warnings: [] })
  }
};
const service = require('../../../src/services/v2/deliveryTodayNew.service');
const { buildPerfA3aFixture } = require('./fixture-factory');
const { FakeModel } = require('./fake-mongo');
const { oracleOrders } = require('./oracle-reader');

function createModels(fixture) {
  return {
    SalesOrder: new FakeModel(fixture.orders, 'SalesOrder'),
    MasterOrder: new FakeModel(fixture.masterOrders, 'MasterOrder'),
    DeliveryCloseoutVersion: new FakeModel(fixture.versions, 'DeliveryCloseoutVersion'),
    OrderPaymentAllocation: new FakeModel(fixture.allocations, 'OrderPaymentAllocation'),
    ReturnOrder: new FakeModel(fixture.returns, 'ReturnOrder')
  };
}

function ids(rows = []) {
  return rows.map((row) => String(row.orderId || row.id || row.code));
}

test('listOrders integrates DB-native pagination before financial state reads', async (t) => {
  const fixture = buildPerfA3aFixture(10000);
  const models = createModels(fixture);
  service.setModelsForTest(models);
  t.after(() => service.setModelsForTest(null));
  const query = {
    date: fixture.target.date,
    deliveryStaffCode: fixture.target.deliveryStaffCode,
    limit: 100
  };
  const result = await service.listOrders(query, {
    deliveryCanonicalFilterV1: true,
    financialReadMode: 'on'
  });
  const expected = oracleOrders(fixture, query).slice(0, 100);

  assert.deepEqual(ids(result.rows), ids(expected));
  assert.equal(result.rows.length, 100);
  assert.equal(result.pagination.limit, 100);
  assert.equal(result.sourceBreakdown.readerDiagnostics.readerMode, 'db-native');
  assert.equal(result.diagnostics.performance.dbNativeLatestState, true);
  assert.ok(result.diagnostics.performance.versionCandidateRowsRead <= 100);
  assert.ok(result.diagnostics.performance.allocationCandidateRowsRead <= 200);
  assert.ok(result.rows.every((row) => row.deliveryDate === fixture.target.date));
  assert.ok(result.rows.every((row) => row.deliveryStaffCode === fixture.target.deliveryStaffCode));
  assert.ok(result.rows.every((row) => Number.isFinite(Number(row.finalDebtAmount))));
});

test('repository work is bounded to selected page, not all 10k fixture rows', async (t) => {
  const fixture = buildPerfA3aFixture(10000);
  const models = createModels(fixture);
  service.setModelsForTest(models);
  t.after(() => service.setModelsForTest(null));
  const result = await service.listOrders({
    date: fixture.target.date,
    deliveryStaffCode: fixture.target.deliveryStaffCode,
    limit: 100
  }, {
    deliveryCanonicalFilterV1: true,
    financialReadMode: 'on'
  });

  assert.ok(result.sourceBreakdown.readerDiagnostics.rowsProcessed <= 303);
  assert.equal(models.DeliveryCloseoutVersion.metrics.queries, 1);
  assert.equal(models.OrderPaymentAllocation.metrics.queries, 2);
  assert.equal(models.ReturnOrder.metrics.queries, 1);
  assert.ok(models.DeliveryCloseoutVersion.metrics.aggregateOutputRows <= 100);
  assert.ok(models.OrderPaymentAllocation.metrics.aggregateOutputRows <= 200);
});
