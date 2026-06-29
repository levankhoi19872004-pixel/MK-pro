'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const mockReturnArPostingService = { postReturnOrderToAR: async () => null };
const mockReturnOrderRepository = { findByIdOrCode: async () => null, upsert: async (row) => row };
const mockPostingEngine = {
  postReceiptAR: async (row) => row,
  postSalesOrderAR: async (row) => row,
  postBonusAllowanceAR: async () => null
};
const mockPaymentRepository = { findAll: async () => [], upsert: async (row) => row };

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../accounting/returnArPostingService' || request.endsWith('/services/accounting/returnArPostingService')) return mockReturnArPostingService;
  if (request === '../../repositories/returnOrderRepository' || request.endsWith('/repositories/returnOrderRepository')) return mockReturnOrderRepository;
  if (request === '../../repositories/customerRepository' || request.endsWith('/repositories/customerRepository')) return { findByIdOrCode: async () => null, save: async (row) => row };
  if (request === '../../engines/posting.engine' || request.endsWith('/engines/posting.engine')) return mockPostingEngine;
  if (request === '../../domain/posting/ArPostingService' || request.endsWith('/domain/posting/ArPostingService')) return { postBatch: async () => [], markReversed: async () => [] };
  if (request === '../../repositories/paymentRepository' || request.endsWith('/repositories/paymentRepository')) return mockPaymentRepository;
  if (request === './masterOrderReturn.impl') {
    return {
      isActiveReturnOrder: (row = {}) => !['cancelled', 'canceled', 'void', 'deleted'].includes(String(row.status || row.returnStatus || '').toLowerCase()),
      returnOrderTotalAmount: (row = {}) => Number(row.amount || row.debtReduction || row.returnAmount || 0)
    };
  }
  if (request === './deliveryCommon.impl') return { masterDeliveryOrderKeys: (row = {}) => [row.id, row.code].filter(Boolean) };
  return originalLoad.call(this, request, parent, isMain);
};

const accountingCore = require('../src/services/master-order/deliveryAccountingCore.impl');

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

test('confirm accounting with real ReturnOrder calls returnArPostingService and marks ReturnOrder confirmed', async () => {
  const calls = [];
  const marked = [];
  const restoreService = patch(mockReturnArPostingService, {
    postReturnOrderToAR: async (returnOrder, options) => {
      calls.push({ returnOrder, options });
      return {
        posted: true,
        reason: 'created_ar_return',
        entry: { type: 'ar_return', code: `AR-RETURN-${returnOrder.code}`, amount: returnOrder.amount, credit: returnOrder.amount }
      };
    }
  });
  const restoreRepo = patch(mockReturnOrderRepository, {
    findByIdOrCode: async () => null,
    upsert: async (row) => { marked.push(row); return row; }
  });

  try {
    const posted = await accountingCore.postDeliveryCollectionsAfterAccountingConfirmed({
      id: 'SO-1',
      code: 'HU-1',
      customerId: 'C1',
      customerCode: 'C1',
      accountingReturnOrders: [{
        id: 'RO-1',
        code: 'RO-HU-1',
        sourceModel: 'returnOrders',
        amount: 12000,
        customerId: 'C1',
        customerCode: 'C1',
        salesOrderId: 'SO-1',
        salesOrderCode: 'HU-1',
        returnStatus: 'active'
      }]
    }, { audit: false });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].returnOrder.code, 'RO-HU-1');
    assert.equal(calls[0].returnOrder.sourceModel, 'returnOrders');
    assert.equal(calls[0].returnOrder.sourceType, 'returnOrder');
    assert.equal(calls[0].options.returnResult, true);
    assert.equal(posted.some((row) => row.type === 'ar_return'), true);
    assert.equal(marked.length, 1);
    assert.equal(marked[0].accountingConfirmed, true);
    assert.equal(marked[0].accountingStatus, 'confirmed');
  } finally {
    restoreService();
    restoreRepo();
  }
});

test('confirm accounting with salesOrder.returnAmount but no ReturnOrder does not create AR-RETURN', async () => {
  let calls = 0;
  const restoreService = patch(mockReturnArPostingService, {
    postReturnOrderToAR: async () => { calls += 1; throw new Error('must not post AR-RETURN without ReturnOrder'); }
  });

  try {
    const posted = await accountingCore.postDeliveryCollectionsAfterAccountingConfirmed({
      id: 'SO-2',
      code: 'HU-2',
      customerId: 'C2',
      customerCode: 'C2',
      returnAmount: 99000,
      accountingReturnOrders: []
    }, { audit: false });

    assert.equal(calls, 0);
    assert.deepEqual(posted, []);
  } finally {
    restoreService();
  }
});
