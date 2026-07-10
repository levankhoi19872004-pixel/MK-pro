'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

const returnOrderRepository = require('../src/repositories/returnOrderRepository');
const { findReturnOrdersForDeliveryChildren } = require('../src/services/master-order/masterOrderReturn.impl');
const CloseoutCriticalReader = require('../src/services/accounting/closeout/CloseoutCriticalReader');
const CloseoutTransactionRunner = require('../src/services/accounting/closeout/CloseoutTransactionRunner');
const CloseoutPostCommitHandler = require('../src/services/accounting/closeout/CloseoutPostCommitHandler');
const readModelSyncJobService = require('../src/services/readModelSyncJob.service');

function patch(object, replacements) {
  const old = {};
  for (const [key, value] of Object.entries(replacements)) {
    old[key] = object[key];
    object[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(old)) object[key] = value;
  };
}

test('Phase238 returnOrders critical reader preserves Mongo session', async () => {
  const session = { id: 'S238' };
  const seenSessions = [];
  const restore = patch(returnOrderRepository, {
    findAll: async (_query, options = {}) => {
      seenSessions.push(options.session);
      return [{ id: 'RO1', orderId: 'SO1', returnStatus: 'active', inventoryPosted: true }];
    }
  });

  try {
    const rows = await findReturnOrdersForDeliveryChildren([{ id: 'SO1', code: 'B001' }], { session });
    assert.equal(rows.length, 1);
    assert.ok(seenSessions.length >= 1);
    assert.ok(seenSessions.every((value) => value === session));
  } finally {
    restore();
  }
});

test('Phase238 transaction runner re-reads order and returnOrders inside transaction before writing', async () => {
  const txSession = {
    async withTransaction(work) { return work(); },
    async endSession() {}
  };
  const calls = [];
  const restoreMongoose = patch(mongoose, { startSession: async () => txSession });
  const restoreCritical = patch(CloseoutCriticalReader, {
    loadCriticalOrdersAndReturns: async (orders, options = {}) => {
      calls.push({ stage: 'critical-read', orderCount: orders.length, session: options.session });
      return {
        orders: [{ ...orders[0], id: 'SO1-CRITICAL', accountingConfirmed: false }],
        returnOrders: []
      };
    }
  });

  try {
    const results = [];
    const output = await CloseoutTransactionRunner.runCloseoutTransaction({
      pendingConfirmOrders: [{ id: 'SO1' }],
      results,
      assertReturnOrdersInventoryReady: (returnOrders) => {
        calls.push({ stage: 'return-guard', count: returnOrders.length });
      },
      confirmOneOrder: async (order, returnOrders, options = {}) => {
        calls.push({ stage: 'write', orderId: order.id, returnCount: returnOrders.length, session: options.session });
        return {
          confirmed: true,
          readModelSyncNeeded: true,
          affectedCustomerCode: 'C001',
          affectedSourceId: order.id
        };
      }
    });

    assert.deepEqual(calls.map((row) => row.stage), ['critical-read', 'return-guard', 'write']);
    assert.equal(calls[0].session, txSession);
    assert.equal(calls[2].session, txSession);
    assert.equal(calls[2].orderId, 'SO1-CRITICAL');
    assert.deepEqual(output.syncGroups, [{ customerCode: 'C001', sourceIds: ['SO1-CRITICAL'] }]);
  } finally {
    restoreCritical();
    restoreMongoose();
  }
});

test('Phase238 read-model sync enqueue is post-commit and does not receive transaction session', async () => {
  const calls = [];
  const restore = patch(readModelSyncJobService, {
    enqueueArDebtSyncJobs: async (payload, options = {}) => {
      calls.push({ payload, options });
      return {
        queued: 1,
        jobs: [{ id: 'JOB1', idempotencyKey: 'IDEM1', customerCode: payload.customerCode, sourceIds: payload.sourceIds }]
      };
    },
    scheduleDrain: () => ({ scheduled: true })
  });

  try {
    const result = await CloseoutPostCommitHandler.enqueueReadModelSync([
      { customerCode: 'C001', sourceIds: ['SO1'] }
    ], { actor: 'KT', reason: 'closeout', source: 'DELIVERY_CLOSEOUT' });

    assert.equal(result.queued, 1);
    assert.equal(result.status, 'pending');
    assert.equal(result.mode, 'post_commit_queued');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.session, undefined);
  } finally {
    restore();
  }
});
