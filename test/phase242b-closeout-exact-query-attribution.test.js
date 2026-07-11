'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const closeoutQueryAudit = require('../src/observability/closeoutQueryAudit');
const apiMonitor = require('../src/middlewares/apiMonitor.middleware');
const { runWithRequestContext } = require('../src/observability/requestContext');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function mockReq(requestId = 'req-phase242b-0001') {
  return {
    method: 'POST',
    originalUrl: '/api/new/delivery-today/closeout',
    requestId
  };
}

function mockRes() {
  return { statusCode: 200 };
}

async function withEnv(nextEnv, fn) {
  const previous = {};
  for (const key of Object.keys(nextEnv)) {
    previous[key] = process.env[key];
    process.env[key] = nextEnv[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(nextEnv)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function emitQuery(overrides = {}) {
  apiMonitor._private.notifyMongoQueryObservers({
    timestamp: '2026-07-11T00:00:00.000Z',
    model: overrides.model || 'SalesOrder',
    collection: overrides.collection || 'salesOrders',
    operation: overrides.operation || 'find',
    durationMs: overrides.durationMs ?? 5,
    rows: overrides.rows ?? 1,
    hasSession: overrides.hasSession ?? true,
    queryShape: overrides.queryShape || 'SalesOrder.find fields=[id,status]',
    error: overrides.error || ''
  });
}

test('Phase242B audit config is disabled by default and invalid env falls back false', () => {
  assert.equal(closeoutQueryAudit.isEnabled({}), false);
  assert.equal(closeoutQueryAudit.isEnabled({ CLOSEOUT_QUERY_AUDIT_ENABLED: 'wat' }), false);
  assert.equal(closeoutQueryAudit.isEnabled({ CLOSEOUT_QUERY_AUDIT_ENABLED: 'false' }), false);
  assert.equal(closeoutQueryAudit.isEnabled({ CLOSEOUT_QUERY_AUDIT_ENABLED: 'true' }), true);
});

test('Phase242B disabled mode is no-op and stage wrapper preserves value/errors', async () => {
  closeoutQueryAudit.resetForTests();
  let calls = 0;
  const value = await closeoutQueryAudit.withCloseoutAuditRequest(mockReq(), mockRes(), async () => {
    calls += 1;
    return 'done';
  }, { CLOSEOUT_QUERY_AUDIT_ENABLED: 'false' });
  assert.equal(value, 'done');
  assert.equal(calls, 1);
  assert.deepEqual(closeoutQueryAudit.snapshot(), []);

  const returned = closeoutQueryAudit.withCloseoutAuditStage('x', () => {
    calls += 1;
    return 7;
  }, { CLOSEOUT_QUERY_AUDIT_ENABLED: 'false' });
  assert.equal(returned, 7);
  assert.equal(calls, 2);
  assert.throws(() => closeoutQueryAudit.withCloseoutAuditStage('x', () => {
    throw new Error('same-error');
  }, { CLOSEOUT_QUERY_AUDIT_ENABLED: 'false' }), /same-error/);
});

test('Phase242B query outside closeout request is not counted', async () => {
  await withEnv({ CLOSEOUT_QUERY_AUDIT_ENABLED: 'true' }, async () => {
    closeoutQueryAudit.resetForTests();
    await runWithRequestContext({ requestId: 'outside-0001', method: 'GET', route: '/api/system/status' }, async () => {
      emitQuery({ model: 'SystemSetting', operation: 'find' });
    });
    assert.deepEqual(closeoutQueryAudit.snapshot(), []);
  });
});

test('Phase242B query inside closeout is attributed exactly once and cross-checked with API Monitor', async () => {
  await withEnv({ CLOSEOUT_QUERY_AUDIT_ENABLED: 'true' }, async () => {
    closeoutQueryAudit.resetForTests();
    await runWithRequestContext({ requestId: 'inside-0001', method: 'POST', route: '/api/new/delivery-today/closeout' }, async () => {
      await closeoutQueryAudit.withCloseoutAuditRequest(mockReq('inside-0001'), mockRes(), async () => {
        closeoutQueryAudit.updateCardinality({ selectedOrderCount: 1, pendingOrderCount: 1, criticalOrderCount: 1 });
        await closeoutQueryAudit.withCloseoutAuditStage('request.preflight.orders', async () => {
          emitQuery({ model: 'SalesOrder', operation: 'find', durationMs: 11 });
        });
        closeoutQueryAudit.recordApiMonitorSnapshot({ dbQueries: 1, mongoMs: 11 });
        return { ok: true };
      });
    });
    const summary = closeoutQueryAudit.snapshot()[0];
    assert.equal(summary.queryTotals.totalMongoQueries, 1);
    assert.equal(summary.queryTotals.apiMonitorDbQueries, 1);
    assert.equal(summary.queryTotals.attributionCoverage, 1);
    assert.equal(summary.operationSummary[0].stage, 'request.preflight.orders');
  });
});

test('Phase242B nested stages restore parent stage and concurrent contexts do not mix', async () => {
  await withEnv({ CLOSEOUT_QUERY_AUDIT_ENABLED: 'true' }, async () => {
    closeoutQueryAudit.resetForTests();
    await Promise.all(['A', 'B'].map((suffix) => runWithRequestContext({
      requestId: `concurrent-${suffix}-0001`,
      method: 'POST',
      route: '/api/new/delivery-today/closeout'
    }, async () => {
      await closeoutQueryAudit.withCloseoutAuditRequest(mockReq(`concurrent-${suffix}-0001`), mockRes(), async () => {
        await closeoutQueryAudit.withCloseoutAuditStage(`outer.${suffix}`, async () => {
          await closeoutQueryAudit.withCloseoutAuditStage(`inner.${suffix}`, async () => {
            emitQuery({ model: `Model${suffix}`, operation: 'find' });
          });
          emitQuery({ model: `Parent${suffix}`, operation: 'find' });
        });
        closeoutQueryAudit.recordApiMonitorSnapshot({ dbQueries: 2, mongoMs: 10 });
      });
    })));
    const rows = closeoutQueryAudit.snapshot();
    assert.equal(rows.length, 2);
    for (const row of rows) {
      const stages = row.operationSummary.map((item) => item.stage);
      assert(stages.some((stage) => stage.startsWith('inner.')));
      assert(stages.some((stage) => stage.startsWith('outer.')));
      assert.equal(new Set(row.operationSummary.map((item) => item.model)).size, 2);
    }
  });
});

test('Phase242B transaction attempts and retry queries are separated', async () => {
  await withEnv({ CLOSEOUT_QUERY_AUDIT_ENABLED: 'true' }, async () => {
    closeoutQueryAudit.resetForTests();
    await runWithRequestContext({ requestId: 'retry-0001', method: 'POST', route: '/api/new/delivery-today/closeout' }, async () => {
      await closeoutQueryAudit.withCloseoutAuditRequest(mockReq('retry-0001'), mockRes(), async () => {
        await closeoutQueryAudit.withTransactionAttempt(async () => {
          await closeoutQueryAudit.withCloseoutAuditStage('transaction.critical.orders', async () => emitQuery({ transactionAttempt: 1 }));
        });
        await closeoutQueryAudit.withTransactionAttempt(async () => {
          await closeoutQueryAudit.withCloseoutAuditStage('transaction.critical.orders', async () => emitQuery({ transactionAttempt: 2 }));
        });
        closeoutQueryAudit.recordApiMonitorSnapshot({ dbQueries: 2, mongoMs: 10 });
      });
    });
    const summary = closeoutQueryAudit.snapshot()[0];
    assert.equal(summary.transaction.transactionAttemptCount, 2);
    assert.equal(summary.transaction.transactionRetryCount, 1);
    assert.deepEqual(summary.operationSummary.map((item) => item.transactionAttempt).sort(), [1, 2]);
  });
});

test('Phase242B cardinality and multipliers are deterministic', async () => {
  await withEnv({ CLOSEOUT_QUERY_AUDIT_ENABLED: 'true' }, async () => {
    closeoutQueryAudit.resetForTests();
    await runWithRequestContext({ requestId: 'cardinality-0001', method: 'POST', route: '/api/new/delivery-today/closeout' }, async () => {
      await closeoutQueryAudit.withCloseoutAuditRequest(mockReq('cardinality-0001'), mockRes(), async () => {
        closeoutQueryAudit.updateCardinality({
          selectedOrderCount: 5,
          pendingOrderCount: 4,
          criticalOrderCount: 4,
          returnOrderCount: 2
        });
        for (let i = 0; i < 80; i += 1) emitQuery({ model: 'ArLedger', operation: 'find', durationMs: 1 });
        closeoutQueryAudit.recordApiMonitorSnapshot({ dbQueries: 80, mongoMs: 80 });
      });
    });
    const summary = closeoutQueryAudit.snapshot()[0];
    assert.equal(summary.queryTotals.totalMongoQueries, 80);
    assert.equal(summary.multipliers.queriesPerSelectedOrder, 16);
    assert.equal(summary.multipliers.queriesPerPendingOrder, 20);
    assert.equal(summary.multipliers.queriesPerCriticalOrder, 20);
  });
});

test('Phase242B history and raw event history are bounded while aggregate count remains exact', async () => {
  await withEnv({
    CLOSEOUT_QUERY_AUDIT_ENABLED: 'true',
    CLOSEOUT_QUERY_AUDIT_HISTORY_LIMIT: '2',
    CLOSEOUT_QUERY_AUDIT_MAX_EVENTS: '3'
  }, async () => {
    closeoutQueryAudit.resetForTests();
    for (let run = 0; run < 3; run += 1) {
      await runWithRequestContext({ requestId: `bounded-${run}-0001`, method: 'POST', route: '/api/new/delivery-today/closeout' }, async () => {
        await closeoutQueryAudit.withCloseoutAuditRequest(mockReq(`bounded-${run}-0001`), mockRes(), async () => {
          for (let i = 0; i < 10; i += 1) emitQuery({ model: 'ArLedger', operation: 'find', durationMs: 1 });
          closeoutQueryAudit.recordApiMonitorSnapshot({ dbQueries: 10, mongoMs: 10 });
        });
      });
    }
    const rows = closeoutQueryAudit.snapshot();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].queryTotals.totalMongoQueries, 10);
    assert.equal(rows[0].rawEvents.length, 3);
    assert.equal(rows[0].queryTotals.rawEventsTruncated, true);
  });
});

test('Phase242B export is sanitized and includes evidence metadata', async () => {
  await withEnv({ CLOSEOUT_QUERY_AUDIT_ENABLED: 'true' }, async () => {
    closeoutQueryAudit.resetForTests();
    await runWithRequestContext({ requestId: 'privacy-0001', method: 'POST', route: '/api/new/delivery-today/closeout' }, async () => {
      await closeoutQueryAudit.withCloseoutAuditRequest(mockReq('privacy-0001'), mockRes(), async () => {
        emitQuery({
          model: 'SalesOrder',
          operation: 'find',
          queryShape: 'SalesOrder.find fields=[orderCode,Authorization,Cookie,mongoUri] value=B0039999 bearer token Cookie=session mongodb://user:pass@host/db'
        });
        closeoutQueryAudit.recordApiMonitorSnapshot({ dbQueries: 1, mongoMs: 1 });
      });
    });
    const exported = closeoutQueryAudit.exportAudit(closeoutQueryAudit.snapshot()[0].auditId);
    const serialized = `${JSON.stringify(exported.data)}\n${exported.markdown}`;
    assert.match(serialized, /releaseId/);
    assert.match(serialized, /environment/);
    assert.match(serialized, /attributionCoverage/);
    assert.doesNotMatch(serialized, /B0039999/);
    assert.doesNotMatch(serialized, /bearer token/i);
    assert.doesNotMatch(serialized, /Cookie=session/i);
    assert.doesNotMatch(serialized, /mongodb:\/\/user:pass/i);
  });
});

test('Phase242B clear only clears closeout audit history and does not clear API monitor state', () => {
  closeoutQueryAudit.resetForTests();
  apiMonitor.apiStats.set('GET /api/test', { count: 1 });
  const result = closeoutQueryAudit.clearHistory();
  assert.equal(result.ok, true);
  assert.equal(apiMonitor.apiStats.has('GET /api/test'), true);
  apiMonitor.apiStats.delete('GET /api/test');
});

test('Phase242B system API routes are protected and do not expose a closeout runner', () => {
  const routes = read('src/routes/systemRoutes.js');
  assert.match(routes, /\/system\/closeout-query-audit'.*requireRole\(\['admin', 'manager'\]/);
  assert.match(routes, /\/system\/closeout-query-audit\/:auditId\/export'.*requireRole\(\['admin', 'manager'\]/);
  assert.match(routes, /\/system\/closeout-query-audit\/clear'.*requireRole\(\['admin'\]/);
  assert.doesNotMatch(routes, /runCloseout|replayCloseout|benchmarkCloseout/i);
});

test('Phase242B reuses API Monitor observer and does not add a second Mongoose patch', () => {
  const monitorSource = read('src/middlewares/apiMonitor.middleware.js');
  const auditSource = read('src/observability/closeoutQueryAudit.js');
  assert.match(monitorSource, /registerMongoQueryObserver/);
  assert.match(monitorSource, /closeoutQueryAudit\.observeMongoQueryEvent/);
  assert.doesNotMatch(auditSource, /mongoose\.Query\.prototype\.exec\s*=/);
  assert.doesNotMatch(auditSource, /mongoose\.Aggregate\.prototype\.exec\s*=/);
});
