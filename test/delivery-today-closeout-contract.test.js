'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/services/accounting/AccountingCloseoutService.js'), 'utf8');
const match = source.match(/function\s+buildConfirmedOrderPatchFields[\s\S]*?\n}\n\nasync function loadOrders/);

function patchBody() {
  assert.ok(match, 'buildConfirmedOrderPatchFields must exist');
  return match[0];
}

test('closeout confirmed order patch contains only accounting closeout fields', () => {
  const body = patchBody();
  for (const field of [
    'deliveryCloseout',
    'accountingConfirmed',
    'accountingStatus',
    'accountingLocked',
    'editLocked',
    'deliveryLocked',
    'accountingConfirmedAt',
    'accountingConfirmedBy',
    'debtAmount',
    'arBalance',
    'arStatus',
    'lifecycleStatus',
    'updatedAt'
  ]) {
    assert.match(body, new RegExp(`${field}\\s*:`));
  }
  assert.doesNotMatch(body, /\.\.\.order/);
  assert.doesNotMatch(body, /items\s*:/);
  assert.doesNotMatch(body, /products\s*:/);
  assert.doesNotMatch(body, /paymentAllocations\s*:/);
});

test('closeout confirmed order patch stores compact closeout without operational/history details', () => {
  const fullSource = source;
  assert.match(fullSource, /function\s+compactCloseoutForOrder\s*\(/);
  assert.match(patchBody(), /stripOperationalDetails\s*\(\s*closeout\s*\)/);
  const compact = fullSource.match(/function\s+compactCloseoutForOrder[\s\S]*?\n}\n/);
  assert.ok(compact, 'compactCloseoutForOrder must exist');
  assert.doesNotMatch(compact[0], /versions\s*:/);
  assert.doesNotMatch(compact[0], /auditTrail\s*:/);
  assert.doesNotMatch(compact[0], /activeReturnOrders\s*:/);
  assert.doesNotMatch(compact[0], /paymentRows\s*:/);
  assert.doesNotMatch(compact[0], /offsetRows\s*:/);
});
