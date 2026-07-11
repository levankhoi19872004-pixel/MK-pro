'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const closeoutQueryAudit = require('../src/observability/closeoutQueryAudit');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Phase242A audit is disabled by default and performs no Mongo query work', () => {
  assert.equal(closeoutQueryAudit.isEnabled({}), false);
  assert.equal(closeoutQueryAudit.isEnabled({ CLOSEOUT_QUERY_AUDIT_ENABLED: 'false' }), false);
  assert.equal(closeoutQueryAudit.isEnabled({ CLOSEOUT_QUERY_AUDIT_ENABLED: 'true' }), true);

  const source = read('src/observability/closeoutQueryAudit.js');
  assert.equal(/require\(['"]mongoose['"]\)/.test(source), false);
  assert.equal(/\.find(?:One)?\s*\(/.test(source), false);
  assert.equal(/updateOne\s*\(/.test(source), false);
  assert.equal(/aggregate\s*\(/.test(source), false);
});

test('Phase242A stage wrapper preserves call count, return value, async value, and errors', async () => {
  closeoutQueryAudit.resetForTests();
  let calls = 0;
  const disabledResult = closeoutQueryAudit.withCloseoutAuditStage('disabled', () => {
    calls += 1;
    return 42;
  }, {});
  assert.equal(disabledResult, 42);
  assert.equal(calls, 1);
  assert.deepEqual(closeoutQueryAudit.snapshot(), []);

  const asyncResult = await closeoutQueryAudit.withCloseoutAuditStage('enabled-async', async () => {
    calls += 1;
    return 'ok';
  }, { CLOSEOUT_QUERY_AUDIT_ENABLED: 'true' });
  assert.equal(asyncResult, 'ok');
  assert.equal(calls, 2);

  const err = new Error('boom');
  err.code = 'EXPECTED';
  assert.throws(() => closeoutQueryAudit.withCloseoutAuditStage('enabled-error', () => {
    calls += 1;
    throw err;
  }, { CLOSEOUT_QUERY_AUDIT_ENABLED: 'true' }), /boom/);
  assert.equal(calls, 3);
});

test('Phase242A query fingerprint keeps shape and redacts private/value data', () => {
  const fingerprint = closeoutQueryAudit.queryFingerprint({
    model: 'salesOrders',
    operation: 'find',
    filter: {
      orderCode: 'SO-SECRET-001',
      customerName: 'Private Customer',
      Authorization: 'Bearer secret',
      nested: { phone: '0900000000', status: 'confirmed' }
    },
    projection: { id: 1, customerAddress: 1 },
    sort: { createdAt: -1 },
    pipeline: [{ $match: { token: 'secret' } }, { $group: { _id: '$customerCode' } }],
    session: {}
  });

  const serialized = JSON.stringify(fingerprint);
  assert.match(serialized, /salesOrders/);
  assert.match(serialized, /orderCode/);
  assert.match(serialized, /\[redacted-field\]/);
  assert.doesNotMatch(serialized, /SO-SECRET-001/);
  assert.doesNotMatch(serialized, /Private Customer/);
  assert.doesNotMatch(serialized, /Bearer secret/);
  assert.doesNotMatch(serialized, /0900000000/);
  assert.equal(fingerprint.hasSession, true);
});

test('Phase242A audit history is bounded', () => {
  closeoutQueryAudit.resetForTests();
  const env = {
    CLOSEOUT_QUERY_AUDIT_ENABLED: 'true',
    CLOSEOUT_QUERY_AUDIT_HISTORY_LIMIT: '3'
  };
  for (let i = 0; i < 10; i += 1) {
    closeoutQueryAudit.recordQuery({ model: 'arLedgers', operation: 'find', filter: { idempotencyKey: `key-${i}` } }, env);
  }
  const snapshot = closeoutQueryAudit.snapshot();
  assert.equal(snapshot.length, 3);
  assert(snapshot.every((row) => row.type === 'query'));
});

test('Phase242A writer map is cloned and cannot mutate runtime safety data', () => {
  const first = closeoutQueryAudit.writerSafetyMap();
  first.writers[0].model = 'mutated';
  first.freshReads.push({ model: 'mutated' });

  const second = closeoutQueryAudit.writerSafetyMap();
  assert.equal(second.writers[0].model, 'salesOrders');
  assert.equal(second.freshReads.some((row) => row.model === 'mutated'), false);
});

test('Phase242A route/service contract remains closeout command path', () => {
  const routeSource = read('src/routes/newOperationsRoutes.js');
  assert.match(routeSource, /router\.post\('\/delivery-today\/closeout', requireAuth, closeoutRoles/);
  assert.match(routeSource, /AccountingCloseoutService\.confirmDeliveryAccounting/);
  assert.match(routeSource, /canonicalRoute: '\/api\/new\/delivery-today\/closeout'/);

  const serviceSource = read('src/services/accounting/AccountingCloseoutService.js');
  assert.match(serviceSource, /CloseoutTransactionRunner\.runCloseoutTransaction/);
  assert.match(serviceSource, /OrderPaymentAllocationService\.buildAndPostFromCloseout/);
  assert.match(serviceSource, /OrderPaymentDebtReconcileService\.reconcileOrderDebt/);
});

test('Phase242A report artifacts exist and declare audit-only partial graph', () => {
  const json = JSON.parse(read('reports/performance/phase242a-closeout-query-graph.json'));
  assert.equal(json.phase, '242A');
  assert.equal(json.auditOnly, true);
  assert.equal(json.status, 'PARTIAL_QUERY_GRAPH');
  assert.equal(json.baseline.avgQueryCountPerRequest, 157);
  assert.equal(json.phase242AChanges.businessLogicChanged, false);
  assert.equal(json.phase242AChanges.schemaOrIndexChanged, false);

  const report = read('PHASE242A_DELIVERY_CLOSEOUT_QUERY_GRAPH_AUDIT_REPORT.md');
  assert.match(report, /Phase242A changed no business behavior/);
  assert.match(report, /No Mongo schema or index change/);
});
