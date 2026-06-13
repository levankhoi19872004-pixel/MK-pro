'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const job = require('../src/jobs/reconciliationJob');

test('reconciliation is enabled by default, rate-limited and exposes bounded state', () => {
  const previous = process.env.AUTO_RECONCILIATION_JOB;
  const previousInterval = process.env.RECONCILIATION_INTERVAL_MS;
  delete process.env.AUTO_RECONCILIATION_JOB;
  process.env.RECONCILIATION_INTERVAL_MS = '1';
  try {
    assert.equal(job.intervalMs(), 5 * 60 * 1000);
    const started = job.startReconciliationJob();
    assert.equal(started.started, true);
    const state = job.getReconciliationJobState();
    assert.equal(state.enabled, true);
    assert.equal(state.intervalMs, 5 * 60 * 1000);
    assert.equal(typeof state.lastError, 'string');
  } finally {
    job.stopReconciliationJob();
    if (previous === undefined) delete process.env.AUTO_RECONCILIATION_JOB;
    else process.env.AUTO_RECONCILIATION_JOB = previous;
    if (previousInterval === undefined) delete process.env.RECONCILIATION_INTERVAL_MS;
    else process.env.RECONCILIATION_INTERVAL_MS = previousInterval;
  }
});

test('system status exposes reconciliation health without loading report items', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/systemService.js'), 'utf8');
  assert.match(source, /reconciliation: getReconciliationJobState\(\)/);
  assert.doesNotMatch(source, /listReports\(/);
});
