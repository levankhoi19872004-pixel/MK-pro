'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const tracking = require('../src/services/mobile/mobileSalesOrderTracking.service');
const { buildMobileSalesOrderTrackingSummary, _internal } = tracking;

test('daily debt helper zeroes small residuals from delivery closeout formula', () => {
  const amount = _internal.calculateDailyDebtFromCloseout({
    payableAmount: 5344067,
    cashAmount: 5159000,
    bankAmount: 0,
    bonusAmount: 185000,
    returnAmount: 0
  });
  assert.equal(amount, 0);
});

test('mobile order daily debt is calculated from deliveryCloseoutVersions without AR fallback', () => {
  const versionsByKey = new Map();
  versionsByKey.set('B0038774', {
    orderCode: 'B0038774',
    closeoutVersion: 2,
    originalAmount: 5097692,
    cashAmount: 0,
    bankAmount: 2047000,
    rewardAmount: 460000,
    returnAmount: 91101,
    status: 'closed',
    accountingStatus: 'accounting_confirmed'
  });

  const summary = buildMobileSalesOrderTrackingSummary({
    id: 'B0038774',
    code: 'B0038774',
    customerCode: '4501680',
    customerName: 'Chị Hiền',
    totalAmount: 5097692
  }, { versionsByKey, returnsByKey: new Map() });

  assert.equal(summary.closeoutSource, 'deliveryCloseoutVersions');
  assert.equal(summary.source, 'deliveryCloseoutVersions');
  assert.equal(summary.payableAmount, 5097692);
  assert.equal(summary.cashAmount, 0);
  assert.equal(summary.bankAmount, 2047000);
  assert.equal(summary.bonusAmount, 460000);
  assert.equal(summary.returnAmount, 91101);
  assert.equal(summary.dailyDebtAmount, 2499591);
  assert.equal(summary.remainingDebt, 2499591);
});

test('missing delivery closeout never falls back to customer or AR debt', () => {
  const summary = buildMobileSalesOrderTrackingSummary({
    id: 'B-NO-CLOSEOUT',
    code: 'B-NO-CLOSEOUT',
    totalAmount: 1000000,
    currentDebtAmount: 99999999,
    customerDebtAmount: 99999999,
    remainingDebt: 99999999
  }, { versionsByKey: new Map(), returnsByKey: new Map() });

  assert.equal(summary.source, 'no_daily_closeout');
  assert.equal(summary.closeoutSource, 'no_daily_closeout');
  assert.equal(summary.remainingDebt, 1000000);
  assert.notEqual(summary.remainingDebt, 99999999);
});
