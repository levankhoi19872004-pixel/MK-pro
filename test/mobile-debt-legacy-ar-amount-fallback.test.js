'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const ArLedger = require('../src/models/ArLedger');
const DebtCollection = require('../src/models/DebtCollection');
const arLedgerUtil = require('../src/utils/arLedger.util');
const DebtReadService = require('../src/services/DebtReadService');

function queryReturning(rows = []) {
  return {
    limit() { return this; },
    session() { return this; },
    lean: async () => rows
  };
}

async function withDebtRows({ ledgerRows = [], pendingRows = [] }, callback) {
  const originalArFind = ArLedger.find;
  const originalCollectionFind = DebtCollection.find;
  ArLedger.find = () => queryReturning(ledgerRows);
  DebtCollection.find = () => queryReturning(pendingRows);
  try {
    return await callback();
  } finally {
    ArLedger.find = originalArFind;
    DebtCollection.find = originalCollectionFind;
  }
}

test('AR amount fallback matches the debt report for legacy rows', () => {
  const rows = [
    { type: 'ar_sale', orderCode: 'HU90203652', amount: 10_000_000, debit: 0, credit: 0, status: 'posted' },
    { type: 'ar_receipt', orderCode: 'HU90203652', amount: 3_440_815, debit: 0, credit: 0, status: 'posted' }
  ];

  assert.equal(arLedgerUtil.effectiveArDebit(rows[0]), 10_000_000);
  assert.equal(arLedgerUtil.effectiveArCredit(rows[1]), 3_440_815);
  assert.equal(arLedgerUtil.arBalance(rows, ['HU90203652']), 6_559_185);
});

test('mobile debt collection accepts the exact displayed debt from amount-only AR rows', async () => {
  const orderCode = 'HU90203652';
  const customerCode = '4499569';
  const ledgerRows = [
    {
      type: 'ar_sale',
      status: 'posted',
      orderCode,
      salesOrderCode: orderCode,
      customerCode,
      customerName: 'Vân Xô',
      salesStaffCode: '33955',
      salesStaffName: 'Đỗ Thị Mừng',
      amount: 10_000_000,
      debit: 0,
      credit: 0
    },
    {
      type: 'ar_receipt',
      status: 'posted',
      orderCode,
      salesOrderCode: orderCode,
      customerCode,
      amount: 3_440_815,
      debit: 0,
      credit: 0
    }
  ];

  const result = await withDebtRows({ ledgerRows }, () => DebtReadService.checkAvailableDebt({
    customerCode,
    scope: { salesman: '33955' },
    allocations: [{ salesOrderCode: orderCode, allocatedAmount: 6_559_185 }]
  }));

  assert.equal(result.ok, true);
  assert.equal(result.debtAmount, 6_559_185);
  assert.equal(result.availableDebtAmount, 6_559_185);
  assert.equal(result.allocations[0].beforeDebt, 6_559_185);
  assert.equal(result.allocations[0].allocatedAmount, 6_559_185);
});

test('mobile debt collection still rejects an amount above the canonical available debt', async () => {
  const orderCode = 'HU90203652';
  const customerCode = '4499569';
  const ledgerRows = [{
    type: 'ar_sale',
    status: 'posted',
    orderCode,
    customerCode,
    salesStaffCode: '33955',
    amount: 6_559_185,
    debit: 0,
    credit: 0
  }];

  const result = await withDebtRows({ ledgerRows }, () => DebtReadService.checkAvailableDebt({
    customerCode,
    scope: { salesman: '33955' },
    allocations: [{ salesOrderCode: orderCode, allocatedAmount: 6_559_186 }]
  }));

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.detail.officialDebt, 6_559_185);
  assert.equal(result.detail.availableDebt, 6_559_185);
});

test('mobile debt collection rejects duplicate allocations for the same order', async () => {
  const result = await DebtReadService.checkAvailableDebt({
    customerCode: '4499569',
    allocations: [
      { salesOrderCode: 'HU90203652', allocatedAmount: 3_000_000 },
      { salesOrderCode: 'HU90203652', allocatedAmount: 3_559_185 }
    ]
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.message, /phân bổ trùng/);
});
