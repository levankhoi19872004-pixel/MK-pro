'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { FakeModel } = require('./helpers/phase79FakeModels');

// Persistence/dependency boundary only: avoid searchService model dependencies.
const searchServicePath = require.resolve(path.join(__dirname, '..', 'src/services/searchService.js'));
const previousSearchService = require.cache[searchServicePath];
require.cache[searchServicePath] = {
  id: searchServicePath,
  filename: searchServicePath,
  loaded: true,
  exports: { async searchStaffs() { return []; } }
};

const debtNew = require('../src/services/v2/debtNew.service');
const arReadService = require('../src/services/arLedgerRead.service');
const arPostingService = require('../src/services/arPosting.service');
const eventDeltaService = require('../src/services/accounting/CloseoutCorrectionArEventDeltaPostingService');

function canonicalLedger({ id, category, debit = 0, credit = 0, orderId, orderCode, customerCode, customerName = 'Fixture', sourceType }) {
  const isReceipt = String(category).startsWith('AR-RECEIPT');
  const resolvedSourceType = sourceType || (isReceipt ? 'DEBTCOLLECTION' : 'ORDER_PAYMENT_ALLOCATION');
  return {
    id, code: id, account: 'AR', category, ledgerType: category, entryType: 'normal',
    type: String(category).toLowerCase(), date: '2026-08-09',
    sourceType: resolvedSourceType, sourceId: orderId, sourceCode: orderCode,
    refType: isReceipt ? 'DEBTCOLLECTION' : 'ORDER_PAYMENT_ALLOCATION',
    refId: isReceipt ? `DC-${id}` : `REF-${id}`,
    refCode: isReceipt ? `DC-${id}` : `REF-${id}`,
    orderId, orderCode, salesOrderId: orderId, salesOrderCode: orderCode,
    customerCode, customerName,
    salesStaffCode: '33949', salesStaffName: 'Sales', deliveryStaffCode: 'ghth', deliveryStaffName: 'Delivery',
    debit, credit, amount: Math.max(debit, credit), direction: debit > 0 ? 'debit' : 'credit', amountField: debit > 0 ? 'debit' : 'credit',
    status: 'posted', active: true, reversed: false, deleted: false, isDeleted: false,
    accountingConfirmed: true, accountingStatus: 'confirmed',
    idempotencyKey: isReceipt ? `AR-RECEIPT:DC${id}:${orderId}` : `${category}:${id}`,
    source: isReceipt ? 'DebtCollectionPostingService' : 'r1p1-e2e',
    createdAt: '2026-08-09T00:00:00.000Z', updatedAt: '2026-08-09T00:00:00.000Z'
  };
}

function order(orderId, orderCode, customerCode, customerName = 'Fixture') {
  return { id: orderId, orderId, salesOrderId: orderId, code: orderCode, orderCode, salesOrderCode: orderCode,
    customerCode, customerName, salesStaffCode: '33949', salesStaffName: 'Sales', deliveryStaffCode: 'ghth', deliveryStaffName: 'Delivery',
    deliveryDate: '2026-08-09', accountingConfirmed: true, accountingStatus: 'confirmed' };
}
function correction({ id, orderId, orderCode, customerCode, customerName = 'Fixture', cash = 0, bank = 0, reward = 0, receivable = 0, ret = 0 }) {
  return { id, code: id, correctionId: id, correctionCode: id, newCloseoutVersion: 2,
    salesOrderId: orderId, salesOrderCode: orderCode, orderId, orderCode, customerCode, customerName,
    receivableDeltaAmount: receivable, cashDeltaAmount: cash, bankDeltaAmount: bank, rewardDeltaAmount: reward,
    returnAdjustmentAmount: ret, createdBy: 'r1p1-test', createdAt: '2026-08-09T00:10:00.000Z' };
}

let rows;
let model;
function install(initialRows) {
  rows = initialRows;
  model = new FakeModel(rows);
  const empty = new FakeModel([]);
  debtNew.setModelsForTest({ ArLedger: model, DebtCollection: empty, OrderPaymentAllocation: empty });
  arReadService.setModelsForTest({ ArLedger: model });
  arPostingService.setModelsForTest({ ArLedger: model, SalesOrder: {}, AuditLog: {} });
}
async function post(orderRow, correctionRow) {
  return eventDeltaService.postCorrectionEventDelta({ order: orderRow, correction: correctionRow, version: { closeoutVersion: 2 } }, {
    actor: 'r1p1-test', now: '2026-08-09T00:10:00.000Z', zeroTolerance: 1000
  });
}
async function customerDebt(customerCode) {
  const result = await debtNew.listCustomers({ customerCode, status: 'all' }, { disableAggregation: true });
  const customer = result.customers.find((row) => row.customerCode === customerCode);
  return { result, customer };
}

test.afterEach(() => {
  debtNew.setModelsForTest(null);
  arReadService.setModelsForTest(null);
  arPostingService.setModelsForTest(null);
});
test.after(() => {
  if (previousSearchService) require.cache[searchServicePath] = previousSearchService;
  else delete require.cache[searchServicePath];
});

test('R1P1 actual DebtNew E2E: B0041181 returns debt=0 after actual event writer', async () => {
  const o = order('SO-B0041181', 'B0041181', '4499499', 'Đinh Mười');
  install([canonicalLedger({ id: 'OPEN-B0041181', category: 'AR-SALE', debit: 23800085, orderId: o.id, orderCode: o.code, customerCode: o.customerCode, customerName: o.customerName })]);
  await post(o, correction({ id: 'DCOC-B0041181-2', orderId: o.id, orderCode: o.code, customerCode: o.customerCode, customerName: o.customerName, cash: 22140000, reward: 1660000 }));
  const { customer, result } = await customerDebt('4499499');
  assert.ok(customer);
  assert.equal(customer.debtAmount, 0);
  const projectedOrder = result.orders.find((row) => row.orderCode === 'B0041181');
  assert.ok(projectedOrder);
  assert.equal(projectedOrder.debtAmount, 0);
  assert.equal(projectedOrder.debt, 0);
  assert.equal(projectedOrder.remainingDebt, 0);
  assert.equal(rows.some((row) => row.category === 'AR-DEBT-ADJUSTMENT'), false);
  assert.equal(rows.filter((row) => row.category === 'AR-ADJUSTMENT' && row.sourceType === 'DELIVERY_CLOSEOUT_CORRECTION').length, 1);
});

test('R1P1 actual DebtNew E2E: confirmed receipt is preserved, 10m - 4m - 2m = 4m', async () => {
  const o = order('SO-REC-1', 'B-REC-1', 'C-REC-1');
  install([
    canonicalLedger({ id: 'OPEN-REC-1', category: 'AR-SALE', debit: 10000000, orderId: o.id, orderCode: o.code, customerCode: o.customerCode }),
    canonicalLedger({ id: 'RECEIPT-REC-1', category: 'AR-RECEIPT-CASH', credit: 4000000, orderId: o.id, orderCode: o.code, customerCode: o.customerCode })
  ]);
  await post(o, correction({ id: 'DCOC-REC-1', orderId: o.id, orderCode: o.code, customerCode: o.customerCode, cash: 2000000 }));
  const { customer } = await customerDebt('C-REC-1');
  assert.ok(customer);
  assert.equal(customer.debtAmount, 4000000);
  assert.equal(rows.filter((row) => row.category === 'AR-RECEIPT-CASH').length, 1);
});

test('R1P1 actual DebtNew E2E: no-op correction after receipt leaves debt unchanged', async () => {
  const o = order('SO-NOOP-1', 'B-NOOP-1', 'C-NOOP-1');
  install([
    canonicalLedger({ id: 'OPEN-NOOP-1', category: 'AR-SALE', debit: 10000000, orderId: o.id, orderCode: o.code, customerCode: o.customerCode }),
    canonicalLedger({ id: 'RECEIPT-NOOP-1', category: 'AR-RECEIPT-CASH', credit: 4000000, orderId: o.id, orderCode: o.code, customerCode: o.customerCode })
  ]);
  const result = await post(o, correction({ id: 'DCOC-NOOP-1', orderId: o.id, orderCode: o.code, customerCode: o.customerCode }));
  assert.equal(result.skipped, true);
  const { customer } = await customerDebt('C-NOOP-1');
  assert.ok(customer);
  assert.equal(customer.debtAmount, 6000000);
});

test('R1P1 actual DebtNew E2E: multiple orders same customer aggregate only the corrected order delta', async () => {
  const customerCode = 'C-MULTI';
  const a = order('SO-MULTI-A', 'B-MULTI-A', customerCode);
  const b = order('SO-MULTI-B', 'B-MULTI-B', customerCode);
  install([
    canonicalLedger({ id: 'OPEN-MULTI-A', category: 'AR-SALE', debit: 6000000, orderId: a.id, orderCode: a.code, customerCode }),
    canonicalLedger({ id: 'OPEN-MULTI-B', category: 'AR-SALE', debit: 3000000, orderId: b.id, orderCode: b.code, customerCode })
  ]);
  await post(a, correction({ id: 'DCOC-MULTI-A', orderId: a.id, orderCode: a.code, customerCode, cash: 2000000 }));
  const { customer, result } = await customerDebt(customerCode);
  assert.ok(customer);
  assert.equal(customer.debtAmount, 7000000);
  const orderA = result.orders.find((row) => row.orderCode === 'B-MULTI-A');
  const orderB = result.orders.find((row) => row.orderCode === 'B-MULTI-B');
  assert.equal(orderA.debtAmount, 4000000);
  assert.equal(orderB.debtAmount, 3000000);
});
