'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const canonicalOrderReader = require('../src/services/delivery/deliveryTodayCanonicalOrderReader');
const scopeReader = require('../src/services/delivery/CanonicalDeliveryFinancialScopeReader');

function order(code) {
  return { id: `SO-${code}`, code, orderCode: code, deliveryStaffCode: 'ghth', deliveryDate: '2026-08-05' };
}

test('CanonicalDeliveryFinancialScopeReader loads every canonical page, dedupes identities and keeps masterOrders metadata-only', async () => {
  const original = canonicalOrderReader.listSalesOrders;
  const calls = [];
  canonicalOrderReader.listSalesOrders = async (query) => {
    calls.push({ ...query });
    if (!query.cursor) {
      return {
        orders: [order('B001'), order('B002')],
        pagination: { hasMore: true, nextCursor: 'CURSOR-2' },
        diagnostics: { reader: 'deliveryTodayCanonicalOrderReader', primarySource: 'orders' }
      };
    }
    return {
      orders: [order('B002'), order('B003')],
      pagination: { hasMore: false, nextCursor: null },
      diagnostics: { reader: 'deliveryTodayCanonicalOrderReader', primarySource: 'orders' }
    };
  };

  try {
    const result = await scopeReader.listAllOrders({
      date: '2026-08-05',
      deliveryStaffCode: 'ghth'
    }, {}, { pageSize: 2, maxOrders: 20 });

    assert.deepEqual(result.orders.map((row) => row.orderCode), ['B001', 'B002', 'B003']);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].limit, 2);
    assert.equal(calls[1].cursor, 'CURSOR-2');
    assert.equal(result.diagnostics.primarySource, 'orders');
    assert.equal(result.diagnostics.orderSource, 'orders');
    assert.equal(result.diagnostics.masterOrdersRole, 'metadata-only');
    assert.equal(result.diagnostics.totalOrdersLoaded, 3);
    assert.equal(result.diagnostics.pageCount, 2);
  } finally {
    canonicalOrderReader.listSalesOrders = original;
  }
});

test('CanonicalDeliveryFinancialScopeReader fails closed when canonical scope exceeds safety limit', async () => {
  const original = canonicalOrderReader.listSalesOrders;
  canonicalOrderReader.listSalesOrders = async () => ({
    orders: [order('B001'), order('B002')],
    pagination: { hasMore: true, nextCursor: 'NEXT' },
    diagnostics: { primarySource: 'orders' }
  });

  try {
    await assert.rejects(
      () => scopeReader.listAllOrders({ date: '2026-08-05', deliveryStaffCode: 'ghth' }, {}, { pageSize: 2, maxOrders: 2 }),
      (error) => error && error.code === 'DELIVERY_FINANCIAL_SCOPE_LIMIT_EXCEEDED'
    );
  } finally {
    canonicalOrderReader.listSalesOrders = original;
  }
});
