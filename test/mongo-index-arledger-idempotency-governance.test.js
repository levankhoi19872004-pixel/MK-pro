'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  INDEX_DEFINITIONS,
  buildManagedIndexPlan,
  sameIndexKey
} = require('../src/services/mongoIndexService');

function indexes(collection) {
  return INDEX_DEFINITIONS[collection] || [];
}

test('arLedgers keeps one managed idempotencyKey index with legacy production name', () => {
  const defs = indexes('arLedgers').filter(([fields]) => sameIndexKey(fields, { idempotencyKey: 1 }));

  assert.equal(defs.length, 1, 'arLedgers must not declare duplicate idempotencyKey indexes');
  assert.equal(defs[0][1].name, 'idx_arledger_idempotencyKey');
  assert.equal(defs[0][1].unique, undefined, 'do not upgrade arLedgers idempotencyKey to unique in startup');
  assert.equal(defs[0][1].sparse, undefined, 'keep existing production-compatible non-sparse lookup index');
});

test('managed index plan builds without arLedgers idempotency conflict', () => {
  assert.doesNotThrow(() => buildManagedIndexPlan());

  const plan = buildManagedIndexPlan().find((item) => item.collectionName === 'arLedgers');
  assert.ok(plan, 'arLedgers plan missing');

  const defs = plan.definitions.filter(([fields]) => sameIndexKey(fields, { idempotencyKey: 1 }));
  assert.equal(defs.length, 1, 'physical arLedgers collection must have one idempotencyKey managed definition');
  assert.equal(defs[0][1].name, 'idx_arledger_idempotencyKey');
});

test('readModelSyncJobs owns its separate unique idempotency index', () => {
  const defs = indexes('readModelSyncJobs');
  const names = new Set(defs.map(([, options]) => options.name));

  assert.equal(names.has('uniq_read_model_sync_jobs_idempotency_key'), true);
  assert.equal(defs.some(([fields]) => sameIndexKey(fields, { status: 1, nextRunAt: 1, createdAt: 1 })), true);
  assert.equal(names.has('idx_read_model_sync_jobs_customer_status'), true);
  assert.equal(names.has('idx_read_model_sync_jobs_type_status_created'), true);

  const idempotency = defs.find(([, options]) => options.name === 'uniq_read_model_sync_jobs_idempotency_key');
  assert.ok(idempotency, 'readModelSyncJobs idempotency index missing');
  assert.deepEqual(idempotency[0], { idempotencyKey: 1 });
  assert.equal(idempotency[1].unique, true);
  assert.equal(idempotency[1].sparse, true);
});
