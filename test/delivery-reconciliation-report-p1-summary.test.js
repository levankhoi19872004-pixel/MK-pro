'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { helpers } = require('../src/services/deliveryReconciliation.service');

test('delivery reconciliation summary balances orders, returns, debt collections and fund ledgers', () => {
  const orders = [
    { delivered: true, grossAmount: 1000000, returnAmount: 200000, rewardAmount: 0, mustCollect: 800000, collectedCash: 500000, collectedTransfer: 200000, collectedAmount: 700000, remainingDebt: 100000 },
    { delivered: false, grossAmount: 300000, returnAmount: 0, rewardAmount: 0, mustCollect: 300000, collectedCash: 0, collectedTransfer: 0, collectedAmount: 0, remainingDebt: 300000 }
  ];
  const collections = [
    { status: 'submitted', amount: 150000, pendingAccounting: true },
    { status: 'accounting_confirmed', amount: 50000, pendingAccounting: false }
  ];
  const fundLedgers = [
    { amount: 50000 },
    { amount: -10000 }
  ];
  const summary = helpers.summarizeReconciliation({ orders, returns: [], collections, fundLedgers });
  assert.equal(summary.assignedOrders, 2);
  assert.equal(summary.deliveredOrders, 1);
  assert.equal(summary.pendingOrders, 1);
  assert.equal(summary.grossAmount, 1300000);
  assert.equal(summary.returnAmount, 200000);
  assert.equal(summary.mustCollect, 1100000);
  assert.equal(summary.collectedCash, 500000);
  assert.equal(summary.collectedTransfer, 200000);
  assert.equal(summary.remainingDebt, 400000);
  assert.equal(summary.pendingDebtCollections, 1);
  assert.equal(summary.pendingDebtCollectionAmount, 150000);
  assert.equal(summary.confirmedDebtCollections, 1);
  assert.equal(summary.confirmedDebtCollectionAmount, 50000);
  assert.equal(summary.confirmedFundIn, 50000);
  assert.equal(summary.difference, 0);
  assert.equal(summary.hasMismatch, false);
});

test('order report row prefers arLedgers balance as remainingDebt when available', () => {
  const arBalanceByOrder = helpers.buildArBalanceByOrder([
    { orderCode: 'SO-1', debit: 1000000, credit: 900000 }
  ]);
  const row = helpers.buildOrderReportRow({
    orderCode: 'SO-1',
    customerCode: 'C001',
    customerName: 'Khách A',
    deliveryStatus: 'delivered',
    amounts: { receivable: 1000000, cash: 500000, bank: 300000, returnAmount: 100000, debt: 999999 }
  }, arBalanceByOrder);
  assert.equal(row.remainingDebt, 100000);
  assert.equal(row.mustCollect, 900000);
  assert.equal(row.difference, 0);
});
