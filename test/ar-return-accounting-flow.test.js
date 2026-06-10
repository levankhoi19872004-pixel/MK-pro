'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const masterOrderService = require('../src/services/masterOrderService');
const postingEngine = require('../src/engines/posting.engine');
const paymentRepository = require('../src/repositories/paymentRepository');

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

const arReturn = masterOrderService._internal;

test('AR-RETURN only hydrates and posts for the sales order that owns the returnOrder', async () => {
  const salesOrderA = { id: 'SO-A', code: 'HU-A', masterOrderId: 'MO-1', masterOrderCode: 'DT-1', __masterChildCount: 2 };
  const salesOrderB = { id: 'SO-B', code: 'HU-B', masterOrderId: 'MO-1', masterOrderCode: 'DT-1', __masterChildCount: 2 };
  const returnOrders = [{ id: 'RO-A', code: 'RO-HU-A', salesOrderId: 'SO-A', salesOrderCode: 'HU-A', masterOrderId: 'MO-1', amount: 25000, returnStatus: 'active' }];

  const hydratedA = arReturn.hydrateReturnOrdersForAccounting(salesOrderA, returnOrders);
  const hydratedB = arReturn.hydrateReturnOrdersForAccounting(salesOrderB, returnOrders);

  assert.equal(hydratedA.returnAmount, 25000);
  assert.equal(hydratedA.returnAmountSource, 'returnOrders_direct_salesOrder');
  assert.equal(hydratedB.returnAmountFromReturnOrders || 0, 0);
  assert.equal(hydratedB.returnAmountSource, 'returnOrders_skipped_ambiguous_master');

  const ledgers = [];
  const restorePaymentRepo = patch(paymentRepository, {
    findAll: async () => [],
    upsert: async (entry) => { ledgers.push(entry); return entry; }
  });
  try {
    for (const ro of hydratedA.accountingReturnOrders) {
      await postingEngine.postReturnOrderAR({ ...ro, amount: arReturn.returnOrderTotalAmount(ro) });
    }
    for (const ro of (hydratedB.accountingReturnOrders || [])) {
      await postingEngine.postReturnOrderAR({ ...ro, amount: arReturn.returnOrderTotalAmount(ro) });
    }
  } finally {
    restorePaymentRepo();
  }

  assert.equal(ledgers.length, 1);
  assert.equal(ledgers[0].returnOrderId, 'RO-A');
  assert.equal(ledgers[0].salesOrderId, 'SO-A');
  assert.equal(ledgers[0].credit, 25000);
});

test('master fallback is allowed only when the master has exactly one child', () => {
  const returnOrders = [{ id: 'RO-MASTER', code: 'RO-DT-1', masterOrderId: 'MO-1', masterOrderCode: 'DT-1', amount: 50000, returnStatus: 'active' }];

  const singleChild = arReturn.hydrateReturnOrdersForAccounting({ id: 'SO-1', code: 'HU-1', masterOrderId: 'MO-1', masterOrderCode: 'DT-1', __masterChildCount: 1 }, returnOrders);
  assert.equal(singleChild.returnAmount, 50000);
  assert.equal(singleChild.returnAmountSource, 'returnOrders_fallback_single_child_master');

  const multiChild = arReturn.hydrateReturnOrdersForAccounting({ id: 'SO-2', code: 'HU-2', masterOrderId: 'MO-1', masterOrderCode: 'DT-1', __masterChildCount: 2 }, returnOrders);
  assert.equal(multiChild.returnAmountFromReturnOrders, 0);
  assert.equal(multiChild.returnAmountSource, 'returnOrders_skipped_ambiguous_master');
  assert.deepEqual(multiChild.accountingReturnOrders, []);
});

test('postReturnOrderAR rejects empty, anonymous, and duplicate AR-RETURN rows', async () => {
  const ledgers = [];
  let duplicate = false;
  const restorePaymentRepo = patch(paymentRepository, {
    findAll: async () => (duplicate ? [{ type: 'ar_return', returnOrderId: 'RO-1', credit: 10000, status: 'posted' }] : []),
    upsert: async (entry) => { ledgers.push(entry); return entry; }
  });

  try {
    assert.equal(await postingEngine.postReturnOrderAR({ id: 'RO-ZERO', code: 'RO-ZERO', amount: 0 }), null);
    assert.equal(await postingEngine.postReturnOrderAR({ amount: 10000 }), null);

    const first = await postingEngine.postReturnOrderAR({ id: 'RO-1', code: 'RO-1', salesOrderId: 'SO-1', salesOrderCode: 'HU-1', masterOrderId: 'MO-1', masterOrderCode: 'DT-1', customerId: 'C1', customerCode: 'C1', amount: 10000 });
    assert.ok(first);
    duplicate = true;
    const second = await postingEngine.postReturnOrderAR({ id: 'RO-1', code: 'RO-1', salesOrderId: 'SO-1', salesOrderCode: 'HU-1', amount: 10000 });
    assert.equal(second, null);
  } finally {
    restorePaymentRepo();
  }

  assert.equal(ledgers.length, 1);
  assert.equal(ledgers[0].returnOrderId, 'RO-1');
  assert.equal(ledgers[0].returnOrderCode, 'RO-1');
  assert.equal(ledgers[0].salesOrderId, 'SO-1');
  assert.equal(ledgers[0].salesOrderCode, 'HU-1');
  assert.equal(ledgers[0].masterOrderId, 'MO-1');
  assert.equal(ledgers[0].masterOrderCode, 'DT-1');
  assert.equal(ledgers[0].accountingConfirmed, true);
  assert.equal(ledgers[0].accountingStatus, 'confirmed');
  assert.equal(ledgers[0].debit, 0);
  assert.equal(ledgers[0].credit, 10000);
});


test('findReturnOrdersForDeliveryChildren matches DeliveryEngine returnOrders by RO-prefixed code', async () => {
  const returnOrderRepository = require('../src/repositories/returnOrderRepository');
  const calls = [];
  const savedReturnOrder = {
    id: 'RO-HU90203654',
    code: 'RO-HU90203654',
    orderId: 'SO1781043625381231',
    orderCode: 'HU90203654',
    salesOrderCode: 'HU90203654',
    amount: 338635,
    debtReduction: 338635,
    returnStatus: 'active',
    accountingConfirmed: false,
    accountingStatus: 'pending'
  };

  const restoreRepo = patch(returnOrderRepository, {
    collectionName: () => 'returnOrders',
    findAll: async (filter) => {
      calls.push(filter);
      const encoded = JSON.stringify(filter);
      if (encoded.includes('RO-HU90203654') || encoded.includes('HU90203654') || encoded.includes('SO1781043625381231')) return [savedReturnOrder];
      return [];
    }
  });

  try {
    const rows = await arReturn.findReturnOrdersForDeliveryChildren([{
      id: 'SO1781043625381231',
      code: 'HU90203654',
      deliveryDate: '2026-06-10',
      deliveryStaffCode: 'ghth'
    }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].code, 'RO-HU90203654');
    assert.equal(rows[0].amount, 338635);
    assert.ok(JSON.stringify(calls[0]).includes('RO-HU90203654'));
  } finally {
    restoreRepo();
  }
});
