'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Snapshot = require('../../../src/services/reports/DataQualitySnapshotService');

const fixture = {
  sales: {
    dateFrom: '2026-08-01', dateTo: '2026-08-06',
    summary: { missingArLedgerCount: 1, missingArDebitAmount: 1200 },
    sales: [{ date: '2026-08-06', code: 'SO-1', customerName: 'A', actualAmount: 1000, dataQuality: { missingValueCount: 1 } }]
  },
  inventory: {
    dateFrom: '2026-08-01', dateTo: '2026-08-06',
    stock: [{ productCode: 'P1', productName: 'SP 1', endingQty: -2, reconciliationDifference: -2 }]
  },
  delivery: {
    delivery: [{ deliveryDate: '2026-08-06', code: 'TRIP-1', deliveryStaffName: 'GH1', assignedOrderCount: 2, totalAmount: 2000, dataQuality: { missingChildren: true } }]
  },
  returns: {
    returns: [{ date: '2026-08-06', code: 'RT-1', customerName: 'A', amount: 500, arAmount: 0 }]
  }
};

function memoryRepository() {
  const rows = new Map();
  let reads = 0;
  let writes = 0;
  return {
    async findOne(filter) { reads += 1; return rows.get(filter.id) || null; },
    async upsert(filter, document) { writes += 1; rows.set(filter.id, { ...document }); return document; },
    stats() { return { reads, writes, size: rows.size }; }
  };
}

test.beforeEach(() => Snapshot._testing.reset());
test.afterEach(() => Snapshot._testing.reset());

test('rebuild dry-run computes versioned snapshot but performs no write', async () => {
  const repo = memoryRepository();
  Snapshot._testing.setRepository(repo);
  Snapshot._testing.setServiceFactory(() => ({
    sales: { salesReport: async () => fixture.sales },
    inventory: { inventoryMovementReport: async () => fixture.inventory },
    delivery: { deliveryTripsReport: async () => fixture.delivery },
    returns: { returnReport: async () => fixture.returns }
  }));
  const result = await Snapshot.rebuildSnapshot({ dateFrom: '2026-08-01', dateTo: '2026-08-06' }, {}, { apply: false, generatedAt: '2026-08-06T05:00:00.000Z' });
  assert.equal(result.applied, false);
  assert.equal(repo.stats().writes, 0);
  assert.equal(result.document.snapshotVersion, 'report-data-quality-v1');
  assert.equal(result.document.rows.length, 6);
  assert.equal(result.document.summary.criticalCount, 3);
  assert.match(result.document.sourceVersion, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.document.sourceRange, { dateFrom: '2026-08-01', dateTo: '2026-08-06' });
});

test('snapshot read path performs one snapshot read and zero domain calls', async () => {
  const repo = memoryRepository();
  let domainCalls = 0;
  Snapshot._testing.setRepository(repo);
  Snapshot._testing.setServiceFactory(() => ({
    sales: { salesReport: async () => { domainCalls += 1; return fixture.sales; } },
    inventory: { inventoryMovementReport: async () => { domainCalls += 1; return fixture.inventory; } },
    delivery: { deliveryTripsReport: async () => { domainCalls += 1; return fixture.delivery; } },
    returns: { returnReport: async () => { domainCalls += 1; return fixture.returns; } }
  }));
  await Snapshot.rebuildSnapshot({ dateFrom: '2026-08-01', dateTo: '2026-08-06' }, {}, { apply: true, generatedAt: '2026-08-06T05:00:00.000Z' });
  domainCalls = 0;
  const read = await Snapshot.readSnapshot({ dateFrom: '2026-08-01', dateTo: '2026-08-06' }, {}, { nowMs: Date.parse('2026-08-06T05:05:00.000Z') });
  assert.equal(domainCalls, 0);
  assert.equal(repo.stats().reads, 1);
  assert.equal(read.rows.length, 6);
  assert.equal(read.stale, false);
  assert.equal(read.generatedAt, '2026-08-06T05:00:00.000Z');
});

test('stale snapshot is returned with explicit warning rather than silently presented as fresh', async () => {
  const repo = memoryRepository();
  Snapshot._testing.setRepository(repo);
  Snapshot._testing.setServiceFactory(() => ({
    sales: { salesReport: async () => fixture.sales },
    inventory: { inventoryMovementReport: async () => fixture.inventory },
    delivery: { deliveryTripsReport: async () => fixture.delivery },
    returns: { returnReport: async () => fixture.returns }
  }));
  await Snapshot.rebuildSnapshot({ dateFrom: '2026-08-01', dateTo: '2026-08-06' }, {}, { apply: true, generatedAt: '2026-08-06T00:00:00.000Z' });
  const read = await Snapshot.readSnapshot({ dateFrom: '2026-08-01', dateTo: '2026-08-06' }, {}, { nowMs: Date.parse('2026-08-06T05:00:00.000Z') });
  assert.equal(read.stale, true);
  assert.match(read.staleWarning, /quá ngưỡng freshness/);
});

test('missing snapshot fails closed and never fans out live reports', async () => {
  const repo = memoryRepository();
  Snapshot._testing.setRepository(repo);
  await assert.rejects(() => Snapshot.readSnapshot({ dateFrom: '2026-08-01', dateTo: '2026-08-06' }), { code: 'REPORT_DATA_QUALITY_SNAPSHOT_UNAVAILABLE', status: 503 });
  assert.equal(repo.stats().reads, 1);
});
