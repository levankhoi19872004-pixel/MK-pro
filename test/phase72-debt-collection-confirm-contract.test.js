'use strict';

const assert = require('node:assert/strict');
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

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function valueMatches(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (Object.prototype.hasOwnProperty.call(expected, '$in')) {
      return (expected.$in || []).some((item) => valueMatches(actual, item));
    }
  }
  return actual === expected;
}

function matches(row = {}, filter = {}) {
  return Object.entries(filter || {}).every(([key, expected]) => {
    if (key === '$or') return (expected || []).some((child) => matches(row, child));
    return valueMatches(row[key], expected);
  });
}

function makeDebtDoc(row, rows) {
  return {
    ...clone(row),
    async save() {
      const saved = { ...this };
      delete saved.save;
      const idx = rows.findIndex((item) => item.id === saved.id || item.code === saved.code);
      if (idx >= 0) rows[idx] = saved;
      else rows.push(saved);
      return this;
    }
  };
}

function queryDoc(doc) {
  return {
    session() { return this; },
    lean: async () => clone(doc),
    then(resolve, reject) { return Promise.resolve(doc).then(resolve, reject); }
  };
}

function collectionFixture(overrides = {}) {
  return {
    id: 'DC-TEST-001',
    code: 'DC-TEST-001',
    status: 'submitted',
    customerCode: '4501256',
    customerId: 'CUST-4501256',
    customerName: 'Chị Sen',
    amount: 4864000,
    paymentMethod: 'cash',
    collectorType: 'delivery',
    collectorCode: 'ghth',
    collectorName: 'Thành GH Tiền hải',
    salesStaffCode: '35095',
    salesStaffName: 'Nguyễn Đình Thành',
    deliveryStaffCode: 'ghth',
    deliveryStaffName: 'Thành GH Tiền hải',
    allocations: [{
      salesOrderId: 'SO178255038016695',
      salesOrderCode: 'B0038424',
      orderType: 'sales_order',
      allocatedAmount: 4864000,
      salesStaffCode: '35095',
      salesStaffName: 'Nguyễn Đình Thành',
      deliveryStaffCode: 'ghth',
      deliveryStaffName: 'Thành GH Tiền hải'
    }],
    accountingConfirmed: false,
    ...overrides
  };
}

function createHarness(initialRows = [collectionFixture()]) {
  const collectionRows = initialRows.map((row) => clone(row));
  const arCalls = [];
  const fundCalls = [];

  const DebtCollection = {
    findOne(filter = {}) {
      const found = collectionRows.find((row) => matches(row, filter));
      return queryDoc(found ? makeDebtDoc(found, collectionRows) : null);
    }
  };

  const restores = [
    installStub('src/models/DebtCollection.js', DebtCollection),
    installStub('src/models/DebtCollectionLock.js', { findOneAndUpdate: async () => ({}) }),
    installStub('src/models/ExternalDebtOrder.js', { findOneAndUpdate: async () => ({}) }),
    installStub('src/services/DebtReadService.js', {
      async checkAvailableDebt({ allocations }) {
        return {
          ok: true,
          customerCode: '4501256',
          customerId: 'CUST-4501256',
          customerName: 'Chị Sen',
          allocations: (allocations || []).map((row) => ({
            salesOrderId: row.salesOrderId,
            salesOrderCode: row.salesOrderCode,
            orderType: row.orderType || 'sales_order',
            allocatedAmount: Number(row.allocatedAmount || row.amount || 0),
            beforeDebt: Number(row.allocatedAmount || row.amount || 0),
            salesStaffCode: row.salesStaffCode || '35095',
            salesStaffName: row.salesStaffName || 'Nguyễn Đình Thành',
            deliveryStaffCode: row.deliveryStaffCode || 'ghth',
            deliveryStaffName: row.deliveryStaffName || 'Thành GH Tiền hải'
          }))
        };
      }
    }),
    installStub('src/domain/posting/ArPostingService.js', {
      async postReceipt(receipt = {}) {
        arCalls.push(clone(receipt));
        return {
          id: `AR-RECEIPT-${receipt.id}`,
          category: 'AR-RECEIPT',
          debit: 0,
          credit: Number(receipt.amount || 0),
          direction: 'credit',
          accountingConfirmed: true,
          accountingStatus: 'confirmed',
          status: 'posted',
          idempotencyKey: receipt.idempotencyKey
        };
      }
    }),
    installStub('src/domain/posting/FundPostingService.js', {
      async postCashIn(input = {}) {
        fundCalls.push(clone(input));
        return {
          id: `FUND-RECEIPT-${input.sourceId}`,
          direction: 'in',
          amount: Number(input.amount || 0),
          sourceType: input.sourceType,
          idempotencyKey: input.idempotencyKey,
          status: 'posted'
        };
      }
    }),
    installStub('src/utils/transaction.util.js', { withMongoTransaction: async (work) => work({ fakeSession: true }) })
  ];

  const servicePath = modulePath('src/services/DebtCollectionService.js');
  const previousService = require.cache[servicePath];
  delete require.cache[servicePath];
  const service = require(servicePath);

  return {
    service,
    collectionRows,
    arCalls,
    fundCalls,
    restore() {
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      restores.reverse().forEach((restore) => restore());
    }
  };
}

test('Phase72: confirm debt collection posts AR-RECEIPT credit and fund cash-in once', async () => {
  const h = createHarness();
  try {
    const result = await h.service.confirmDebtCollection('DC-TEST-001', { accountingUserName: 'Kế toán' });
    assert.equal(result.body.ok, true);
    assert.equal(h.arCalls.length, 1);
    assert.equal(h.fundCalls.length, 1);

    const receipt = h.arCalls[0];
    assert.equal(receipt.idempotencyKey, 'AR-RECEIPT:DC-TEST-001');
    assert.equal(receipt.amount, 4864000);
    assert.equal(receipt.customerCode, '4501256');
    assert.equal(receipt.sourceType, 'debtCollection');
    assert.equal(receipt.sourceId, 'DC-TEST-001');

    const fund = h.fundCalls[0];
    assert.equal(fund.idempotencyKey, 'FUND-RECEIPT:DC-TEST-001');
    assert.equal(fund.direction, undefined); // FundPostingService owns canonical direction='in'.
    assert.equal(fund.amount, 4864000);
    assert.equal(fund.sourceType, 'debtCollection');
    assert.equal(fund.sourceId, 'DC-TEST-001');

    const saved = h.collectionRows[0];
    assert.equal(saved.status, 'accounting_confirmed');
    assert.equal(saved.accountingStatus, 'confirmed');
    assert.equal(saved.accountingConfirmed, true);
    assert.equal(saved.arPosted, true);
    assert.equal(saved.fundPosted, true);
    assert.deepEqual(saved.arLedgerIds, ['AR-RECEIPT-DC-TEST-001']);
    assert.deepEqual(saved.fundLedgerIds, ['FUND-RECEIPT-DC-TEST-001']);
  } finally {
    h.restore();
  }
});

test('Phase72: confirming an already confirmed collection is idempotent and does not duplicate postings', async () => {
  const h = createHarness();
  try {
    await h.service.confirmDebtCollection('DC-TEST-001', { accountingUserName: 'Kế toán' });
    const again = await h.service.confirmDebtCollection('DC-TEST-001', { accountingUserName: 'Kế toán' });

    assert.equal(again.body.ok, true);
    assert.equal(again.body.skipped, true);
    assert.equal(h.arCalls.length, 1);
    assert.equal(h.fundCalls.length, 1);
    assert.equal(h.collectionRows[0].amount, 4864000);
  } finally {
    h.restore();
  }
});

test('Phase72: missing postReceipt contract fails loudly instead of silently skipping AR-RECEIPT', async () => {
  const collectionRows = [collectionFixture()];
  const DebtCollection = {
    findOne(filter = {}) {
      const found = collectionRows.find((row) => matches(row, filter));
      return queryDoc(found ? makeDebtDoc(found, collectionRows) : null);
    }
  };
  const restores = [
    installStub('src/models/DebtCollection.js', DebtCollection),
    installStub('src/models/DebtCollectionLock.js', { findOneAndUpdate: async () => ({}) }),
    installStub('src/models/ExternalDebtOrder.js', { findOneAndUpdate: async () => ({}) }),
    installStub('src/services/DebtReadService.js', { async checkAvailableDebt() { return { ok: true, allocations: [] }; } }),
    installStub('src/domain/posting/ArPostingService.js', {}),
    installStub('src/domain/posting/FundPostingService.js', { async postCashIn() { return {}; } }),
    installStub('src/utils/transaction.util.js', { withMongoTransaction: async (work) => work(null) })
  ];
  const servicePath = modulePath('src/services/DebtCollectionService.js');
  const previousService = require.cache[servicePath];
  delete require.cache[servicePath];
  const service = require(servicePath);
  try {
    await assert.rejects(
      () => service.confirmDebtCollection('DC-TEST-001', { accountingUserName: 'Kế toán' }),
      /ArPostingService\.postReceipt contract is required/
    );
  } finally {
    delete require.cache[servicePath];
    if (previousService) require.cache[servicePath] = previousService;
    restores.reverse().forEach((restore) => restore());
  }
});
