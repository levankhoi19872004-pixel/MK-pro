'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const deliveryTodayNewService = require('../src/services/v2/deliveryTodayNew.service');

function chain(rows) {
  return {
    sort() { return this; },
    limit() { return this; },
    session() { return this; },
    lean: async () => rows
  };
}

test('Delivery Today canonical reader returns order from orders even when no masterOrder exists', async () => {
  deliveryTodayNewService.setModelsForTest({
    SalesOrder: { find() { return chain([{ id: 'SO-NO-MASTER', code: 'B-NO-MASTER', deliveryDate: '2026-07-06', deliveryStaffCode: 'GH1', salesStaffCode: 'NV1', totalAmount: 100000, cashAmount: 20000, bankAmount: 30000, rewardAmount: 10000 }]); } },
    MasterOrder: { find() { return chain([]); } },
    ReturnOrder: { find() { return { lean: async () => [] }; } },
    DeliveryCloseoutVersion: { find() { return chain([]); } },
    OrderPaymentAllocation: { find() { return chain([]); } }
  });
  const result = await deliveryTodayNewService.listOrders({ date: '2026-07-06', delivery: 'GH1', deliveryDateChangedByUser: '1' });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].orderCode, 'B-NO-MASTER');
  assert.equal(result.source.primary, 'orders');
  assert.equal(result.sourceBreakdown.masterOrdersRole, 'metadata-only');
  deliveryTodayNewService.setModelsForTest(null);
});

test('Delivery Today canonical reader enriches missing delivery staff from masterOrders metadata only', async () => {
  deliveryTodayNewService.setModelsForTest({
    SalesOrder: { find() { return chain([{ id: 'SO-META', code: 'B-META', deliveryDate: '2026-07-06', salesStaffCode: 'NV1', totalAmount: 100000, cashAmount: 20000 }]); } },
    MasterOrder: { find() { return chain([{ id: 'MO1', code: 'MO1', childOrderIds: ['SO-META'], deliveryStaffCode: 'GH_META', deliveryStaffName: 'Giao metadata' }]); } },
    ReturnOrder: { find() { return { lean: async () => [] }; } },
    DeliveryCloseoutVersion: { find() { return chain([]); } },
    OrderPaymentAllocation: { find() { return chain([]); } }
  });
  const result = await deliveryTodayNewService.listOrders({ date: '2026-07-06', delivery: 'GH_META', deliveryDateChangedByUser: '1' });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].deliveryStaffCode, 'GH_META');
  assert.equal(result.rows[0].masterOrderCode, 'MO1');
  assert.equal(result.sourceBreakdown.readerDiagnostics.masterMetadataAppliedCount, 1);
  deliveryTodayNewService.setModelsForTest(null);
});
