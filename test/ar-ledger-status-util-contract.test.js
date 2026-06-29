'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const status = require('../src/utils/arLedgerStatus.util');

test('canonical active AR ledger filter keeps extra fields readable at top-level', () => {
  const filter = status.buildActiveArLedgerFilter({ customerCode: 'C1' });
  assert.equal(filter.customerCode, 'C1');
  assert.ok(filter.account instanceof RegExp);
  assert.equal(filter.account.test('AR'), true);
  assert.equal(filter.accountingConfirmed, true);
  assert.deepEqual(filter.reversed, { $ne: true });
  assert.deepEqual(filter.isDeleted, { $ne: true });
  assert.ok(filter.status.$nin.includes('void'));
  assert.ok(filter.status.$nin.includes('draft'));
  assert.ok(filter.type.$nin.includes('ar_reversal'));
  assert.ok(filter.type.$nin.includes('ar_return_reversal'));
});

test('confirmed AR filter exposes canonical accounting statuses', () => {
  const filter = status.buildConfirmedArLedgerFilter({ customerCode: 'C1' });
  assert.equal(filter.customerCode, 'C1');
  assert.equal(filter.accountingConfirmed, true);
  assert.ok(filter.accountingStatus.$in.includes('confirmed'));
  assert.ok(filter.accountingStatus.$in.includes('locked'));
  assert.ok(filter.accountingStatus.$in.includes('posted'));
  assert.ok(filter.accountingStatus.$in.includes('accounting_confirmed'));
});

test('AR category helpers recognize sale return receipt and bonus ledgers', () => {
  assert.equal(status.isArReturnLedger({ category: 'AR-RETURN' }), true);
  assert.equal(status.isArReturnLedger({ idempotencyKey: 'AR-RETURN:RO-B0038424' }), true);
  assert.equal(status.isArReturnLedger({ code: 'AR-RETURN-RO-B0038424-ACC-123' }), true);
  assert.equal(status.isArSaleLedger({ type: 'ar_sale' }), true);
  assert.equal(status.isArReceiptLedger({ type: 'ar_receipt' }), true);
  assert.equal(status.isArBonusOrAllowanceLedger({ ledgerType: 'AR-ALLOWANCE' }), true);
});

test('ledger predicates reject inactive and unconfirmed AR ledgers', () => {
  assert.equal(status.isActiveLedgerDoc({ status: 'posted', accountingStatus: 'confirmed' }), true);
  assert.equal(status.isActiveLedgerDoc({ status: 'void' }), false);
  assert.equal(status.isActiveLedgerDoc({ entryType: 'reversal' }), false);
  assert.equal(status.isConfirmedArLedger({ account: 'AR', accountingConfirmed: true, accountingStatus: 'confirmed' }), true);
  assert.equal(status.isConfirmedArLedger({ account: 'AR', accountingConfirmed: false, accountingStatus: 'confirmed' }), false);
  assert.equal(status.isConfirmedArLedger({ account: 'CASH', accountingConfirmed: true, accountingStatus: 'confirmed' }), false);
});
