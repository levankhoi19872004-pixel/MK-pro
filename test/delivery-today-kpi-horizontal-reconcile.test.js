'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateDeliveryTodayKpi } = require('../src/services/delivery/deliveryTodayKpiCalculator');

test('Delivery Today KPI CN subtracts CK in horizontal formula for Đỗ Thị Mừng case', () => {
  const kpi = calculateDeliveryTodayKpi({
    receivableAmount: 42960436,
    cashAmount: 13774602,
    bankAmount: 4989971,
    rewardAmount: 4065000,
    returnAmount: 350774,
    preferredDebtAmount: 24770060,
    preferredDebtSource: 'legacy-debt-without-bank-deduction'
  });
  assert.equal(kpi.computedDebtAmount, 19780089);
  assert.equal(kpi.finalDebtAmount, 19780089);
  assert.notEqual(kpi.finalDebtAmount, 24770060);
  assert.ok(kpi.warnings.some((warning) => warning.code === 'DEBT_RECONCILE_MISMATCH'));
});

test('Delivery Today KPI selected two-NVBH total reconciles horizontally', () => {
  const kpi = calculateDeliveryTodayKpi({
    receivableAmount: 35326573,
    cashAmount: 22725000,
    bankAmount: 3835000,
    rewardAmount: 6755000,
    returnAmount: 0,
    preferredDebtAmount: 2003974,
    preferredDebtSource: 'allocation-total'
  });
  assert.equal(kpi.computedDebtAmount, 2011573);
  assert.equal(kpi.finalDebtAmount, 2011573);
  assert.ok(kpi.warnings.some((warning) => warning.code === 'DEBT_RECONCILE_MISMATCH'));
});

test('Delivery Today KPI can accept preferred debt when within zero tolerance', () => {
  const kpi = calculateDeliveryTodayKpi({
    receivableAmount: 100000,
    cashAmount: 60000,
    bankAmount: 20000,
    rewardAmount: 10000,
    returnAmount: 0,
    preferredDebtAmount: 9500,
    preferredDebtSource: 'orderPaymentAllocations.current'
  });
  assert.equal(kpi.computedDebtAmount, 10000);
  assert.equal(kpi.finalDebtAmount, 9500);
  assert.equal(kpi.warnings.length, 0);
});
