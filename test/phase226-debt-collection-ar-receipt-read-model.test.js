'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const registry = require('../src/domain/ar/arDebtCategoryRegistry');
const validator = require('../src/domain/ar/arLedgerValidator');
const queryPolicy = require('../src/domain/ar/arLedgerQueryPolicy');
const effectUtil = require('../src/utils/arLedgerCategoryEffect.util');
const debtNew = require('../src/services/v2/debtNew.service');
const postingDependencies = require('../src/engines/posting.dependencies');
const postingEngine = require('../src/engines/posting.engine');
const { FakeModel } = require('./helpers/phase79FakeModels');

function ledger(category, amount, side, overrides = {}) {
  const debit = side === 'debit' ? amount : 0;
  const credit = side === 'credit' ? amount : 0;
  const orderId = overrides.orderId || 'SO1783155351292178';
  const orderCode = overrides.orderCode || 'B0038774';
  return {
    id: overrides.id || `${category}-${orderCode}-${amount}`,
    code: overrides.code || `${category}-${orderCode}-${amount}`,
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    sourceType: overrides.sourceType || 'ORDER_PAYMENT_ALLOCATION',
    sourceId: overrides.sourceId || orderId,
    sourceCode: overrides.sourceCode || orderCode,
    orderId,
    orderCode,
    salesOrderId: orderId,
    salesOrderCode: orderCode,
    refType: overrides.refType || 'ORDER_PAYMENT_ALLOCATION',
    refId: overrides.refId || orderId,
    refCode: overrides.refCode || orderCode,
    customerCode: overrides.customerCode || '4501680',
    customerName: overrides.customerName || 'Chị Hiền',
    salesStaffCode: overrides.salesStaffCode || '39534',
    salesStaffName: overrides.salesStaffName || 'Lương Thị Kiều',
    deliveryStaffCode: overrides.deliveryStaffCode || 'ghkx',
    deliveryStaffName: overrides.deliveryStaffName || 'Hào Giao Hàng KX',
    debit,
    credit,
    amount,
    direction: side,
    amountField: side,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: false,
    status: 'posted',
    idempotencyKey: overrides.idempotencyKey || `${category}:${orderId}:${amount}`,
    date: '2026-07-09',
    source: overrides.source || 'phase226-test'
  };
}

function receipt(amount, overrides = {}) {
  return ledger('AR-RECEIPT', amount, 'credit', {
    sourceType: 'salesOrder',
    refType: 'debtCollection',
    refId: 'DC202607093145492952',
    refCode: 'DC202607093145492952',
    source: 'DebtCollectionPostingService',
    idempotencyKey: `AR-RECEIPT:DC202607093145492952:SO1783155351292178`,
    ...overrides
  });
}

function emptyModel() {
  return new FakeModel([]);
}

test('Phase226 canonical category registry marks AR-RECEIPT as active decrease and excludes receipt reversal', () => {
  assert.equal(registry.ACTIVE_DEBT_READ_MODEL_CATEGORIES.includes('AR-RECEIPT'), true);
  assert.equal(registry.ACTIVE_DEBT_DECREASE_CATEGORIES.includes('AR-RECEIPT'), true);
  assert.equal(registry.CATEGORY_EFFECT['AR-RECEIPT'], 'credit');
  assert.equal(effectUtil.getArLedgerCategoryEffect({ category: 'AR-RECEIPT' }).effect, 'decrease_ar');
  assert.equal(registry.ACTIVE_DEBT_READ_MODEL_CATEGORIES.includes('AR-RECEIPT-REVERSAL'), false);
  assert.equal(registry.EXCLUDED_DEBT_READ_MODEL_CATEGORIES.includes('AR-RECEIPT-REVERSAL'), true);
});

test('Phase226 projects only canonical debtCollection AR-RECEIPT, not legacy closeout receipt or reversal', () => {
  assert.equal(validator.canProjectCanonicalAccountingLedgerToDebtReadModel(receipt(2499694)), true);
  assert.equal(validator.canProjectCanonicalAccountingLedgerToDebtReadModel(receipt(2499694, {
    refType: 'RECEIPT',
    refId: 'LEGACY-RECEIPT',
    refCode: 'LEGACY-RECEIPT',
    source: 'delivery-closeout-correction',
    sourceType: 'SALES_ORDER_DELIVERY_CLOSEOUT_CORRECTION',
    idempotencyKey: 'AR-RECEIPT:LEGACY-RECEIPT'
  })), false);
  assert.equal(validator.canProjectCanonicalAccountingLedgerToDebtReadModel(ledger('AR-RECEIPT-REVERSAL', 2499694, 'debit', {
    entryType: 'reversal'
  })), false);
});

test('Phase226 active Mongo match includes AR-RECEIPT and filters NVBH by exact code aliases only', () => {
  const match = queryPolicy.buildActiveDebtReadModelLedgerMatch({ salesStaffCode: '39534', status: 'open' });
  assert.equal(match.category.$in.includes('AR-RECEIPT'), true);
  assert.equal(match.ledgerType.$in.includes('AR-RECEIPT'), true);
  assert.equal(match.category.$in.includes('AR-RECEIPT-REVERSAL'), false);
  const serialized = JSON.stringify(match);
  assert.match(serialized, /salesStaffCode/);
  assert.match(serialized, /salesmanCode/);
  assert.doesNotMatch(serialized, /salesStaffName|salesmanName/);
});

test('Phase226 full payment case 4501680/B0038774 becomes zero and disappears from status=open', async () => {
  const rows = [
    ledger('AR-SALE', 2499694, 'debit'),
    receipt(2499694)
  ];
  debtNew.setModelsForTest({
    ArLedger: new FakeModel(rows),
    DebtCollection: emptyModel(),
    OrderPaymentAllocation: emptyModel()
  });
  try {
    const all = await debtNew.listCustomers({ customerCode: '4501680', salesStaffCode: '39534', status: 'all' });
    assert.equal(all.orders.length, 1);
    assert.equal(all.orders[0].remainingDebt, 0);
    assert.equal(all.customers[0].remainingDebt, 0);
    assert.equal(all.summary.totalDebt, 0);
    assert.equal(all.summary.debtOrderCount, 0);

    const open = await debtNew.listCustomers({ customerCode: '4501680', salesStaffCode: '39534', status: 'open' });
    assert.equal(open.orders.length, 0);
    assert.equal(open.customers.length, 0);
    assert.equal(open.summary.totalDebt, 0);
    assert.equal(open.summary.debtOrderCount, 0);
  } finally {
    debtNew.setModelsForTest(null);
  }
});

test('Phase226 partial AR-RECEIPT keeps exact remaining debt', () => {
  const result = debtNew.groupLedgers([
    ledger('AR-SALE', 10000000, 'debit'),
    receipt(2499694)
  ], { status: 'all' });
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].remainingDebt, 7500306);
  assert.equal(result.customers[0].remainingDebt, 7500306);
});

test('Phase226 pending collection query includes only submitted/under_review, never accounting_confirmed', async () => {
  let captured = null;
  const DebtCollection = {
    find(filter) {
      captured = filter;
      return {
        limit() { return this; },
        session() { return this; },
        lean: async () => []
      };
    }
  };
  debtNew.setModelsForTest({ ArLedger: emptyModel(), DebtCollection, OrderPaymentAllocation: emptyModel() });
  try {
    await debtNew._private.loadPendingDebtCollectionsForOrders([{
      orderId: 'SO1783155351292178',
      orderCode: 'B0038774',
      salesOrderId: 'SO1783155351292178',
      salesOrderCode: 'B0038774'
    }]);
    assert.deepEqual(captured.status.$in, ['submitted', 'under_review']);
    assert.equal(captured.status.$in.includes('accounting_confirmed'), false);
  } finally {
    debtNew.setModelsForTest(null);
  }
});

test('Phase226 multi-allocation receipt creates deterministic one-ledger-per-order idempotency keys', async () => {
  const originalUpsert = postingDependencies.paymentRepository.upsert;
  const upserted = new Map();
  postingDependencies.paymentRepository.upsert = async (entry) => {
    upserted.set(entry.idempotencyKey, { ...entry });
    return entry;
  };
  try {
    const doc = {
      id: 'DC-MULTI-1',
      code: 'DC-MULTI-1',
      customerCode: '4501680',
      customerName: 'Chị Hiền',
      amount: 3000000,
      refType: 'debtCollection',
      refId: 'DC-MULTI-1',
      refCode: 'DC-MULTI-1',
      sourceType: 'debtCollection',
      source: 'DebtCollectionPostingService',
      idempotencyKey: 'AR-RECEIPT:DC-MULTI-1',
      accountingConfirmedBy: 'Kế toán',
      allocations: [
        { orderId: 'SO-1', orderCode: 'B-1', amount: 1000000, salesStaffCode: '39534' },
        { orderId: 'SO-2', orderCode: 'B-2', amount: 2000000, salesStaffCode: '39534' }
      ]
    };
    const first = await postingEngine.postReceiptAR(doc);
    const second = await postingEngine.postReceiptAR(doc);
    assert.equal(first.length, 2);
    assert.equal(second.length, 2);
    assert.equal(upserted.size, 2);
    assert.equal(Array.from(upserted.values()).reduce((sum, row) => sum + row.credit, 0), 3000000);
    assert.deepEqual(Array.from(upserted.keys()).sort(), [
      'AR-RECEIPT:DC-MULTI-1:SO-1',
      'AR-RECEIPT:DC-MULTI-1:SO-2'
    ]);
  } finally {
    postingDependencies.paymentRepository.upsert = originalUpsert;
  }
});

test('Phase226 dry-run audit fixture reports the historical 2.499.694 mismatch and expected zero', async () => {
  const audit = require('../scripts/audit-confirmed-debt-collections-missing-from-debt-read-model');
  const report = await audit.run({ fixture: true, json: true, limit: 10 });
  assert.equal(report.dryRun, true);
  assert.equal(report.mismatches.length, 1);
  assert.equal(report.mismatches[0].collectionCode, 'DC202607093145492952');
  assert.equal(report.mismatches[0].orderCode, 'B0038774');
  assert.equal(report.mismatches[0].currentDebt, 2499694);
  assert.equal(report.mismatches[0].expectedDebt, 0);
  assert.equal(report.mismatches[0].receiptProjectableAfterPhase226, true);
});
