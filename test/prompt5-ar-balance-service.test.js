'use strict';

const assert = require('assert');
const test = require('node:test');
const arBalanceService = require('../src/services/accounting/arBalanceService');

test('arBalanceService computes official debt from active arLedgers, ignoring SalesOrder cache', () => {
  const rows = [
    { type: 'ar_sale', amount: 100000, orderCode: 'SO1', customerCode: 'C1', status: 'posted' },
    { type: 'ar_return', amount: 30000, orderCode: 'SO1', customerCode: 'C1', status: 'posted' },
    { type: 'ar_receipt', credit: 20000, orderCode: 'SO1', customerCode: 'C1', status: 'posted' },
    { type: 'ar_return', amount: 999999, orderCode: 'SO1', customerCode: 'C1', status: 'void' },
    { type: 'ar_sale', amount: 50000, orderCode: 'SO2', customerCode: 'C1', reversed: true }
  ];
  assert.equal(arBalanceService.computeBalanceFromLedgers(rows), 50000);
});

test('arBalanceService exposes canonical active AR filter for reports and audits', () => {
  const filter = arBalanceService.activeArLedgerQuery({ customerCode: 'C1' });
  assert.equal(filter.customerCode, 'C1');
  assert.deepEqual(filter.reversed, { $ne: true });
  assert.deepEqual(filter.isDeleted, { $ne: true });
  assert.ok(filter.status.$nin.includes('void'));
  assert.ok(filter.type.$nin.includes('ar_reversal'));
});
