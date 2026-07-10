'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const RewardReportService = require('../src/services/reports/RewardReportService');
const orderRepository = require('../src/repositories/orderRepository');
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

test('reward customer report aggregates positive reward fields from accounting-confirmed orders', () => {
  const rows = RewardReportService.aggregateRewardCustomers([
    {
      code: 'SO1', customerCode: 'KH01', customerName: 'Nhà A', salesStaffCode: 'NV01', salesStaffName: 'An',
      deliveryStaffCode: 'GH01', deliveryStaffName: 'Giao 1', deliveryDate: '2026-06-02', accountingConfirmed: true,
      deliveryCloseout: { rewardAmount: 100000, confirmedAt: '2026-06-02' }
    },
    {
      code: 'SO2', customerCode: 'KH01', customerName: 'Nhà A', salesStaffCode: 'NV01', salesStaffName: 'An',
      deliveryDate: '2026-06-05', accountingStatus: 'confirmed', rewardAmount: 50000
    },
    {
      code: 'SO3', customerCode: 'KH02', customerName: 'Nhà B', deliveryDate: '2026-06-06', accountingConfirmed: true,
      cashAmount: 90000
    },
    {
      code: 'SO4', customerCode: 'KH03', customerName: 'Nhà C', deliveryDate: '2026-06-07', accountingConfirmed: true,
      deliveryCloseout: { rewardAmount: 0 }
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

test('reward report is visible only to business roles and sourced from order delivery closeout', () => {
  const adminCodes = ReportCenterService.catalog({ role: 'admin' }).reports.map((row) => row.code);
  assert.ok(adminCodes.includes('rewards-by-customer'));
  assert.throws(() => ReportCenterService.assertAccess('rewards-by-customer', { role: 'warehouse' }), /không có quyền/i);
  assert.equal(RewardReportService.rewardAmountOf({ deliveryCloseout: { rewardAmount: 1000 } }), 1000);
  assert.equal(RewardReportService.rewardAmountOf({ rewardAmount: 0, cashAmount: 9000 }), 0);
});


test('reward report returns only rewarded customers with summary and pagination metadata', async () => {
  const originalFindAll = orderRepository.findAll;
  orderRepository.findAll = async () => [
    { code: 'SO1', customerCode: 'KH01', customerName: 'Nhà A', deliveryDate: '2026-06-03', accountingConfirmed: true, rewardAmount: 120000 },
    { code: 'SO2', customerCode: 'KH02', customerName: 'Nhà B', deliveryDate: '2026-06-04', accountingStatus: 'confirmed', deliveryCloseout: { rewardAmount: 80000 } },
    { code: 'SO3', customerCode: 'KH03', customerName: 'Nhà C', deliveryDate: '2026-06-04', accountingConfirmed: true, cashAmount: 90000 }
  ];

  try {
    const result = await RewardReportService.rewardByCustomerReport({
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      q: 'Nhà',
      page: 1,
      limit: 1
    });
    assert.equal(result.source, 'reward_final_state_current');
    assert.equal(result.rewardCollection, 'orders');
    assert.equal(result.summary.customerCount, 2);
    assert.equal(result.summary.totalRewardAmount, 200000);
    assert.equal(result.meta.total, 2);
    assert.equal(result.meta.totalPages, 2);
    assert.equal(result.rewards.length, 1);
    assert.equal(result.rewards[0].customerCode, 'KH01');
  } finally {
    orderRepository.findAll = originalFindAll;
  }
});
