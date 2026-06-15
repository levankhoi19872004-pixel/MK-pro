'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const arLedgerUtil = require('../src/utils/arLedger.util');

test('AR guard calculates open debt from active debit/credit ledger rows only', () => {
  const rows = [
    { orderId: 'SO1', debit: 100000, credit: 0, status: 'posted' },
    { orderCode: 'SO1', debit: 0, credit: 25000, status: 'posted' },
    { orderId: 'SO1', debit: 0, credit: 999999, status: 'void' },
    { orderId: 'SO2', debit: 50000, credit: 0, status: 'posted' }
  ];
  assert.equal(arLedgerUtil.arBalance(rows, ['SO1']), 75000);
});

test('AR guard blocks allocation that exceeds remaining order debt', async () => {
  const fakePaymentRepository = {
    findAll: async () => [
      { orderId: 'SO1', debit: 100000, credit: 0, status: 'posted' },
      { orderCode: 'SO1', debit: 0, credit: 40000, status: 'posted' }
    ]
  };
  const result = await arLedgerUtil.validateAllocationsDoNotOverpay([
    { orderId: 'SO1', orderCode: 'SO1', amount: 70000 }
  ], fakePaymentRepository);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /vượt công nợ còn lại/);
  assert.equal(result.detail.openDebt, 60000);
});

test('AR guard uses amount fallback for legacy sale and receipt rows', () => {
  const rows = [
    { orderCode: 'SO-LEGACY', type: 'ar_sale', amount: 500000, debit: 0, credit: 0, status: 'posted' },
    { orderCode: 'SO-LEGACY', type: 'ar_receipt', amount: 125000, debit: 0, credit: 0, status: 'posted' },
    { orderCode: 'SO-LEGACY', type: 'ar_void', amount: 999999, status: 'posted' }
  ];
  assert.equal(arLedgerUtil.arBalance(rows, ['SO-LEGACY']), 375000);
});
