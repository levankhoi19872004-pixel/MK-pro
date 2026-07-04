'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const audit = require('../scripts/audit-delivery-closeout-reward-debt-mismatch');

function baseOrder(overrides = {}) {
  return {
    id: 'SO17828954291387',
    code: 'B0038683',
    orderCode: 'B0038683',
    customerCode: '4501630',
    customerName: 'Chị Thoa',
    totalAmount: 968665,
    rewardAmount: 265000,
    deliveryCloseout: {
      deliveredAmount: 968665,
      cashAmount: 704000,
      bankAmount: 0,
      offsetAmount: 0,
      rewardAmount: 0,
      rawFinalDebtAmount: 264665,
      finalDebtAmount: 264665
    },
    ...overrides
  };
}

test('audit detects order reward dropped from delivery closeout', () => {
  const result = audit.buildAuditReport({ database: 'unit', orders: [baseOrder()], ledgers: [], debtOrders: [] });
  assert.equal(result.mismatchOrderCount, 1);
  assert.equal(result.mismatches[0].reason, 'REWARD_NOT_DEDUCTED');
  assert.equal(result.mismatches[0].expectedFinalDebtAmount, 0);
  assert.equal(result.mismatches[0].expectedRawFinalDebtAmount, -335);
  assert.equal(result.mismatches[0].actualFinalDebtAmount, 264665);
  assert.match(result.mismatches[0].suggestedRepairCommand, /node scripts\\repair-ar-debt-open-reward-closeout\.js 4501630 B0038683/);
});

test('audit passes when closeout reward and final debt are correct', () => {
  const order = baseOrder({
    deliveryCloseout: {
      deliveredAmount: 968665,
      cashAmount: 704000,
      bankAmount: 0,
      offsetAmount: 0,
      rewardAmount: 265000,
      rawFinalDebtAmount: -335,
      finalDebtAmount: 0
    }
  });
  const result = audit.buildAuditReport({ database: 'unit', orders: [order], ledgers: [], debtOrders: [] });
  assert.equal(result.mismatchOrderCount, 0);
  assert.equal(result.mismatches.length, 0);
});

test('audit detects active AR-DEBT-OPEN ledger when expected debt is zero', () => {
  const order = baseOrder({
    deliveryCloseout: {
      deliveredAmount: 968665,
      cashAmount: 704000,
      bankAmount: 0,
      offsetAmount: 0,
      rewardAmount: 265000,
      rawFinalDebtAmount: -335,
      finalDebtAmount: 0
    }
  });
  const ledger = {
    id: 'AR-DEBT-OPEN-SO17828954291387',
    category: 'AR-DEBT-OPEN',
    sourceId: 'SO17828954291387',
    orderCode: 'B0038683',
    debit: 264665,
    active: true,
    reversed: false
  };
  const result = audit.buildAuditReport({ database: 'unit', orders: [order], ledgers: [ledger], debtOrders: [] });
  assert.equal(result.mismatchOrderCount, 1);
  assert.equal(result.mismatchLedgerCount, 1);
  assert.equal(result.mismatches[0].reason, 'SHOULD_NOT_HAVE_ACTIVE_AR_DEBT_OPEN');
  assert.deepEqual(result.mismatches[0].activeArDebtOpenIds, ['AR-DEBT-OPEN-SO17828954291387']);
});

test('audit does not match ledger by prefix-like order id', () => {
  const first = baseOrder({
    id: 'SO17828954291387',
    code: 'B0038683',
    orderCode: 'B0038683',
    deliveryCloseout: {
      deliveredAmount: 968665,
      cashAmount: 704000,
      bankAmount: 0,
      offsetAmount: 0,
      rewardAmount: 265000,
      rawFinalDebtAmount: -335,
      finalDebtAmount: 0
    }
  });
  const second = baseOrder({
    id: 'SO1782895429138768',
    code: 'B0038607',
    orderCode: 'B0038607',
    customerCode: '4501636',
    customerName: 'Chị Loan',
    deliveryCloseout: {
      deliveredAmount: 968665,
      cashAmount: 704000,
      bankAmount: 0,
      offsetAmount: 0,
      rewardAmount: 265000,
      rawFinalDebtAmount: -335,
      finalDebtAmount: 0
    }
  });
  const ledgerForSecond = {
    id: 'AR-DEBT-OPEN-SO1782895429138768',
    category: 'AR-DEBT-OPEN',
    sourceId: 'SO1782895429138768',
    orderCode: 'B0038607',
    debit: 264665,
    active: true,
    reversed: false
  };
  const result = audit.buildAuditReport({ database: 'unit', orders: [first, second], ledgers: [ledgerForSecond], debtOrders: [] });
  const firstMismatch = result.mismatches.find((row) => row.orderId === 'SO17828954291387');
  const secondMismatch = result.mismatches.find((row) => row.orderId === 'SO1782895429138768');
  assert.equal(firstMismatch, undefined);
  assert.ok(secondMismatch);
  assert.equal(secondMismatch.reason, 'SHOULD_NOT_HAVE_ACTIVE_AR_DEBT_OPEN');
});

test('audit detects open arDebtOrders read model when expected debt is zero', () => {
  const order = baseOrder({
    deliveryCloseout: {
      deliveredAmount: 968665,
      cashAmount: 704000,
      bankAmount: 0,
      offsetAmount: 0,
      rewardAmount: 265000,
      rawFinalDebtAmount: -335,
      finalDebtAmount: 0
    }
  });
  const debtOrder = {
    id: 'AR-DEBT-ORDER-SO17828954291387',
    sourceId: 'SO17828954291387',
    sourceCode: 'B0038683',
    status: 'open',
    remainingDebt: 264665
  };
  const result = audit.buildAuditReport({ database: 'unit', orders: [order], ledgers: [], debtOrders: [debtOrder] });
  assert.equal(result.mismatchOrderCount, 1);
  assert.equal(result.mismatchReadModelCount, 1);
  assert.equal(result.mismatches[0].reason, 'SHOULD_NOT_HAVE_OPEN_DEBT_READ_MODEL');
  assert.equal(result.mismatches[0].arDebtOrderRemainingDebt, 264665);
});
