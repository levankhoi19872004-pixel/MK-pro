'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const searchServicePath = require.resolve(path.join(__dirname, '..', 'src/services/searchService.js'));
const previousSearchService = require.cache[searchServicePath];
require.cache[searchServicePath] = {
  id: searchServicePath,
  filename: searchServicePath,
  loaded: true,
  exports: { async searchStaffs() { return []; } }
};

const debtNew = require('../src/services/v2/debtNew.service');
const arLedgerRead = require('../src/services/arLedgerRead.service');
const mobileAdapter = require('../src/services/mobile/mobileDebtNewAdapter.service');
const { FakeModel } = require('./helpers/phase79FakeModels');

test.after(() => {
  if (previousSearchService) require.cache[searchServicePath] = previousSearchService;
  else delete require.cache[searchServicePath];
});

function ledger({
  id,
  orderId,
  orderCode,
  customerCode,
  customerName,
  category = 'AR-DEBT-OPEN',
  debit = 0,
  credit = 0,
  salesStaffCode = '33949',
  salesStaffName = 'Đỗ Thị Anh',
  deliveryStaffCode = 'ghtp',
  deliveryStaffName = 'Hiếu Giao Hàng TP',
  date = '2026-08-03',
  sourceType
}) {
  const side = debit > 0 ? 'debit' : 'credit';
  return {
    id,
    code: id,
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    sourceType: sourceType || (category === 'AR-DEBT-OPEN' ? 'SALES_ORDER_DELIVERY_CLOSEOUT' : 'ORDER_PAYMENT_ALLOCATION'),
    sourceId: orderId,
    sourceCode: orderCode,
    orderId,
    orderCode,
    salesOrderId: orderId,
    salesOrderCode: orderCode,
    refType: category === 'AR-RECEIPT' ? 'debtCollection' : 'salesOrder',
    refId: category === 'AR-RECEIPT' ? `DC-${id}` : orderId,
    refCode: category === 'AR-RECEIPT' ? `DC-${id}` : orderCode,
    customerCode,
    customerName,
    salesStaffCode,
    salesStaffName,
    deliveryStaffCode,
    deliveryStaffName,
    debit,
    credit,
    amount: debit || credit,
    direction: side,
    amountField: side,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: false,
    deleted: false,
    isDeleted: false,
    status: 'posted',
    idempotencyKey: `${category}:${id}`,
    date,
    createdAt: `${date}T08:00:00.000Z`,
    source: category === 'AR-RECEIPT' ? 'DebtCollectionPostingService' : 'phase261-test'
  };
}

function emptyModel() {
  return new FakeModel([]);
}

function install(rows, collections = []) {
  debtNew.setModelsForTest({
    ArLedger: new FakeModel(rows),
    DebtCollection: new FakeModel(collections),
    OrderPaymentAllocation: emptyModel()
  });
}

test.afterEach(() => debtNew.setModelsForTest(null));

test('Phase261 exact NVBH scope includes customer whose opening ledger is beyond old 500-row window', async () => {
  const rows = [];
  for (let index = 0; index < 500; index += 1) {
    rows.push(ledger({
      id: `AR-FILL-${index}`,
      orderId: `SO-FILL-${index}`,
      orderCode: `B-FILL-${index}`,
      customerCode: `C-FILL-${index}`,
      customerName: `Khách phụ ${index}`,
      debit: 500
    }));
  }
  rows.push(ledger({
    id: 'AR-TAM-THANH-OPEN',
    orderId: 'SO-TAM-THANH-1',
    orderCode: 'B-TAM-THANH-1',
    customerCode: '5052877',
    customerName: 'Tâm Thành Mart',
    debit: 33905545
  }));
  rows.push(ledger({
    id: 'AR-TAM-THANH-RECEIPT',
    orderId: 'SO-TAM-THANH-1',
    orderCode: 'B-TAM-THANH-1',
    customerCode: '5052877',
    customerName: 'Tâm Thành Mart',
    category: 'AR-RECEIPT',
    credit: 2141542,
    salesStaffCode: '',
    salesStaffName: '',
    deliveryStaffCode: '',
    deliveryStaffName: ''
  }));
  install(rows);

  const result = await debtNew.listCustomers({
    salesStaffCode: '33949',
    status: 'open',
    customerLimit: 500
  });

  const customer = result.customers.find((row) => row.customerCode === '5052877');
  assert.ok(customer, 'Tâm Thành Mart must remain in exact NVBH scope');
  assert.equal(customer.debit, 33905545);
  assert.equal(customer.credit, 2141542);
  assert.equal(customer.debtAmount, 31764003);
  assert.equal(customer.salesStaffCode, '33949');
  assert.equal(customer.deliveryStaffCode, 'ghtp');
  assert.equal(result.summary.totalDebt, 31764003);
  assert.equal(result.summary.truncatedWorkingSet, false);
  assert.equal(result.summary.rawLedgerLimitApplied, false);
  assert.equal(result.diagnostics.scope.exactScope, true);
  assert.equal(result.diagnostics.scope.filterBeforeAggregation, false);
  assert.equal(result.diagnostics.performance.boundedLedgerRead, false);
  assert.equal(result.diagnostics.performance.ledgerRowsRead, 502);
});

test('Phase261 exact NVGH scope keeps the full order balance when receipt ledgers have no staff assignment', async () => {
  const rows = [
    ledger({
      id: 'AR-NVGH-OPEN',
      orderId: 'SO-NVGH-1',
      orderCode: 'B-NVGH-1',
      customerCode: '5052877',
      customerName: 'Tâm Thành Mart',
      debit: 33905545,
      salesStaffCode: '33949',
      deliveryStaffCode: 'ghtp',
      deliveryStaffName: 'Hiếu Giao Hàng TP'
    }),
    ledger({
      id: 'AR-NVGH-RECEIPT',
      orderId: 'SO-NVGH-1',
      orderCode: 'B-NVGH-1',
      customerCode: '5052877',
      customerName: 'Tâm Thành Mart',
      category: 'AR-RECEIPT',
      credit: 2141542,
      salesStaffCode: '',
      salesStaffName: '',
      deliveryStaffCode: '',
      deliveryStaffName: ''
    })
  ];
  install(rows);

  const result = await debtNew.listCustomers({
    deliveryStaffCode: 'ghtp',
    status: 'open'
  });

  assert.equal(result.customers.length, 1);
  assert.equal(result.customers[0].customerCode, '5052877');
  assert.equal(result.customers[0].deliveryStaffCode, 'ghtp');
  assert.equal(result.customers[0].debit, 33905545);
  assert.equal(result.customers[0].credit, 2141542);
  assert.equal(result.customers[0].debtAmount, 31764003);
  assert.equal(result.summary.totalDebt, 31764003);
});

test('Phase261 rejected mobile debt collection does not hide the customer or reduce collectible debt', async () => {
  const rows = [
    ledger({
      id: 'AR-REJECTED-COLLECTION-OPEN',
      orderId: 'SO-REJECTED-COLLECTION-1',
      orderCode: 'B-REJECTED-COLLECTION-1',
      customerCode: '5052877',
      customerName: 'Tâm Thành Mart',
      debit: 5000000,
      salesStaffCode: '33949',
      deliveryStaffCode: 'ghtp'
    })
  ];
  const rejectedCollections = [{
    id: 'DC-REJECTED-1',
    code: 'DC-REJECTED-1',
    status: 'rejected',
    amount: 2000000,
    allocations: [{ orderId: 'SO-REJECTED-COLLECTION-1', orderCode: 'B-REJECTED-COLLECTION-1', allocatedAmount: 2000000 }]
  }];
  install(rows, rejectedCollections);

  const result = await debtNew.listCustomers({ salesStaffCode: '33949', status: 'open' });
  assert.equal(result.customers.length, 1);
  assert.equal(result.customers[0].customerCode, '5052877');
  assert.equal(result.customers[0].debtAmount, 5000000);
  assert.equal(result.customers[0].pendingCollectedAmount, 0);
  assert.equal(result.customers[0].availableToCollect, 5000000);
  assert.equal(result.customers[0].collectionLocked, false);
});

test('Phase261 staff filter is applied to canonical order owner, not to an isolated payment ledger', async () => {
  const rows = [
    ledger({
      id: 'AR-OPEN-OWNER-2',
      orderId: 'SO-OWNER-2',
      orderCode: 'B-OWNER-2',
      customerCode: 'C-OWNER-2',
      customerName: 'Khách NV2',
      debit: 5000000,
      salesStaffCode: 'NV2',
      salesStaffName: 'Nhân viên 2'
    }),
    ledger({
      id: 'AR-PAYMENT-WRONG-NV1',
      orderId: 'SO-OWNER-2',
      orderCode: 'B-OWNER-2',
      customerCode: 'C-OWNER-2',
      customerName: 'Khách NV2',
      category: 'AR-DEBT-PAYMENT',
      credit: 1000000,
      salesStaffCode: 'NV1',
      salesStaffName: 'Nhân viên 1'
    })
  ];
  install(rows);

  const nv1 = await debtNew.listCustomers({ salesStaffCode: 'NV1', status: 'all' });
  const nv2 = await debtNew.listCustomers({ salesStaffCode: 'NV2', status: 'all' });

  assert.equal(nv1.customers.length, 0, 'wrong staff on a payment row must not steal order ownership');
  assert.equal(nv2.customers.length, 1);
  assert.equal(nv2.customers[0].debtAmount, 4000000);
  assert.equal(nv2.customers[0].salesStaffCode, 'NV2');
  assert.equal(nv2.summary.staffOwnershipConflictOrderCount, 1);
});

test('Phase261 customer pagination is applied after full order/customer aggregation', async () => {
  const rows = [];
  for (let index = 1; index <= 3; index += 1) {
    rows.push(ledger({
      id: `AR-OPEN-PAGE-${index}`,
      orderId: `SO-PAGE-${index}`,
      orderCode: `B-PAGE-${index}`,
      customerCode: `C-PAGE-${index}`,
      customerName: `Khách ${index}`,
      debit: index * 1000000
    }));
    rows.push(ledger({
      id: `AR-RECEIPT-PAGE-${index}`,
      orderId: `SO-PAGE-${index}`,
      orderCode: `B-PAGE-${index}`,
      customerCode: `C-PAGE-${index}`,
      customerName: `Khách ${index}`,
      category: 'AR-RECEIPT',
      credit: 100000,
      salesStaffCode: '',
      deliveryStaffCode: ''
    }));
  }
  install(rows);

  const result = await debtNew.listCustomers({
    salesStaffCode: '33949',
    status: 'open',
    page: 2,
    customerLimit: 2
  });

  assert.equal(result.summary.customerCount, 3);
  assert.equal(result.summary.totalDebt, 5700000);
  assert.equal(result.customers.length, 1);
  assert.equal(result.pagination.totalRows, 3);
  assert.equal(result.pagination.page, 2);
  assert.equal(result.pagination.appliedAfterOrderAggregation, true);
});

test('Phase261 mobile adapter passes customer pagination to Debt New instead of raw ledgerLimit', () => {
  const scoped = mobileAdapter.buildMobileDebtNewQuery({
    query: { page: 2, limit: 25 },
    mobileUser: { role: 'sales', salesStaffCode: '33949' }
  });
  assert.equal(scoped.page, 2);
  assert.equal(scoped.customerLimit, 25);
  assert.equal(scoped.salesStaffCode, '33949');
  assert.equal('ledgerLimit' in scoped, false);
  assert.equal('rawLimit' in scoped, false);
});

test('Phase261 order-scope aggregation pipeline limits order groups only after grouping', () => {
  const pipeline = arLedgerRead.buildActiveDebtOrderScopeCandidatePipeline({ salesStaffCode: '33949' }, { maxOrderScopes: 20000 });
  const groupIndex = pipeline.findIndex((stage) => stage.$group);
  const limitIndex = pipeline.findIndex((stage) => stage.$limit);
  assert.ok(groupIndex >= 0);
  assert.ok(limitIndex > groupIndex, 'scope safety limit must never truncate raw ledgers before order grouping');
  assert.equal(pipeline.some((stage, index) => index < groupIndex && stage.$limit), false);
});

test('Phase261 exact scope fails closed instead of returning partial debt when the safety ceiling is exceeded', async () => {
  const rows = [
    ledger({ id: 'AR-SAFE-1', orderId: 'SO-SAFE-1', orderCode: 'B-SAFE-1', customerCode: 'C-SAFE-1', customerName: 'Khách 1', debit: 1000 }),
    ledger({ id: 'AR-SAFE-2', orderId: 'SO-SAFE-2', orderCode: 'B-SAFE-2', customerCode: 'C-SAFE-2', customerName: 'Khách 2', debit: 2000 })
  ];
  install(rows);

  await assert.rejects(
    () => arLedgerRead.discoverActiveDebtOrderScopes(
      { salesStaffCode: '33949' },
      { maxOrderScopes: 1, disableAggregation: true }
    ),
    (error) => error && error.code === 'DEBT_ORDER_SCOPE_TOO_LARGE' && error.status === 422
  );

  await assert.rejects(
    () => arLedgerRead.getActiveDebtReadModelLedgersForOrderScopes(
      [
        { orderKey: 'SO-SAFE-1', aliases: ['SO-SAFE-1', 'B-SAFE-1'] },
        { orderKey: 'SO-SAFE-2', aliases: ['SO-SAFE-2', 'B-SAFE-2'] }
      ],
      {},
      { maxLedgerRows: 1 }
    ),
    (error) => error && error.code === 'DEBT_LEDGER_SCOPE_TOO_LARGE' && error.status === 422
  );
});

test('Phase261 production aggregation path discovers compact order scopes then reads full ledgers', async () => {
  const rows = [
    ledger({
      id: 'AR-AGG-OPEN',
      orderId: 'SO-AGG-1',
      orderCode: 'B-AGG-1',
      customerCode: 'C-AGG-1',
      customerName: 'Khách aggregation',
      debit: 9000000
    }),
    ledger({
      id: 'AR-AGG-RECEIPT',
      orderId: 'SO-AGG-1',
      orderCode: 'B-AGG-1',
      customerCode: 'C-AGG-1',
      customerName: 'Khách aggregation',
      category: 'AR-RECEIPT',
      credit: 2000000,
      salesStaffCode: '',
      deliveryStaffCode: ''
    })
  ];
  const model = new FakeModel(rows);
  let allowDiskUse = false;
  model.aggregate = () => ({
    allowDiskUse(value) { allowDiskUse = value; return this; },
    session() { return this; },
    async exec() {
      return [{
        _id: 'SO-AGG-1',
        customerCode: 'C-AGG-1',
        customerName: 'Khách aggregation',
        aliasGroups: [['SO-AGG-1', 'B-AGG-1']]
      }];
    }
  });
  debtNew.setModelsForTest({ ArLedger: model, DebtCollection: emptyModel(), OrderPaymentAllocation: emptyModel() });

  const result = await debtNew.listCustomers({ salesStaffCode: '33949', status: 'open' });
  assert.equal(allowDiskUse, true);
  assert.equal(result.diagnostics.scope.strategy, 'mongo-aggregation-order-scope');
  assert.equal(result.customers.length, 1);
  assert.equal(result.customers[0].debtAmount, 7000000);
});


test('Phase261 managed Mongo indexes cover NVBH and NVGH exact debt scope discovery', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/services/mongoIndexService.js'), 'utf8');
  assert.match(source, /idx_ar_debt_scope_sales_staff_order/);
  assert.match(source, /idx_ar_debt_scope_delivery_staff_order/);
  assert.match(source, /salesStaffCode:\s*1[\s\S]*accountingConfirmed:\s*1[\s\S]*sourceId:\s*1/);
  assert.match(source, /deliveryStaffCode:\s*1[\s\S]*accountingConfirmed:\s*1[\s\S]*sourceId:\s*1/);
});
