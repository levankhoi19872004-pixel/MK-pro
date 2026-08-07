'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Policy = require('../../../src/services/reports/ReportExecutionPolicy');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function tick() { return new Promise((resolve) => setImmediate(resolve)); }

test('preview query strips full/export and clamps page size', () => {
  const query = Policy.normalizePreviewQuery({ page: 2, limit: 9999, full: '1', export: '1', __exportAll: true, q: 'abc' });
  assert.equal(query.page, 2);
  assert.equal(query.limit, 200);
  assert.equal(query.q, 'abc');
  assert.equal(query.full, undefined);
  assert.equal(query.export, undefined);
  assert.equal(query.__exportAll, undefined);
  assert.equal(query.__reportPreview, true);
});

test('bounded scheduler never exceeds concurrency two and keeps result order', async () => {
  const gates = Array.from({ length: 4 }, () => deferred());
  const started = [];
  let active = 0;
  let maxActive = 0;
  const runPromise = Policy.runBounded(gates.map((gate, index) => ({
    name: `domain-${index}`,
    run: async () => {
      started.push(index);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gate.promise;
      active -= 1;
      return `result-${index}`;
    }
  })), { concurrency: 2, timeoutMs: 5000 });

  await tick();
  assert.deepEqual(started, [0, 1]);
  assert.equal(maxActive, 2);
  gates[1].resolve();
  await tick();
  assert.deepEqual(started, [0, 1, 2]);
  gates[0].resolve();
  await tick();
  assert.deepEqual(started, [0, 1, 2, 3]);
  gates[2].resolve();
  gates[3].resolve();
  const result = await runPromise;
  assert.deepEqual(result.results, ['result-0', 'result-1', 'result-2', 'result-3']);
  assert.equal(result.maxActive, 2);
});

test('partial result requires explicit allowPartial and carries warning', async () => {
  const result = await Policy.runBounded([
    { name: 'ok', run: async () => ({ rows: [1] }) },
    { name: 'broken', run: async () => { const error = new Error('broken'); error.code = 'BROKEN'; throw error; } }
  ], { concurrency: 2, allowPartial: true });
  assert.deepEqual(result.results[0], { rows: [1] });
  assert.equal(result.results[1], null);
  assert.deepEqual(result.warnings, [{ name: 'broken', code: 'BROKEN', message: 'broken' }]);
});

test('export row and byte guards fail closed', () => {
  assert.doesNotThrow(() => Policy.assertExportBudget({ rowCount: 50000, estimatedBytes: 1024 }));
  assert.throws(() => Policy.assertExportBudget({ rowCount: 50001 }), { code: 'REPORT_EXPORT_ROW_LIMIT_EXCEEDED' });
  assert.throws(() => Policy.assertExportBudget({ rowCount: 1, estimatedBytes: 65 * 1024 * 1024 }), { code: 'REPORT_EXPORT_SIZE_LIMIT_EXCEEDED' });
});
