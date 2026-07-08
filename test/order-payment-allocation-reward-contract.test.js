'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const OrderPaymentAllocationService = require('../src/services/accounting/OrderPaymentAllocationService');

function balanceFromRows(rows = []) {
  return rows.reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0);
}

test('B0038757 reward allowance is allocated and posted as AR credit', () => {
  const allocation = OrderPaymentAllocationService.buildAllocationFromCloseout({
    id: 'SO-B0038757',
    code: 'B0038757',
    customerCode: '4501102',
    customerName: 'Tuấn Anh',
    salesStaffCode: '33955',
    salesStaffName: 'Đỗ Thị Mừng',
    deliveryStaffCode: 'ghth',
    deliveryStaffName: 'Thành GH Tiền hải',
    deliveryDate: '2026-07-03',
    totalAmount: 50552883
  }, {
    originalAmount: 50552883,
    cashAmount: 0,
    bankAmount: 0,
    rewardAmount: 1855000,
    offsetAmount: 1855000,
    returnedAmount: 0,
    finalDebtAmount: 48697883,
    status: 'accounting_confirmed',
    version: 1
  }, {
    actor: 'test',
    closeoutScopeHash: 'unit-test-scope'
  });

  assert.equal(allocation.receivableAmount, 50552883);
  assert.equal(allocation.cashAmount, 0);
  assert.equal(allocation.bankAmount, 0);
  assert.equal(allocation.rewardAmount, 1855000);
  assert.equal(allocation.returnAmount, 0);
  assert.equal(allocation.debtAmount, 48697883);

  const rows = OrderPaymentAllocationService.buildArLedgerRows(allocation);
  const sale = rows.find((row) => row.category === 'AR-SALE');
  const reward = rows.find((row) => row.category === 'AR-REWARD-ALLOWANCE');
  assert.ok(sale, 'must create AR-SALE debit row');
  assert.ok(reward, 'must create AR-REWARD-ALLOWANCE credit row');
  assert.equal(sale.debit, 50552883);
  assert.equal(sale.credit, 0);
  assert.equal(reward.debit, 0);
  assert.equal(reward.credit, 1855000);
  assert.equal(balanceFromRows(rows), 48697883);
});

test('customer debt total uses allocation debt and does not ignore reward amount', () => {
  const b0038757Debt = 48697883;
  const b0038742Debt = 238328;
  const expectedCustomerDebt = b0038757Debt + b0038742Debt;
  const wrongDebtWithoutReward = 50552883 + b0038742Debt;

  assert.equal(expectedCustomerDebt, 48936211);
  assert.notEqual(expectedCustomerDebt, wrongDebtWithoutReward);
  assert.equal(wrongDebtWithoutReward, 50791211);
});

test('allocation invariant rejects missing reward deduction', () => {
  assert.throws(() => OrderPaymentAllocationService.validateAllocation({
    allocationCode: 'OPA-BAD',
    orderId: 'SO-BAD',
    orderCode: 'B-BAD',
    customerCode: '4501102',
    sourceType: 'delivery_closeout',
    sourceId: 'SO-BAD',
    sourceVersion: 1,
    receivableAmount: 50552883,
    cashAmount: 0,
    bankAmount: 0,
    rewardAmount: 1855000,
    returnAmount: 0,
    debtAmount: 50552883,
    idempotencyKey: 'OPA:SO-BAD:delivery_closeout:test:v1'
  }), /Sai invariant phân bổ thanh toán/);
});

test('allocation builder keeps legacy cash transfer reward aliases connected', () => {
  const allocation = OrderPaymentAllocationService.buildAllocationFromCloseout({
    id: 'SO-ALIAS-1',
    code: 'B-ALIAS-1',
    customerCode: 'C001',
    customerName: 'Alias Customer',
    totalAmount: 1000000,
    deliveryDate: '2026-07-03'
  }, {
    originalAmount: 1000000,
    cashCollectedAmount: 100000,
    transferAmount: 200000,
    rewardOffsetAmount: 300000,
    actualReturnAmount: 50000,
    finalDebtAmount: 350000,
    status: 'accounting_confirmed',
    version: 1
  }, {
    actor: 'test',
    closeoutScopeHash: 'alias-scope'
  });

  assert.equal(allocation.cashAmount, 100000);
  assert.equal(allocation.bankAmount, 200000);
  assert.equal(allocation.rewardAmount, 300000);
  assert.equal(allocation.returnAmount, 50000);
  assert.equal(allocation.debtAmount, 350000);
  assert.equal(balanceFromRows(OrderPaymentAllocationService.buildArLedgerRows(allocation)), 350000);
});
