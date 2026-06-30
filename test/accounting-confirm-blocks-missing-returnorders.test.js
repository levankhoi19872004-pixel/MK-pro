'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const AccountingCloseoutService = require('../src/services/accounting/AccountingCloseoutService');

test('accounting confirm blocks when app reports return but DB has no valid returnOrders', async () => {
  const order = {
    id: 'SO-MISSING-RO',
    code: 'B-MISSING-RO',
    deliveryStatus: 'delivered',
    customerCode: 'C-MISSING',
    totalAmount: 1000000,
    deliveryCloseout: { reportedReturnedAmount: 120000, collectedAmount: 0 }
  };
  await assert.rejects(
    () => AccountingCloseoutService.confirmOneOrder(order, [], { actor: 'KT', skipReadModelRebuild: true }),
    (err) => err && err.code === 'ACCOUNTING_CONFIRM_BLOCKED_MISSING_RETURNORDERS'
  );
});
