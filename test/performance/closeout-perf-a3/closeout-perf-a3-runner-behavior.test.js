'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('CL-A3-REQ-007/009/010: flag ON builds one batch context inside transaction and injects resolved per-order details', async () => {
  const target = require.resolve('../../../src/services/accounting/closeout/CloseoutTransactionRunner');
  delete require.cache[target];
  const originalLoad = Module._load;
  const session = { id: 'SESSION-A3' };
  const state = { batchBuilds: 0, batchItems: 0, transactionCalls: 0, stages: [], confirm: [] };
  const batchItem = { identity: { orderId: 'SO1', orderCode: 'SO1', lookupKeys: ['SO1'] }, lookupKeys: ['SO1'], currentArBalance: 0 };
  Module._load = function patched(request, parent, isMain) {
    if (request === '../../../utils/transaction.util') return { withMongoTransaction: async (fn) => { state.transactionCalls += 1; return fn(session); } };
    if (request === './CloseoutCriticalReader') return { loadCriticalOrdersAndReturns: async (_orders, options) => {
      assert.equal(options.session, session);
      return { orders: [{ id: 'SO1', orderCode: 'SO1', customerCode: 'C1' }], returnOrders: [] };
    } };
    if (request === '../../master-order/masterOrderIdentity.util') return { compactDeliveryOrderKeys: (row) => [row.id, row.orderCode].filter(Boolean) };
    if (request === '../../../observability/closeoutQueryAudit') return {
      withTransactionAttempt: (fn) => fn(),
      withCloseoutAuditStage: (name, fn) => { state.stages.push(name); return fn(); },
      withCloseoutOrder: (_index, _total, fn) => fn()
    };
    if (request === '../../../config/featureFlags') return { FLAGS: { closeoutArBalanceBatchV1: () => true } };
    if (request === '../OrderPaymentDebtReconcileService') return {
      buildInitialArBalanceBatchContext: async (orders, options) => {
        state.batchBuilds += 1;
        assert.equal(options.session, session);
        assert.equal(orders.length, 1);
        return { complete: true, scopeCount: 1, rawQueryCount: 1, canonicalQueryCount: 1, byCanonicalOrderKey: new Map([['SO1', batchItem]]) };
      },
      initialArBalanceBatchItemForOrder: (context, order) => {
        state.batchItems += 1;
        assert.equal(context.complete, true);
        assert.equal(order.id, 'SO1');
        return batchItem;
      }
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const runner = require(target);
    const result = await runner.runCloseoutTransaction({
      pendingConfirmOrders: [{ id: 'SO1', orderCode: 'SO1' }], results: [],
      assertReturnOrdersInventoryReady: () => {},
      confirmOneOrder: async (_order, _returns, options) => {
        state.confirm.push(options);
        return { confirmed: true, orderId: 'SO1', readModelSyncNeeded: false };
      }
    });
    assert.equal(state.transactionCalls, 1);
    assert.equal(state.batchBuilds, 1);
    assert.equal(state.batchItems, 1);
    assert.equal(state.confirm.length, 1);
    assert.equal(state.confirm[0].session, session);
    assert.equal(state.confirm[0].initialArBalanceBatchResolved, true);
    assert.equal(state.confirm[0].initialArBalanceBatchDetails, batchItem);
    assert.ok(state.stages.includes('transaction.arBalanceBatch'));
    assert.deepEqual(result.arBalanceBatch, { enabled: true, scopeCount: 1, rawQueryCount: 1, canonicalQueryCount: 1 });
  } finally {
    Module._load = originalLoad;
    delete require.cache[target];
  }
});
