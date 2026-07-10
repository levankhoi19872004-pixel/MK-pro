'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const closeoutPath = path.join(root, 'src/services/accounting/AccountingCloseoutService.js');
const projectorPath = path.join(root, 'src/services/arDebtReadModelProjector.service.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('AccountingCloseoutService hot path does not rebuild AR debt read-model synchronously', () => {
  const source = read(closeoutPath);
  assert.doesNotMatch(source, /arDebtReadModel\s*=\s*require/);
  assert.doesNotMatch(source, /rebuildDebtForCustomer\s*\(/);
  assert.doesNotMatch(source, /refreshDebtCustomerFromOrders\s*\(/);
  assert.doesNotMatch(source, /rebuildDebtForSource\s*\(/);
  assert.doesNotMatch(source, /ArDebtOrder\.find\s*\(/);
  assert.doesNotMatch(source, /ArDebtCustomer\.deleteMany\s*\(/);
  assert.match(source, /CloseoutPostCommitHandler/);
  assert.match(source, /enqueueReadModelSync\s*\(/);
  assert.match(source, /postCommitReadModelSync/);
});

test('projector owns heavy read-model rebuild work outside closeout request', () => {
  const projector = read(projectorPath);
  assert.match(projector, /rebuildDebtForSource\s*\(/);
  assert.match(projector, /refreshDebtCustomerFromOrders\s*\(/);
  assert.match(projector, /AR_DEBT_READMODEL_SYNC_JOB/);
});
