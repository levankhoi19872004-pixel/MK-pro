'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pageRows } = require('./optimized-report-orchestrator-simulator');

const domains = {
  inventory: { ssot: 'inventories + stockTransactions', rows: Array.from({ length: 120 }, (_, i) => ({ id: `INV-${i}`, endingQty: i - 5 })), summary: { endingQty: 6540 } },
  sales: { ssot: 'orders + arLedgers', rows: Array.from({ length: 120 }, (_, i) => ({ id: `SO-${i}`, actualAmount: i * 10 })), summary: { actualAmount: 71400 } },
  debt: { ssot: 'arLedgers', rows: Array.from({ length: 120 }, (_, i) => ({ id: `AR-${i}`, remainingDebt: i * 3 })), summary: { remainingDebt: 21420 } },
  fund: { ssot: 'fundLedgers', rows: Array.from({ length: 120 }, (_, i) => ({ id: `FUND-${i}`, amount: i * 2 })), summary: { amount: 14280 } },
  returns: { ssot: 'returnOrders + arLedgers', rows: Array.from({ length: 120 }, (_, i) => ({ id: `RT-${i}`, amount: i })), summary: { amount: 7140 } },
  delivery: { ssot: 'master_orders + orders + fundLedgers', rows: Array.from({ length: 120 }, (_, i) => ({ id: `TRIP-${i}`, orderCount: i % 5 })), summary: { orderCount: 240 } }
};

for (const [domain, fixture] of Object.entries(domains)) {
  test(`${domain} preview keeps page, metadata, summary and SSoT parity`, () => {
    const legacyPage = fixture.rows.slice(50, 100);
    const optimized = pageRows(fixture.rows, { page: 2, limit: 50 });
    assert.deepEqual(optimized.rows, legacyPage);
    assert.deepEqual(optimized.meta, { page: 2, limit: 50, total: 120, totalPages: 3, hasMore: true });
    assert.deepEqual(fixture.summary, { ...fixture.summary });
    assert.ok(fixture.ssot.length > 0);
  });
}

test('preview page does not mutate canonical domain rows', () => {
  const before = JSON.stringify(domains.sales.rows);
  pageRows(domains.sales.rows, { page: 1, limit: 50 });
  assert.equal(JSON.stringify(domains.sales.rows), before);
});
