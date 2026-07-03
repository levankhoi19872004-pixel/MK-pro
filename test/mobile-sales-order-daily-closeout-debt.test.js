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

test('mobile order TT includes offset-only delivery closeout amount', () => {
  const versionsByKey = new Map();
  versionsByKey.set('B0038771', {
    orderCode: 'B0038771',
    customerName: 'Chị Hạnh',
    closeoutVersion: 2,
    originalAmount: 5344067,
    cashAmount: 5159000,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 185000,
    returnAmount: 0,
    status: 'closed'
  });

  const summary = buildMobileSalesOrderTrackingSummary({
    id: 'B0038771',
    code: 'B0038771',
    customerCode: '4501683',
    customerName: 'Chị Hạnh',
    totalAmount: 5344067
  }, { versionsByKey, returnsByKey: new Map() });

  assert.equal(summary.closeoutSource, 'deliveryCloseoutVersions');
  assert.equal(summary.cashAmount, 5159000);
  assert.equal(summary.bankAmount, 0);
  assert.equal(summary.offsetAmount, 185000);
  assert.equal(summary.bonusAmount, 185000);
  assert.equal(summary.rewardAmount, 185000);
  assert.equal(summary.returnAmount, 0);
  assert.equal(summary.dailyDebtAmount, 0);
  assert.equal(summary.remainingDebt, 0);
});

test('mobile order daily debt handles reward-only delivery closeout amount', () => {
  const amount = _internal.calculateDailyDebtFromCloseout({
    payableAmount: 1000000,
    cashAmount: 700000,
    bankAmount: 0,
    rewardAmount: 300000,
    offsetAmount: 0,
    returnAmount: 0
  });
  assert.equal(amount, 0);
});

test('mobile order daily debt adds different reward and offset amounts', () => {
  const amount = _internal.calculateDailyDebtFromCloseout({
    payableAmount: 1000000,
    cashAmount: 500000,
    bankAmount: 0,
    rewardAmount: 100000,
    offsetAmount: 200000,
    returnAmount: 0
  });
  assert.equal(amount, 200000);
});

test('mobile order daily debt avoids double counting duplicated reward and offset amounts', () => {
  assert.equal(_internal.normalizeRewardOffsetAmount(300000, 300000), 300000);
  const amount = _internal.calculateDailyDebtFromCloseout({
    payableAmount: 1000000,
    cashAmount: 700000,
    bankAmount: 0,
    rewardAmount: 300000,
    offsetAmount: 300000,
    returnAmount: 0
  });
  assert.equal(amount, 0);
});

test('latest version money reads newOffsetAmount aliases', () => {
  const money = _internal.latestVersionMoney({
    cashAmount: 700000,
    bankAmount: 0,
    rewardAmount: 0,
    newOffsetAmount: 300000
  }, {});
  assert.equal(money.offsetAmount, 300000);
  assert.equal(money.bonusAmount, 300000);
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


test('mobile tracking infers TT from raw closeout debt when version omits offset field', () => {
  const versionsByKey = new Map();
  versionsByKey.set('B0038771', {
    orderCode: 'B0038771',
    deliveryDate: '2026-07-03',
    closeoutVersion: 3,
    originalAmount: 5344067,
    cashAmount: 5159000,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 0,
    returnAmount: 0,
    rawFinalDebtAmount: 67,
    finalDebtAmount: 0,
    status: 'closed'
  });

  const summary = buildMobileSalesOrderTrackingSummary({
    id: 'B0038771',
    code: 'B0038771',
    orderDate: '2026-07-02',
    deliveryDate: '2026-07-03',
    totalAmount: 5344067
  }, { versionsByKey, returnsByKey: new Map() });

  assert.equal(summary.contract, 'delivery-today-orders');
  assert.equal(summary.deliveryDate, '2026-07-03');
  assert.equal(summary.cashAmount, 5159000);
  assert.equal(summary.bonusAmount, 185000);
  assert.equal(summary.rewardAmount, 185000);
  assert.equal(summary.dailyDebtAmount, 0);
  assert.equal(summary.closeoutMatchedBy, 'inferred_from_rawFinalDebtAmount');
});

test('mobile tracking can match closeout version by master/closeout identity, not order date', () => {
  const versionsByKey = new Map();
  versionsByKey.set('MO-03-07', {
    originalCloseoutId: 'MO-03-07',
    deliveryDate: '2026-07-03',
    originalAmount: 5344067,
    cashAmount: 5159000,
    offsetAmount: 185000,
    rawFinalDebtAmount: 67,
    status: 'closed'
  });

  const summary = buildMobileSalesOrderTrackingSummary({
    id: 'SO-02-07',
    code: 'B0038771',
    orderDate: '2026-07-02',
    masterOrderId: 'MO-03-07',
    totalAmount: 5344067
  }, { versionsByKey, returnsByKey: new Map() });

  assert.equal(summary.deliveryDate, '2026-07-03');
  assert.equal(summary.bonusAmount, 185000);
  assert.equal(summary.remainingDebt, 0);
});
