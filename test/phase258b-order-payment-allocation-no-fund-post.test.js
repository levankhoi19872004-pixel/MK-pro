'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function modulePath(relativePath) {
  return require.resolve(path.join(ROOT, relativePath));
}

function installStub(relativePath, exportsValue) {
  const filename = modulePath(relativePath);
  const previous = require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports: exportsValue };
  return () => {
    if (previous) require.cache[filename] = previous;
    else delete require.cache[filename];
  };
}

function chain(row) {
  return {
    lean: () => row
  };
}

function allocationFixture() {
  return {
    allocationCode: 'OPA-B0039532',
    idempotencyKey: 'OPA-B0039532-V1',
    orderId: 'SO-B0039532',
    orderCode: 'B0039532',
    sourceId: 'SO-B0039532',
    sourceCode: 'B0039532',
    customerCode: 'C001',
    customerName: 'Customer',
    deliveryDate: '2026-07-14',
    deliveryStaffCode: 'ghth',
    deliveryStaffName: 'GH Thanh',
    salesStaffCode: 'NV01',
    salesStaffName: 'NV Ban',
    receivableAmount: 1500000,
    cashAmount: 1000000,
    bankAmount: 500000,
    rewardAmount: 0,
    returnAmount: 0,
    rawDebtAmount: 0,
    normalizedDebtAmount: 0,
    debtAmount: 0,
    zeroTolerance: 1000,
    zeroToleranceApplied: false,
    zeroToleranceAdjustmentAmount: 0,
    status: 'posted'
  };
}

test('Phase258B: postAllocation writes allocation and AR only, never FUND:OPA', async () => {
  const fundCalls = [];
  const arCalls = [];
  const restores = [
    installStub('src/models/OrderPaymentAllocation.js', {
      findOneAndUpdate: (_filter, update) => chain({ ...allocationFixture(), ...(update.$set || {}) })
    }),
    installStub('src/repositories/paymentRepository.js', {
      findAll: async () => []
    }),
    installStub('src/services/arPosting.service.js', {
      postArLedgerEntry: async (row) => {
        arCalls.push(row);
        return { ...row, id: `AR-${arCalls.length}` };
      }
    }),
    installStub('src/services/fundService.js', {
      postFundLedger: async (row) => {
        fundCalls.push(row);
        return { ledger: row };
      }
    })
  ];
  const servicePath = modulePath('src/services/accounting/OrderPaymentAllocationService.js');
  const previous = require.cache[servicePath];
  delete require.cache[servicePath];
  try {
    const service = require(servicePath);
    const result = await service.postAllocation(allocationFixture(), {
      existingArLedgerByIdempotencyKey: new Map(),
      actor: 'accountant'
    });
    assert.equal(result.allocation.status, 'posted');
    assert.ok(arCalls.length > 0);
    assert.equal(fundCalls.length, 0);
    assert.deepEqual(result.fundLedgers, []);
    assert.equal(result.fundPostingPolicy, 'deferred_to_delivery_remittance');
    assert.equal(result.fundPostingDeferred, true);

    await assert.rejects(
      () => service.postFundLedgersFromAllocation(allocationFixture(), {}),
      (error) => error && error.code === service.OPA_FUND_POSTING_RETIRED_CODE
    );
  } finally {
    delete require.cache[servicePath];
    if (previous) require.cache[servicePath] = previous;
    restores.reverse().forEach((fn) => fn());
  }
});

test('Phase258B: backfill repair flag for FUND:OPA is retired fail-closed', () => {
  const script = require('../scripts/backfill-order-payment-allocations');
  assert.throws(
    () => script.parseArgs(['--apply', '--fix-missing-fund-ledgers']),
    (error) => error && error.code === 'ORDER_PAYMENT_ALLOCATION_FUND_POSTING_RETIRED'
  );
});

test('Phase258B: AccountingCloseoutService marks fund posting deferred to delivery remittance', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/accounting/AccountingCloseoutService.js'), 'utf8');
  assert.match(source, /cashFundPathUsed:\s*false/);
  assert.match(source, /bankFundPathUsed:\s*false/);
  assert.match(source, /fundPostingPolicy:\s*'deferred_to_delivery_remittance'/);
  assert.match(source, /fundPostingOwner:\s*'DELIVERY_CASH_SUBMISSION'/);
  assert.match(source, /fundSatisfied:\s*true/);
  assert.match(source, /fundPosted:\s*false/);
  assert.doesNotMatch(source, /fundSatisfied:[\s\S]{0,180}allocationResult\.fundLedgers/);
});
