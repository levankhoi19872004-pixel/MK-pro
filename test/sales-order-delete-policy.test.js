'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  decideSalesOrderDeletion
} = require('../src/domain/lifecycle/salesOrderDeletion.policy');

test('draft order can be hard deleted from orders', () => {
  const decision = decideSalesOrderDeletion(
    { code: 'SO1', status: 'pending' },
    {},
    {}
  );

  assert.equal(decision.allowed, true);
  assert.equal(decision.mode, 'HARD_DELETE');
  assert.equal(decision.hardDelete, true);
  assert.equal(decision.reverseStock, false);
});

test('stock posted order is reversed then hard deleted without tombstone', () => {
  const decision = decideSalesOrderDeletion(
    { code: 'SO2', status: 'pending', stockPosted: true },
    {},
    {}
  );

  assert.equal(decision.allowed, true);
  assert.equal(decision.mode, 'REVERSE_STOCK_THEN_HARD_DELETE');
  assert.equal(decision.reverseStock, true);
  assert.equal(decision.hardDelete, true);
  assert.equal(decision.archiveTombstone, undefined);
});

test('merged order cannot be deleted directly', () => {
  const decision = decideSalesOrderDeletion(
    { code: 'SO3', masterOrderCode: 'MO1', status: 'pending' },
    {},
    {}
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'ORDER_ALREADY_MERGED');
});

test('return dependency blocks deletion', () => {
  const decision = decideSalesOrderDeletion(
    { code: 'SO4', status: 'pending' },
    { activeReturnLocked: true },
    {}
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'RETURN_DEPENDENCY_EXISTS');
});

test('accounting order cannot be deleted through normal delete flow', () => {
  const decision = decideSalesOrderDeletion(
    { code: 'SO5', accountingConfirmed: true, stockPosted: true },
    { hasArLedger: true },
    {}
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'FINANCIAL_DEPENDENCY_EXISTS');
});
