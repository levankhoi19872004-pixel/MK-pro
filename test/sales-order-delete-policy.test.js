'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  decideSalesOrderDeletion
} = require('../src/domain/lifecycle/salesOrderDeletion.policy');

test('draft order can be hard deleted', () => {
  const decision = decideSalesOrderDeletion(
    { code: 'SO1', status: 'pending' },
    {},
    { reason: 'Nhập sai' }
  );

  assert.equal(decision.allowed, true);
  assert.equal(decision.mode, 'HARD_DELETE_DRAFT');
  assert.equal(decision.hardDelete, true);
});

test('stock posted order is reversed then hard deleted with tombstone', () => {
  const decision = decideSalesOrderDeletion(
    { code: 'SO2', status: 'pending', stockPosted: true },
    {},
    { reason: 'Nhập sai' }
  );

  assert.equal(decision.allowed, true);
  assert.equal(decision.mode, 'HARD_DELETE_WITH_TOMBSTONE_AND_STOCK_REVERSAL');
  assert.equal(decision.reverseStock, true);
  assert.equal(decision.archiveTombstone, true);
});

test('merged order cannot be deleted directly', () => {
  const decision = decideSalesOrderDeletion(
    { code: 'SO3', masterOrderCode: 'MO1', status: 'pending' },
    {},
    { reason: 'Nhập sai' }
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'ORDER_ALREADY_MERGED');
});

test('locked return blocks deletion', () => {
  const decision = decideSalesOrderDeletion(
    { code: 'SO4', status: 'pending' },
    { activeReturnLocked: true },
    { reason: 'Nhập sai' }
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'RETURN_ORDER_LOCKED');
});

test('accounting order becomes soft void with reversal', () => {
  const decision = decideSalesOrderDeletion(
    { code: 'SO5', accountingConfirmed: true, stockPosted: true },
    { hasArLedger: true },
    { reason: 'Sai nghiệp vụ' }
  );

  assert.equal(decision.allowed, true);
  assert.equal(decision.mode, 'SOFT_VOID_WITH_REVERSAL');
  assert.equal(decision.hardDelete, false);
  assert.equal(decision.reverseStock, true);
  assert.equal(decision.reverseAr, true);
});
