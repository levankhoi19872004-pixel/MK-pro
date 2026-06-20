'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const BackgroundJobService = require('../src/services/background-jobs/BackgroundJobService');
const importSessionService = require('../src/services/importSessionService');
const JobSubmissionService = require('../src/services/background-jobs/JobSubmissionService');

test('duplicate export requests in the idempotency window use the same backend key', async () => {
  const originalEnqueue = BackgroundJobService.enqueue;
  const calls = [];
  BackgroundJobService.enqueue = async (input) => {
    calls.push(input);
    return { created: calls.length === 1, job: { id: 'JOB1' } };
  };
  try {
    const input = {
      type: 'invoice-orders',
      query: { invoiceType: 'VAT', dateFrom: '2026-06-01', dateTo: '2026-06-20', async: '1' },
      user: { id: 'U1', tenantId: 'TENANT1' }
    };
    await JobSubmissionService.submitExport(input);
    await JobSubmissionService.submitExport(input);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
    assert.equal(calls[0].payload.query.async, undefined);
  } finally {
    BackgroundJobService.enqueue = originalEnqueue;
  }
});

test('import commit job stores identifiers instead of duplicating preview rows in the queue document', async () => {
  const originalEnqueue = BackgroundJobService.enqueue;
  const originalGetSession = importSessionService.getSession;
  let captured;
  importSessionService.getSession = async () => ({ id: 'IMP1', sessionId: 'IMP1', type: 'salesOrders', status: 'preview_ready' });
  BackgroundJobService.enqueue = async (input) => {
    captured = input;
    return { created: true, job: { id: 'JOB2' } };
  };
  try {
    await JobSubmissionService.submitImportCommit({
      sessionId: 'IMP1',
      type: 'salesOrders',
      rows: Array.from({ length: 1000 }, (_, index) => ({ index, large: 'x'.repeat(1000) })),
      selectedOrderCodes: ['SO1']
    }, { username: 'admin' });
    assert.equal(captured.type, 'import_commit');
    assert.equal(Object.prototype.hasOwnProperty.call(captured.payload, 'rows'), false);
    assert.deepEqual(captured.payload.selectedOrderCodes, ['SO1']);
    assert.equal(captured.maxAttempts, 1);
  } finally {
    BackgroundJobService.enqueue = originalEnqueue;
    importSessionService.getSession = originalGetSession;
  }
});

test('manual reconciliation duplicates in one window reuse a deterministic idempotency key', async () => {
  const originalEnqueue = BackgroundJobService.enqueue;
  const calls = [];
  BackgroundJobService.enqueue = async (input) => {
    calls.push(input);
    return { created: calls.length === 1, job: { id: 'RECON1' } };
  };
  try {
    const input = { type: 'all', source: 'manual_api', checkedBy: 'admin', actor: { id: 'U1', tenantId: 'TENANT1' } };
    await JobSubmissionService.submitReconciliation(input);
    await JobSubmissionService.submitReconciliation(input);
    assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
    assert.equal(calls[0].maxAttempts, 1);
  } finally {
    BackgroundJobService.enqueue = originalEnqueue;
  }
});
