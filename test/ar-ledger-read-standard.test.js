'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const arLedgerRead = require('../src/services/arLedgerRead.service');
const policy = require('../src/domain/ar/arLedgerQueryPolicy');
const { FakeModel, b0038423Order } = require('./helpers/phase79FakeModels');

function setupLedgerRows(rows) {
  const ArLedger = new FakeModel(rows);
  arLedgerRead.setModelsForTest({ ArLedger });
  return ArLedger;
}

function debtOpen(overrides = {}) {
  const order = b0038423Order(overrides.order || {});
  const amount = Number(overrides.amount ?? order.debtAmount ?? order.remainingDebt ?? order.totalAmount ?? 0);
  const sourceId = overrides.sourceId || order.id;
  const sourceCode = overrides.sourceCode || order.code;
  return {
    account: 'AR',
    category: 'AR-DEBT-OPEN',
    ledgerType: 'AR-DEBT-OPEN',
    entryType: 'normal',
    sourceType: 'SALES_ORDER_DELIVERY_CLOSEOUT',
    sourceId,
    sourceCode,
    orderId: sourceId,
    orderCode: sourceCode,
    salesOrderId: sourceId,
    salesOrderCode: sourceCode,
    customerCode: order.customerCode,
    customerName: order.customerName,
    salesStaffCode: order.salesStaffCode,
    salesStaffName: order.salesStaffName,
    deliveryStaffCode: order.deliveryStaffCode,
    deliveryStaffName: order.deliveryStaffName,
    debit: amount,
    credit: 0,
    amount,
    direction: 'debit',
    amountField: 'debit',
    active: true,
    reversed: false,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingBatchId: `CLOSEOUT-${sourceId}`,
    id: `AR-DEBT-OPEN-${sourceCode}`,
    code: `AR-DEBT-OPEN-${sourceCode}`,
    idempotencyKey: `AR-DEBT-OPEN:${sourceId}`,
    date: '2026-06-30',
    ...overrides
  };
}

function debtPayment(open, amount) {
  return {
    ...open,
    category: 'AR-DEBT-PAYMENT',
    ledgerType: 'AR-DEBT-PAYMENT',
    sourceType: 'DEBT_PAYMENT',
    debit: 0,
    credit: amount,
    amount,
    direction: 'credit',
    amountField: 'credit',
    id: `AR-DEBT-PAYMENT-${open.sourceCode}`,
    code: `AR-DEBT-PAYMENT-${open.sourceCode}`,
    idempotencyKey: `AR-DEBT-PAYMENT:PAY-${open.sourceId}`
  };
}

test('buildCanonicalArLedgerMatch enforces confirmed active Phase87 canonical AR categories', () => {
  const match = policy.buildCanonicalArLedgerMatch({ deliveryStaffCode: 'ghth', status: 'open' });
  assert.equal(match.account, 'AR');
  assert.equal(match.accountingConfirmed, true);
  assert.equal(match.accountingStatus, 'confirmed');
  assert.equal(match.active, true);
  assert.deepEqual(match.reversed, { $ne: true });
  assert.deepEqual(match.category.$in, ['AR-DEBT-OPEN', 'AR-DEBT-PAYMENT', 'AR-DEBT-ADJUSTMENT', 'AR-DEBT-VOID']);
  assert.ok(match.$and.some((part) => JSON.stringify(part).includes('deliveryStaffCode')));
});

test('getCanonicalArLedgers rejects dirty AR-DEBT-OPEN and never computes by code regex', async () => {
  const open = debtOpen({ amount: 10402373 });
  const dirty = { ...open, id: 'AR-DEBT-OPEN-DIRTY-B0038423', code: 'AR-DEBT-OPEN-DIRTY-B0038423', category: '', ledgerType: '', entryType: '' };
  setupLedgerRows([open, dirty]);
  const result = await arLedgerRead.getCanonicalArLedgers({ deliveryStaffCode: 'GHTH' }, { includeRejected: true });
  assert.equal(result.canonicalLedgers.length, 1);
  assert.equal(result.canonicalLedgers[0].sourceCode, 'B0038423');
  assert.equal(result.rejectedLedgers.length, 0, 'dirty row is excluded by Mongo match before validator; it is not accepted by code regex');
});

test('aggregateDebtByCustomer and aggregateDebtByOrder use debit minus credit only', async () => {
  const open = debtOpen({ amount: 10402373 });
  const payment = debtPayment(open, 10402373);
  setupLedgerRows([open, payment]);
  const orders = await arLedgerRead.aggregateDebtByOrder({ status: 'all', deliveryStaffCode: 'ghth' });
  assert.equal(orders.length, 1);
  assert.equal(orders[0].debit, 10402373);
  assert.equal(orders[0].credit, 10402373);
  assert.equal(orders[0].remainingDebt, 0);
  const customers = await arLedgerRead.aggregateDebtByCustomer({ status: 'closed', salesStaffCode: '35095' });
  assert.equal(customers.length, 1);
  assert.equal(customers[0].customerCode, '4501221');
  assert.equal(customers[0].remainingDebt, 0);
});

test('normalizeDebtStatus maps Vietnamese UI label to open but API should use canonical value', () => {
  assert.equal(policy.normalizeDebtStatus('Khách còn nợ'), 'open');
  assert.equal(policy.normalizeDebtStatus(''), 'open');
  assert.equal(policy.normalizeDebtStatus('hết nợ'), 'closed');
  assert.equal(policy.normalizeDebtStatus('all'), 'all');
});
