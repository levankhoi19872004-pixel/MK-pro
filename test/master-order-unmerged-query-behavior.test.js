'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const orderService = require('../src/services/orderService');
const servicePath = path.resolve(__dirname, '../src/services/master-order/masterOrderLegacy.service.js');

function row(overrides = {}) {
  return {
    id: 'SO-1',
    code: 'B0037771',
    orderDate: '2026-06-17',
    date: '2026-06-17',
    source: 'DMS',
    orderSource: 'DMS',
    salesStaffCode: 'NPP3293',
    salesStaffName: 'Minh Khai',
    mergeStatus: 'unmerged',
    masterOrderId: '',
    masterOrderCode: '',
    status: 'pending',
    lifecycleStatus: 'pending',
    deliveryStatus: 'pending',
    totalAmount: 9217838,
    ...overrides
  };
}

test('unmerged child query forwards current filters and keeps only matching unmerged DMS orders', async () => {
  const originalListOrders = orderService.listOrders;
  let receivedQuery = null;
  orderService.listOrders = async (query) => {
    receivedQuery = query;
    return [
      row(),
      row({ id: 'SO-2', code: 'B0037770', mergeStatus: 'merged', masterOrderId: 'MO-1' }),
      row({ id: 'SO-3', code: 'B0037769', orderDate: '2026-06-16', date: '2026-06-16' }),
      row({ id: 'SO-4', code: 'B0037751', source: 'NVBH', orderSource: 'NVBH' }),
      row({ id: 'SO-5', code: 'B0037747', salesStaffCode: '42176', salesStaffName: 'Vũ Thành Tâm' })
    ];
  };

  delete require.cache[servicePath];
  const masterOrderService = require(servicePath);

  try {
    const result = await masterOrderService.listUnmergedChildOrders({
      dateFrom: '2026-06-17',
      dateTo: '2026-06-18',
      source: 'DMS',
      salesStaff: 'NPP3293',
      limit: '5000'
    });

    assert.equal(receivedQuery.dateFrom, '2026-06-17');
    assert.equal(receivedQuery.dateTo, '2026-06-18');
    assert.equal(receivedQuery.salesStaffCode, 'npp3293');
    assert.equal(receivedQuery.limit, 5000);
    assert.equal(receivedQuery.__internalMaxLimit, 5000);
    assert.deepEqual(result.map((item) => item.code), ['B0037771']);
  } finally {
    orderService.listOrders = originalListOrders;
    delete require.cache[servicePath];
  }
});
