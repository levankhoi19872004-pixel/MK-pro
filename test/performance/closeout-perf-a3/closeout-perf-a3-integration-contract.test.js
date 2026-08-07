'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

test('CL-A3-REQ-007/009: transaction runner builds batch context inside transaction and injects per-order context', () => {
  const source = read('src/services/accounting/closeout/CloseoutTransactionRunner.js');
  assert.match(source, /PERF_CLOSEOUT_AR_BALANCE_BATCH_V1|closeoutArBalanceBatchV1/);
  assert.match(source, /transaction\.arBalanceBatch/);
  assert.match(source, /prefetchedArBalanceDetails|initialArBalanceBatch/);
});

test('CL-A3-REQ-008: safety and after-write reads remain in reconcile service', () => {
  const source = read('src/services/accounting/OrderPaymentDebtReconcileService.js');
  assert.match(source, /order\.debt\.safetyBalance/);
  assert.match(source, /order\.debt\.prePostIdempotency/);
  assert.match(source, /order\.debt\.afterBalance/);
});

test('CL-A3-REQ-014: audit raw event exposes stage, hasSession, orderIndex, duration, collection, operation and fingerprint', () => {
  const source = read('src/observability/closeoutQueryAudit.js');
  for (const token of ['stage:', 'hasSession:', 'orderIndex:', 'durationMs:', 'collection:', 'operation:', 'fingerprint:']) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('CL-A3-REQ-015: AuditLog.create is outside Query/Aggregate exec counter and has isolated non-query timing observability', () => {
  const monitor = read('src/middlewares/apiMonitor.middleware.js');
  const auditService = read('src/services/auditService.js');
  const audit = read('src/observability/closeoutQueryAudit.js');
  assert.match(monitor, /patchExec\(mongoose\.Query && mongoose\.Query\.prototype\)/);
  assert.match(monitor, /patchExec\(mongoose\.Aggregate && mongoose\.Aggregate\.prototype\)/);
  assert.doesNotMatch(monitor, /patchExec\(mongoose\.Model/);
  assert.match(auditService, /AuditLog\.create\(entry\)/);
  assert.match(auditService, /observeNonQueryMongoOrModelWrite/);
  assert.match(audit, /nonQueryMongoOrModelWriteMs/);
});
