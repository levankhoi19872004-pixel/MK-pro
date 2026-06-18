'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const RewardReportService = require('../src/services/reports/RewardReportService');
const ArLedger = require('../src/models/ArLedger');
const ReportCenterService = require('../src/services/reports/ReportCenterService');

test('Report directory stays on the main screen and each report opens in a popup', () => {
  const html = require('./helpers/sourceBundle.util').readSource('public/index.html');
  const client = require('./helpers/sourceBundle.util').readSource('public/js/app/admin/08a-reports.js');
  const css = require('./helpers/sourceBundle.util').readSource('public/css/95-report-center-popup.css');

  assert.match(html, /id="reportCatalog" class="report-directory-list"/);
  assert.match(html, /Nhấn “Xem báo cáo” để mở popup chi tiết/);
  assert.doesNotMatch(html, /id="openReportCenterButton"/);
  assert.match(html, /id="reportCenterModal"[^>]*class="modal-backdrop report-center-modal"/);
  assert.match(html, /id="closeReportCenterButton"/);
  assert.match(client, /data-report-code/);
  assert.match(client, /openReport\(button\.dataset\.reportCode,button\)/);
  assert.match(client, /if\(!reportModalIsOpen\(\)&&options\.openModal!==true\)return reportCenterState\.catalog/);
  assert.match(client, /event\.key==='Escape'/);
  assert.match(css, /#reportsTab \.report-directory-grid/);
  assert.match(css, /#reportCenterModal \.report-center-dialog/);
});

test('reward customer report aggregates only positive AR bonus credits', () => {
  const rows = RewardReportService.aggregateRewardCustomers([
    {
      type: 'ar_bonus', refType: 'BONUS_ALLOWANCE', code: 'AR-BONUS-SO1',
      customerCode: 'KH01', customerName: 'Nhà A', salesStaffCode: 'NV01', salesStaffName: 'An',
      deliveryStaffCode: 'GH01', deliveryStaffName: 'Giao 1', orderCode: 'SO1',
      date: '2026-06-02', credit: 100000
    },
    {
      type: 'ar_bonus', refType: 'BONUS_ALLOWANCE', code: 'AR-BONUS-SO2',
      customerCode: 'KH01', customerName: 'Nhà A', salesStaffCode: 'NV01', salesStaffName: 'An',
      orderCode: 'SO2', date: '2026-06-05', amount: 50000
    },
    {
      type: 'ar_receipt', refType: 'RECEIPT', code: 'AR-RECEIPT-SO3',
      customerCode: 'KH02', customerName: 'Nhà B', date: '2026-06-06', credit: 90000
    },
    {
      type: 'ar_bonus', refType: 'BONUS_ALLOWANCE', code: 'AR-BONUS-SO4',
      customerCode: 'KH03', customerName: 'Nhà C', date: '2026-06-07', credit: 0, amount: 0
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].customerCode, 'KH01');
  assert.equal(rows[0].rewardCount, 2);
  assert.equal(rows[0].orderCount, 2);
  assert.equal(rows[0].totalRewardAmount, 150000);
  assert.equal(rows[0].averageRewardAmount, 75000);
  assert.equal(rows[0].firstRewardDate, '2026-06-02');
  assert.equal(rows[0].lastRewardDate, '2026-06-05');
  assert.equal(rows[0].latestOrderCode, 'SO2');
});

test('reward report is visible only to business roles and sourced from AR bonus ledger', () => {
  const adminCodes = ReportCenterService.catalog({ role: 'admin' }).reports.map((row) => row.code);
  assert.ok(adminCodes.includes('rewards-by-customer'));
  assert.throws(() => ReportCenterService.assertAccess('rewards-by-customer', { role: 'warehouse' }), /không có quyền/i);
  assert.equal(RewardReportService.isRewardLedger({ type: 'ar_bonus', refType: 'BONUS_ALLOWANCE' }), true);
  assert.equal(RewardReportService.isRewardLedger({ type: 'ar_receipt', refType: 'RECEIPT' }), false);
});


test('reward report returns only rewarded customers with summary and pagination metadata', async () => {
  const originalAggregate = ArLedger.aggregate;
  ArLedger.aggregate = () => ({
    allowDiskUse() { return this; },
    async exec() {
      return [
        { type: 'ar_bonus', refType: 'BONUS_ALLOWANCE', customerCode: 'KH01', customerName: 'Nhà A', date: '2026-06-03', _reportBusinessDate: '2026-06-03', orderCode: 'SO1', credit: 120000 },
        { type: 'ar_bonus', refType: 'BONUS_ALLOWANCE', customerCode: 'KH02', customerName: 'Nhà B', date: '2026-06-04', _reportBusinessDate: '2026-06-04', orderCode: 'SO2', credit: 80000 },
        { type: 'ar_receipt', refType: 'RECEIPT', customerCode: 'KH03', customerName: 'Nhà C', date: '2026-06-04', _reportBusinessDate: '2026-06-04', credit: 90000 }
      ];
    }
  });

  try {
    const result = await RewardReportService.rewardByCustomerReport({
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      q: 'Nhà',
      page: 1,
      limit: 1
    });
    assert.equal(result.source, 'mongo_ar_ledgers_bonus');
    assert.equal(result.summary.customerCount, 2);
    assert.equal(result.summary.totalRewardAmount, 200000);
    assert.equal(result.meta.total, 2);
    assert.equal(result.meta.totalPages, 2);
    assert.equal(result.rewards.length, 1);
    assert.equal(result.rewards[0].customerCode, 'KH01');
  } finally {
    ArLedger.aggregate = originalAggregate;
  }
});
