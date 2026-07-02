'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../src/services/reports/ReportSourceRegistry');
const ReportCenterService = require('../src/services/reports/ReportCenterService');
const orderRepository = require('../src/repositories/orderRepository');

test('rewards-by-customer registry uses orders delivery closeout as canonical source', () => {
  const contract = registry.getReportSourceContract('rewards-by-customer');
  assert.deepEqual(contract.primaryCollections, ['orders']);
  assert.equal(contract.primaryCollections.includes('arLedgers'), false);
  assert.ok(contract.secondaryCollections.includes('deliveryCloseoutVersions'));
  assert.ok(contract.forbiddenCollections.includes('arLedgers'));
  assert.equal(contract.service, 'RewardReportService.rewardByCustomerReport');
  assert.equal(contract.exportService, 'ReportCenterService.run');
  assert.match(contract.sourceLabel, /salesOrders\.deliveryCloseout|orders/i);
  assert.match(contract.ssotRule, /deliveryCloseout\.rewardAmount|reward\/offset/i);
  assert.match(contract.amountSource, /orders\.deliveryCloseout\.rewardAmount/);
});

test('rewards-by-customer sourceNote mirrors registry and does not expose AR as primary source', async () => {
  const originalFindAll = orderRepository.findAll;
  orderRepository.findAll = async () => [
    { code: 'SO-RW-1', customerCode: 'KH01', customerName: 'Nhà A', deliveryDate: '2026-07-02', accountingConfirmed: true, deliveryCloseout: { rewardAmount: 100000, confirmedAt: '2026-07-02' } }
  ];

  try {
    const result = await ReportCenterService.run('rewards-by-customer', {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      limit: 10
    }, { role: 'admin', name: 'Tester' });
    assert.equal(result.sourceNote.reportCode, 'rewards-by-customer');
    assert.deepEqual(result.sourceNote.primaryCollections, ['orders']);
    assert.equal(result.sourceNote.primaryCollections.includes('arLedgers'), false);
    assert.match(result.sourceNote.sourceLabel, /deliveryCloseout|reward/i);
    assert.equal(result.sourceNote.viewAndExportSameSource, true);
    assert.equal(result.sourceNote.sourceStatus, 'OK');
    assert.equal(result.summary.totalRewardAmount, 100000);
  } finally {
    orderRepository.findAll = originalFindAll;
  }
});
