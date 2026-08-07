'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const reader = require('../../../src/services/delivery/deliveryTodayCanonicalOrderReader');
const { buildPerfA3aFixture } = require('./fixture-factory');
const { FakeModel } = require('./fake-mongo');
const { oracleOrders } = require('./oracle-reader');

function createModels(fixture) {
  return {
    SalesOrder: new FakeModel(fixture.orders, 'SalesOrder'),
    MasterOrder: new FakeModel(fixture.masterOrders, 'MasterOrder')
  };
}

function ids(rows = []) {
  return rows.map((row) => String(row.orderId || row.id || row.code));
}

test('10k fixture is deterministic and covers canonical/legacy contracts', () => {
  const left = buildPerfA3aFixture(10000);
  const right = buildPerfA3aFixture(10000);
  assert.equal(left.seed, 'PERF-A3A-FIXTURE-V1');
  assert.equal(left.orders.length, 10000);
  assert.deepEqual(left.orders[1234], right.orders[1234]);
  assert.ok(left.orders.some((row) => row.deliveryDate instanceof Date));
  assert.ok(left.orders.some((row) => !row.deliveryDateKey && /^\d{2}\/\d{2}\/\d{4}$/.test(String(row.deliveryDate))));
  assert.ok(left.orders.some((row) => row.salesmanCode));
  assert.ok(left.orders.some((row) => row.nvghCode));
  assert.ok(left.masterOrders.length > 0);
  assert.ok(left.versions.length > left.orders.length);
  assert.ok(left.allocations.length > left.orders.length);
  assert.ok(left.returns.length > 0);
  assert.ok(left.orders.some((row) => row.totalAmount === 0));
  assert.ok(left.orders.some((row) => row.bankAmount === 'NaN'));
});

test('DB-native page 1 matches full-contract oracle and processes bounded rows', async () => {
  const fixture = buildPerfA3aFixture(10000);
  const query = { date: fixture.target.date, deliveryStaffCode: fixture.target.deliveryStaffCode, limit: 100 };
  const expected = oracleOrders(fixture, query).slice(0, 100);
  const models = createModels(fixture);
  const actual = await reader.listSalesOrders(query, models, { deliveryCanonicalFilterV1: true });

  assert.deepEqual(ids(actual.orders), ids(expected));
  assert.equal(actual.diagnostics.readerMode, 'db-native');
  assert.ok(actual.diagnostics.rowsProcessed <= 303);
  assert.equal(actual.pagination.limit, 100);
  assert.equal(actual.pagination.returned, 100);
  assert.equal(actual.pagination.mode, 'keyset-ready');
  assert.ok(actual.pagination.nextCursor);
});

test('keyset page 2 is stable, non-overlapping and matches oracle', async () => {
  const fixture = buildPerfA3aFixture(10000);
  const baseQuery = { date: fixture.target.date, deliveryStaffCode: fixture.target.deliveryStaffCode, limit: 100 };
  const expected = oracleOrders(fixture, baseQuery);
  const page1 = await reader.listSalesOrders(baseQuery, createModels(fixture), { deliveryCanonicalFilterV1: true });
  const page2 = await reader.listSalesOrders({ ...baseQuery, cursor: page1.pagination.nextCursor }, createModels(fixture), { deliveryCanonicalFilterV1: true });

  assert.deepEqual(ids(page1.orders), ids(expected.slice(0, 100)));
  assert.deepEqual(ids(page2.orders), ids(expected.slice(100, 200)));
  assert.equal(new Set([...ids(page1.orders), ...ids(page2.orders)]).size, page1.orders.length + page2.orders.length);
  assert.equal(page2.pagination.mode, 'keyset');
});

test('master-order metadata fallback does not lose legacy delivery assignments', async () => {
  const fixture = buildPerfA3aFixture(10000);
  const query = { date: fixture.target.date, deliveryStaffCode: 'D01', limit: 100 };
  const expected = oracleOrders(fixture, query).slice(0, 100);
  const actual = await reader.listSalesOrders(query, createModels(fixture), { deliveryCanonicalFilterV1: true });

  assert.deepEqual(ids(actual.orders), ids(expected));
  assert.ok(actual.orders.some((row) => String(row.deliveryAssignmentSource || '').startsWith('masterOrder.')));
  assert.ok(actual.diagnostics.masterScopedRowsRead > 0);
  assert.ok(actual.diagnostics.warnings.includes('LEGACY_DELIVERY_ORDER_FALLBACK_MERGED'));
});

test('unsupported free-text search falls back with explicit telemetry', async () => {
  const fixture = buildPerfA3aFixture(10000);
  const result = await reader.listSalesOrders({ date: fixture.target.date, q: 'SO-000', limit: 50 }, createModels(fixture), { deliveryCanonicalFilterV1: true });
  assert.equal(result.diagnostics.readerMode, 'legacy-fallback');
  assert.equal(result.diagnostics.legacyFallback, true);
  assert.equal(result.diagnostics.legacyFallbackReason, 'FREE_TEXT_SEARCH_REQUIRES_LEGACY_FALLBACK');
  assert.equal(result.diagnostics.telemetry.event, 'delivery_orders_legacy_fallback');
});

test('feature flag OFF preserves legacy reader path', async () => {
  const fixture = buildPerfA3aFixture(10000);
  const result = await reader.listSalesOrders({ date: fixture.target.date, deliveryStaffCode: fixture.target.deliveryStaffCode, limit: 100 }, createModels(fixture), { deliveryCanonicalFilterV1: false });
  assert.equal(result.diagnostics.readerMode, 'legacy');
  assert.equal(result.diagnostics.featureFlagEnabled, false);
  assert.equal(result.diagnostics.dbLimit, 500);
});

test('canonical branch uses exact equality so compound indexes remain usable', () => {
  const built = reader.buildOptimizedMatches({
    date: '2026-08-06',
    deliveryStaffCode: 'D02',
    salesStaffCode: 'S03',
    customerCode: 'C0042'
  });
  const clauses = built.canonicalMatch.$and || [];
  assert.ok(clauses.some((row) => row.deliveryDateKey === '2026-08-06'));
  assert.ok(clauses.some((row) => row.deliveryStaffCode === 'D02'));
  assert.ok(clauses.some((row) => row.salesStaffCode === 'S03'));
  assert.ok(clauses.some((row) => row.customerCode === 'C0042'));
  assert.equal(clauses.some((row) => Object.values(row).some((value) => value instanceof RegExp)), false);
});

test('deep offset pagination fails closed instead of silently truncating candidates', async () => {
  const fixture = buildPerfA3aFixture(10000);
  await assert.rejects(
    reader.listSalesOrders({
      date: fixture.target.date,
      deliveryStaffCode: fixture.target.deliveryStaffCode,
      page: 52,
      limit: 100
    }, createModels(fixture), { deliveryCanonicalFilterV1: true }),
    (error) => error && error.code === 'DELIVERY_KEYSET_CURSOR_REQUIRED'
  );
});
