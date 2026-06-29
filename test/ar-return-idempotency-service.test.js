'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const mockPaymentRepository = {
  findAll: async () => [],
  upsert: async (entry) => entry
};
const mockReturnOrderRepository = {
  findByIdOrCode: async () => null,
  upsert: async (entry) => entry
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('/repositories/paymentRepository') || request === '../../repositories/paymentRepository') return mockPaymentRepository;
  if (request.endsWith('/repositories/returnOrderRepository') || request === '../../repositories/returnOrderRepository') return mockReturnOrderRepository;
  if (request.endsWith('/services/auditService') || request === '../auditService') return { record: async (row) => row };
  if (request.endsWith('/utils/date.util') || request === '../../utils/date.util') {
    return {
      nowIso: () => '2026-06-29T00:00:00.000Z',
      todayVN: () => '2026-06-29',
      toDateOnly: (value) => String(value || '2026-06-29').slice(0, 10)
    };
  }
  if (request.endsWith('/utils/common.util') || request === '../../utils/common.util') {
    return { toNumber: (value) => Number(value || 0), makeId: (prefix) => `${prefix}-TEST` };
  }
  if (request.endsWith('/domain/staff/staffIdentity') || request === '../../domain/staff/staffIdentity') {
    return {
      pickSalesStaffCode: (row = {}) => row.salesStaffCode || row.salesmanCode || '',
      pickSalesStaffName: (row = {}) => row.salesStaffName || row.salesmanName || '',
      pickDeliveryStaffCode: (row = {}) => row.deliveryStaffCode || '',
      pickDeliveryStaffName: (row = {}) => row.deliveryStaffName || ''
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const returnArPostingService = require('../src/services/accounting/returnArPostingService');

test.after(() => {
  Module._load = originalLoad;
});

function patch(target, replacements) {
  const originals = {};
  for (const [key, value] of Object.entries(replacements)) {
    originals[key] = target[key];
    target[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(originals)) target[key] = value;
  };
}

function confirmedReturnOrder(extra = {}) {
  return {
    id: 'RO-1',
    code: 'RO-HU-1',
    sourceModel: 'returnOrders',
    sourceType: 'returnOrder',
    customerId: 'C1',
    customerCode: 'C1',
    customerName: 'Khach 1',
    salesOrderId: 'SO-1',
    salesOrderCode: 'HU-1',
    amount: 10000,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    status: 'posted',
    ...extra
  };
}

test('postReturnOrderToAR posts same returnOrder twice but only creates one AR-RETURN', async () => {
  const ledgers = [];
  const restorePayment = patch(mockPaymentRepository, {
    findAll: async (filter = {}) => {
      if (filter.idempotencyKey) return ledgers.filter((row) => row.idempotencyKey === filter.idempotencyKey);
      return ledgers.filter((row) => row.returnOrderId === 'RO-1' || row.returnOrderCode === 'RO-HU-1' || row.sourceId === 'RO-1' || row.sourceCode === 'RO-HU-1');
    },
    upsert: async (entry) => { ledgers.push(entry); return entry; }
  });

  try {
    const first = await returnArPostingService.postReturnOrderToAR(confirmedReturnOrder(), { returnResult: true, audit: false });
    const second = await returnArPostingService.postReturnOrderToAR(confirmedReturnOrder(), { returnResult: true, audit: false });

    assert.equal(first.posted, true);
    assert.equal(first.reason, 'created_ar_return');
    assert.equal(second.posted, false);
    assert.equal(second.reason, 'active_ar_return_same_idempotency_key');
    assert.equal(ledgers.length, 1);
    assert.equal(ledgers[0].idempotencyKey, 'AR-RETURN:RO-HU-1');
    assert.equal(ledgers[0].sourceType, 'returnOrder');
    assert.equal(ledgers[0].sourceId, 'RO-1');
    assert.equal(ledgers[0].sourceCode, 'RO-HU-1');
  } finally {
    restorePayment();
  }
});

test('postReturnOrderToAR throws P0 when active duplicate idempotencyKey exists', async () => {
  const duplicateLedgers = [
    { id: 'AR-RETURN-1A', code: 'AR-RETURN-RO-HU-1-A', type: 'ar_return', idempotencyKey: 'AR-RETURN:RO-HU-1', returnOrderId: 'RO-1', returnOrderCode: 'RO-HU-1', sourceType: 'returnOrder', sourceId: 'RO-1', sourceCode: 'RO-HU-1', credit: 10000, status: 'posted' },
    { id: 'AR-RETURN-1B', code: 'AR-RETURN-RO-HU-1-B', type: 'ar_return', idempotencyKey: 'AR-RETURN:RO-HU-1', returnOrderId: 'RO-1', returnOrderCode: 'RO-HU-1', sourceType: 'returnOrder', sourceId: 'RO-1', sourceCode: 'RO-HU-1', credit: 10000, status: 'posted' }
  ];
  const restorePayment = patch(mockPaymentRepository, {
    findAll: async (filter = {}) => (filter.idempotencyKey ? duplicateLedgers : []),
    upsert: async () => { throw new Error('upsert must not be called when duplicate exists'); }
  });

  try {
    await assert.rejects(
      () => returnArPostingService.postReturnOrderToAR(confirmedReturnOrder(), { returnResult: true, audit: false }),
      (err) => err && err.code === 'P0_AR_RETURN_DUPLICATE' && err.details?.reason === 'duplicate_active_idempotency_key'
    );
  } finally {
    restorePayment();
  }
});

test('AR-RETURN idempotencyKey stays stable and ignores accountingBatchId/forceRepostReturn', () => {
  const ro = confirmedReturnOrder({ accountingBatchId: 'BATCH-1' });
  const normal = returnArPostingService._internal.buildIdempotencyKey(ro, {});
  const forced = returnArPostingService._internal.buildIdempotencyKey(ro, { forceRepostReturn: true, accountingBatchId: 'BATCH-2' });

  assert.equal(normal, 'AR-RETURN:RO-HU-1');
  assert.equal(forced, normal);
});
