'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { evaluateArSatisfaction } = require('../src/services/accounting/closeout/CloseoutArSatisfaction');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Phase245 rejects entry-only AR evidence when created and alreadyExists are both false', () => {
  const result = evaluateArSatisfaction({
    expectedArLedgers: [{ idempotencyKey: 'A', orderCode: 'B0039299', category: 'AR-SALE' }],
    arPostingResults: [{
      idempotencyKey: 'A',
      created: false,
      alreadyExists: false,
      reasonCode: 'FAILED',
      entry: { _id: '123', idempotencyKey: 'A' }
    }]
  });

  assert.equal(result.arRequired, true);
  assert.equal(result.arSatisfied, false);
  assert.equal(result.arPosted, false);
  assert.equal(result.arAlreadyExists, false);
  assert.equal(result.missingIntents.length, 1);
  assert.equal(result.missingIntents[0].idempotencyKey, 'A');
  assert.equal(result.missingIntents[0].orderCode, 'B0039299');
  assert.equal(result.missingIntents[0].created, false);
  assert.equal(result.missingIntents[0].alreadyExists, false);
  assert.equal(result.missingIntents[0].reasonCode, 'FAILED');
  assert.equal(Object.prototype.hasOwnProperty.call(result.missingIntents[0], 'entry'), false);
});

test('Phase245 preserves created and alreadyExists as the only allocation AR satisfaction evidence', () => {
  const created = evaluateArSatisfaction({
    expectedArLedgers: [{ idempotencyKey: 'CREATED' }],
    arPostingResults: [{ idempotencyKey: 'CREATED', created: true, entry: { _id: '1' } }]
  });
  const alreadyExists = evaluateArSatisfaction({
    expectedArLedgers: [{ idempotencyKey: 'EXISTS' }],
    arPostingResults: [{ idempotencyKey: 'EXISTS', alreadyExists: true, entry: { _id: '2' } }]
  });
  const noop = evaluateArSatisfaction({ expectedArLedgers: [], arPostingResults: [] });
  const zeroTolerance = evaluateArSatisfaction({
    expectedArLedgers: [],
    arPostingResults: [],
    debtReconcileResult: { skippedAlreadyFixed: true, skipReason: 'NO_DEBT_DELTA', zeroToleranceApplied: true }
  });

  assert.equal(created.arSatisfied, true);
  assert.equal(created.arPosted, true);
  assert.equal(alreadyExists.arSatisfied, true);
  assert.equal(alreadyExists.arAlreadyExists, true);
  assert.equal(noop.arRequired, false);
  assert.equal(noop.arSatisfied, true);
  assert.equal(zeroTolerance.arSatisfied, true);
  assert.equal(zeroTolerance.arReasonCode, 'ZERO_TOLERANCE');
});

test('Phase245 evaluator does not query DB and does not use entry as satisfaction predicate', () => {
  const source = read('src/services/accounting/closeout/CloseoutArSatisfaction.js');

  assert.doesNotMatch(source, /ArLedger\.(find|findOne|aggregate)\s*\(/);
  assert.doesNotMatch(source, /!row\.created\s*&&\s*!row\.alreadyExists\s*&&\s*!row\.entry/);
  assert.match(source, /row\.created === true \|\| row\.alreadyExists === true/);
});
