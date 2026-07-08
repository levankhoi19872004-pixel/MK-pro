'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const BatchRepair = require('../scripts/backfill-order-payment-allocations');
const OrderPaymentAllocationService = require('../src/services/accounting/OrderPaymentAllocationService');

function buildB0038757Allocation() {
  return OrderPaymentAllocationService.buildAllocationFromCloseout({
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
    returnedAmount: 0,
    finalDebtAmount: 48697883,
    status: 'accounting_confirmed',
    version: 1
  }, {
    actor: 'test',
    sourceType: 'delivery_closeout',
    sourceId: 'SO-B0038757',
    sourceCode: 'B0038757',
    sourceVersion: 1,
    idempotencyKey: 'OPA:B0038757:delivery_closeout:SO-B0038757:v1',
    closeoutScopeHash: 'batch-test'
  });
}

test('batch repair CLI supports date/staff/customer filters and dry-run default', () => {
  const options = BatchRepair.parseArgs([
    '--from', '2026-07-01',
    '--to', '2026-07-07',
    '--delivery', 'ghth',
    '--salesman', '33955',
    '--customer', '4501102',
    '--batch-size', '50',
    '--limit', '1000',
    '--only-missing-reward-ledgers',
    '--json'
  ]);

  assert.equal(options.apply, false);
  assert.equal(options.dateFrom, '2026-07-01');
  assert.equal(options.dateTo, '2026-07-07');
  assert.equal(options.deliveryStaffCode, 'ghth');
  assert.equal(options.salesStaffCode, '33955');
  assert.equal(options.customerCode, '4501102');
  assert.equal(options.batchSize, 50);
  assert.equal(options.limit, 1000);
  assert.equal(options.onlyMissingRewardLedgers, true);
  assert.equal(options.json, true);
});

test('batch repair filter is scoped and does not scan cancelled/deleted orders', () => {
  const filter = BatchRepair.buildOrderFilter({ dateFrom: '2026-07-01', dateTo: '2026-07-07', deliveryStaffCode: 'ghth' });
  const serialized = JSON.stringify(filter);
  assert.match(serialized, /deliveryDate/);
  assert.match(serialized, /ghth/);
  assert.match(serialized, /cancelled/);
  assert.match(serialized, /deleted/);
});

test('batch repair detects reward ledger by deterministic idempotency and will not use fund ledger for reward', () => {
  const allocation = buildB0038757Allocation();
  const arRows = OrderPaymentAllocationService.buildArLedgerRows(allocation);
  const reward = arRows.find((row) => row.category === 'AR-REWARD-ALLOWANCE');
  const sale = arRows.find((row) => row.category === 'AR-SALE');

  assert.ok(reward, 'must have reward AR row');
  assert.equal(reward.credit, 1855000);
  assert.equal(reward.debit, 0);
  assert.match(reward.idempotencyKey, /AR-REWARD-ALLOWANCE/);
  assert.match(sale.idempotencyKey, /AR-SALE/);

  const fundRows = BatchRepair.expectedFundRows(allocation);
  assert.equal(fundRows.length, 0, 'rewardAmount must not create fundLedger rows');
});

test('batch repair only cash and bank create fund ledger expectations', () => {
  const allocation = OrderPaymentAllocationService.buildAllocationFromCloseout({
    id: 'SO-CASH-BANK',
    code: 'B-CASH-BANK',
    customerCode: 'C001',
    deliveryDate: '2026-07-03',
    totalAmount: 1000000
  }, {
    originalAmount: 1000000,
    cashAmount: 100000,
    bankAmount: 200000,
    rewardAmount: 300000,
    returnAmount: 0,
    finalDebtAmount: 400000,
    version: 1
  }, {
    actor: 'test',
    sourceId: 'SO-CASH-BANK',
    sourceCode: 'B-CASH-BANK',
    idempotencyKey: 'OPA:B-CASH-BANK:delivery_closeout:SO-CASH-BANK:v1',
    closeoutScopeHash: 'batch-fund-test'
  });

  const fundRows = BatchRepair.expectedFundRows(allocation);
  assert.equal(fundRows.length, 2);
  assert.deepEqual(fundRows.map((row) => row.fundType).sort(), ['bank', 'cash']);
  assert.equal(fundRows.reduce((sum, row) => sum + row.amount, 0), 300000);
});

test('batch repair expected customer debt keeps reward deduction', () => {
  const b0038757 = buildB0038757Allocation();
  const b0038742Debt = 238328;
  const expectedCustomerDebt = b0038757.debtAmount + b0038742Debt;
  const wrongDebtWithoutReward = b0038757.receivableAmount + b0038742Debt;

  assert.equal(expectedCustomerDebt, 48936211);
  assert.equal(wrongDebtWithoutReward, 50791211);
  assert.notEqual(expectedCustomerDebt, wrongDebtWithoutReward);
});
