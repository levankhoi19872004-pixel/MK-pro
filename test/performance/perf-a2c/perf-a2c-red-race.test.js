'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { NaiveLedgerRepository } = require('./deterministic-race-repository');

test('RED: two workers can both pass application pre-check and create duplicate ledgers', async () => {
  const repository = new NaiveLedgerRepository();
  const entry = {
    idempotencyKey: 'AR-DEBT-ADJUSTMENT:RACE:ORDER-1:1000:v1',
    account: 'AR',
    category: 'AR-DEBT-ADJUSTMENT',
    debit: 1000,
    credit: 0
  };

  await Promise.all([
    repository.postWithPrecheck(entry),
    repository.postWithPrecheck(entry)
  ]);

  assert.equal(repository.rows.length, 2);
  assert.equal(new Set(repository.rows.map((row) => row.idempotencyKey)).size, 1);
});

test('RED contract: central posting service must expose hardened idempotency helpers', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../src/services/arPosting.service.js'), 'utf8');
  assert.match(source, /normalizeIdempotencyKey/);
  assert.match(source, /AR_LEDGER_IDEMPOTENCY_PAYLOAD_CONFLICT/);
  assert.match(source, /isMongoDuplicateKeyError/);
});
