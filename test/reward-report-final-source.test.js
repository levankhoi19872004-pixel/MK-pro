'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const rewardResolver = require('../src/services/reports/rewardReportSourceResolver');
const RewardReportService = require('../src/services/reports/RewardReportService');
const orderRepository = require('../src/repositories/orderRepository');
const DeliveryCloseoutVersion = require('../src/models/DeliveryCloseoutVersion');
const OrderPaymentAllocation = require('../src/models/OrderPaymentAllocation');

function mockFind(model, rows) {
  const original = model.find;
  model.find = () => ({
    sort() { return this; },
    limit() { return this; },
    session() { return this; },
    lean: async () => rows
  });
  return () => { model.find = original; };
}

test('reward resolver prefers current orderPaymentAllocation reward over legacy order fields', () => {
  const resolved = rewardResolver.resolveRewardSource({
    order: { id: 'SO1', code: 'B001', rewardAmount: 0, deliveryCloseout: { rewardAmount: 0 } },
    latestCloseoutVersion: null,
    currentPaymentAllocation: { orderId: 'SO1', allocationCode: 'OPA1', isCurrent: true, sourceVersion: 2, rewardAmount: 255000 }
  });
  assert.equal(resolved.rewardAmount, 255000);
  assert.equal(resolved.rewardSource, 'orderPaymentAllocations.current.rewardAmount');
  assert.equal(resolved.rewardSourcePriority, 1);
});

test('reward resolver uses latest deliveryCloseoutVersion when order closeout is missing reward', () => {
  const resolved = rewardResolver.resolveRewardSource({
    order: { id: 'SO2', code: 'B002', deliveryCloseout: { rewardAmount: 0 } },
    latestCloseoutVersion: { orderId: 'SO2', closeoutVersion: 3, rewardAmount: 848000 },
    currentPaymentAllocation: null
  });
  assert.equal(resolved.rewardAmount, 848000);
  assert.equal(resolved.rewardSource, 'deliveryCloseoutVersions.latest.rewardAmount');
  assert.equal(resolved.rewardSourcePriority, 2);
});

test('reward resolver ignores stale allocation and does not double count version reward', () => {
  const resolved = rewardResolver.resolveRewardSource({
    order: { id: 'SO3', code: 'B003', deliveryCloseout: { rewardAmount: 0 } },
    latestCloseoutVersion: { orderId: 'SO3', closeoutVersion: 3, rewardAmount: 300000 },
    currentPaymentAllocation: { orderId: 'SO3', allocationCode: 'OPA-OLD', isCurrent: false, sourceVersion: 2, rewardAmount: 500000 }
  });
  assert.equal(resolved.rewardAmount, 300000);
  assert.equal(resolved.rewardSource, 'deliveryCloseoutVersions.latest.rewardAmount');
  assert.ok(resolved.warnings.some((warning) => warning.code === 'STALE_ORDER_PAYMENT_ALLOCATION_IGNORED'));
});

test('reward report reads canonical final reward source and returns truthful source note', async () => {
  const originalFindAll = orderRepository.findAll;
  const restoreVersions = mockFind(DeliveryCloseoutVersion, [
    { orderId: 'SO-VERSION', orderCode: 'B002', closeoutVersion: 2, rewardAmount: 848000, createdAt: '2026-07-08' }
  ]);
  const restoreAllocations = mockFind(OrderPaymentAllocation, [
    { orderId: 'SO-ALLOC', orderCode: 'B001', allocationCode: 'OPA1', isCurrent: true, sourceVersion: 1, rewardAmount: 255000, postedAt: '2026-07-08' },
    { orderId: 'SO-STALE', orderCode: 'B003', allocationCode: 'OPA-OLD', isCurrent: false, sourceVersion: 1, rewardAmount: 500000, postedAt: '2026-07-08' }
  ]);
  orderRepository.findAll = async () => [
    { id: 'SO-ALLOC', code: 'B001', customerCode: 'KH01', customerName: 'Khách 1', deliveryDate: '2026-07-08', accountingConfirmed: true, rewardAmount: 0, deliveryCloseout: { rewardAmount: 0 } },
    { id: 'SO-VERSION', code: 'B002', customerCode: 'KH02', customerName: 'Khách 2', deliveryDate: '2026-07-08', accountingConfirmed: true, deliveryCloseout: { rewardAmount: 0 } },
    { id: 'SO-STALE', code: 'B003', customerCode: 'KH03', customerName: 'Khách 3', deliveryDate: '2026-07-08', accountingConfirmed: true, deliveryCloseout: { rewardAmount: 1000 } }
  ];

  try {
    const result = await RewardReportService.rewardByCustomerReport({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      __allowDisconnectedSecondaryReads: true
    });
    assert.equal(result.source, 'reward_final_state_current');
    assert.equal(result.summary.customerCount, 3);
    assert.equal(result.summary.totalRewardAmount, 255000 + 848000 + 1000);
    assert.ok(result.sourceInfo.rewardSources.includes('orderPaymentAllocations.current'));
    assert.ok(result.sourceInfo.rewardSources.includes('deliveryCloseoutVersions.latest'));
    assert.ok(result.sourceBreakdown.rewardPolicy.priority.includes('orderPaymentAllocations.current.rewardAmount'));
    const kh01 = result.rewards.find((row) => row.customerCode === 'KH01');
    assert.equal(kh01.totalRewardAmount, 255000);
    assert.equal(kh01.latestRewardSourceField, 'orderPaymentAllocations.current.rewardAmount');
  } finally {
    orderRepository.findAll = originalFindAll;
    restoreVersions();
    restoreAllocations();
  }
});
