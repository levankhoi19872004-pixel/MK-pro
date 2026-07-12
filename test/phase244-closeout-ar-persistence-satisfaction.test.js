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

test('Phase244 AR satisfaction accepts newly posted AR evidence', () => {
  const result = evaluateArSatisfaction({
    expectedArLedgers: [{ idempotencyKey: 'OPA:1:AR-SALE', category: 'AR-SALE', debit: 1000 }],
    arPostingResults: [{ idempotencyKey: 'OPA:1:AR-SALE', created: true, entry: { id: 'AR1', idempotencyKey: 'OPA:1:AR-SALE' } }],
    debtReconcileResult: { skippedAlreadyFixed: true, skipReason: 'NO_DEBT_DELTA' }
  });

  assert.equal(result.arRequired, true);
  assert.equal(result.arSatisfied, true);
  assert.equal(result.arPosted, true);
  assert.equal(result.arAlreadyExists, false);
  assert.equal(result.arReasonCode, 'POSTED');
  assert.deepEqual(result.missingIntents, []);
});

test('Phase244 AR satisfaction accepts idempotent existing AR evidence without repost', () => {
  const result = evaluateArSatisfaction({
    expectedArLedgers: [{ idempotencyKey: 'OPA:1:AR-SALE', category: 'AR-SALE', debit: 1000 }],
    arPostingResults: [{ idempotencyKey: 'OPA:1:AR-SALE', alreadyExists: true, entry: { id: 'AR1', idempotencyKey: 'OPA:1:AR-SALE' } }]
  });

  assert.equal(result.arRequired, true);
  assert.equal(result.arSatisfied, true);
  assert.equal(result.arPosted, false);
  assert.equal(result.arAlreadyExists, true);
  assert.equal(result.arReasonCode, 'ALREADY_EXISTS');
});

test('Phase244 AR satisfaction treats no AR intents as valid no-op', () => {
  const result = evaluateArSatisfaction({
    expectedArLedgers: [],
    arPostingResults: []
  });

  assert.equal(result.arRequired, false);
  assert.equal(result.arSatisfied, true);
  assert.equal(result.arNoopValid, true);
});

test('Phase244 AR satisfaction preserves zero tolerance no-op evidence', () => {
  const result = evaluateArSatisfaction({
    expectedArLedgers: [],
    arPostingResults: [],
    debtReconcileResult: { skippedAlreadyFixed: true, skipReason: 'NO_DEBT_DELTA', zeroToleranceApplied: true }
  });

  assert.equal(result.arRequired, false);
  assert.equal(result.arSatisfied, true);
  assert.equal(result.arNoopValid, true);
  assert.equal(result.arReasonCode, 'ZERO_TOLERANCE');
});

test('Phase244 AR satisfaction rejects required AR without created or idempotent evidence', () => {
  const result = evaluateArSatisfaction({
    expectedArLedgers: [{ idempotencyKey: 'OPA:1:AR-SALE', category: 'AR-SALE', debit: 1000 }],
    arPostingResults: []
  });

  assert.equal(result.arRequired, true);
  assert.equal(result.arSatisfied, false);
  assert.equal(result.arPosted, false);
  assert.equal(result.arAlreadyExists, false);
  assert.equal(result.arReasonCode, 'UNKNOWN');
  assert.deepEqual(result.missingIntents.map((row) => row.idempotencyKey), ['OPA:1:AR-SALE']);
});

test('Phase244 AR satisfaction reports only missing intents in mixed AR evidence', () => {
  const result = evaluateArSatisfaction({
    expectedArLedgers: [
      { idempotencyKey: 'OPA:1:AR-SALE', category: 'AR-SALE', debit: 1000 },
      { idempotencyKey: 'OPA:1:AR-RETURN', category: 'AR-RETURN', credit: 200 },
      { idempotencyKey: 'OPA:1:AR-REWARD', category: 'AR-REWARD-ALLOWANCE', credit: 100 }
    ],
    arPostingResults: [
      { idempotencyKey: 'OPA:1:AR-SALE', created: true, entry: { id: 'AR1', idempotencyKey: 'OPA:1:AR-SALE' } },
      { idempotencyKey: 'OPA:1:AR-RETURN', alreadyExists: true, entry: { id: 'AR2', idempotencyKey: 'OPA:1:AR-RETURN' } }
    ]
  });

  assert.equal(result.arRequired, true);
  assert.equal(result.arSatisfied, false);
  assert.equal(result.expectedIntentCount, 3);
  assert.equal(result.satisfiedIntentCount, 2);
  assert.deepEqual(result.missingIntents.map((row) => row.idempotencyKey), ['OPA:1:AR-REWARD']);
});

test('Phase244 closeout service has transaction guard and writer evidence contract', () => {
  const closeout = read('src/services/accounting/AccountingCloseoutService.js');
  const allocation = read('src/services/accounting/OrderPaymentAllocationService.js');

  assert.match(closeout, /evaluateArSatisfaction\(\{/);
  assert.match(closeout, /AR_PERSISTENCE_VERIFICATION_FAILED/);
  assert.match(closeout, /if \(!arEvidence\.arSatisfied\)/);
  assert.match(closeout, /arSatisfied:\s*arEvidence\.arSatisfied/);
  assert.match(closeout, /arAlreadyExists:\s*arEvidence\.arAlreadyExists/);
  assert.match(closeout, /arReasonCode:\s*arEvidence\.arReasonCode/);
  assert.match(allocation, /postingResults\.push\(\{/);
  assert.match(allocation, /reasonCode:\s*'ALREADY_EXISTS'/);
  assert.match(allocation, /reasonCode:\s*'POSTED'/);
  assert.match(allocation, /expectedArLedgers/);
});
