'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('Phase260D Debt New reader uses single ownership resolver and projector', () => {
  const source = read('src/services/v2/debtNew.service.js');
  assert.match(source, /DebtLedgerOwnershipResolver/);
  assert.match(source, /resolveDebtLedgerOwnership\(ledgers\)/);
  assert.match(source, /LegacyDebtProjector/);
  assert.match(source, /shadowedLedgers/);
  assert.match(source, /ownershipDecisions/);
});

test('Phase260D mobile debt reader uses same ownership resolver and projector', () => {
  const source = read('src/services/mobile/mobileDebtQuery.service.js');
  assert.match(source, /DebtLedgerOwnershipResolver/);
  assert.match(source, /resolveDebtLedgerOwnership/);
  assert.match(source, /LegacyDebtProjector/);
  assert.doesNotMatch(source, /normalizeDebtAmount\(order\.debt\)/);
});

test('Phase260D frontend debt-new does not rebuild available debt by pending subtraction', () => {
  const source = read('public/js/app/new/92-debt-new.js');
  assert.doesNotMatch(source, /orderRemainingDebt\(order\)\s*-\s*orderPendingCollectionAmount\(order\)/);
  assert.match(source, /order\.availableToCollect/);
  assert.match(source, /order\.debtAmount/);
});

test('Phase260D ownership resolver distinguishes shadow, duplicate and unresolved', () => {
  const source = read('src/domain/ar/DebtLedgerOwnershipResolver.js');
  assert.match(source, /PROJECTION_SHADOW/);
  assert.match(source, /ACTUAL_DUPLICATE_FINANCIAL_EFFECT/);
  assert.match(source, /MISSING_BUSINESS_EVENT_IDENTITY/);
  assert.doesNotMatch(source, /amount\s*===/);
});
