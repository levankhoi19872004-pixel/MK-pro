'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const arLedgerReadService = require('../src/services/arLedgerRead.service');
const DebtReconcile = require('../src/services/accounting/OrderPaymentDebtReconcileService');
const orderIdentity = require('../src/domain/ar/arOrderIdentity');
const validator = require('../src/domain/ar/arLedgerValidator');
const { FakeModel } = require('./helpers/phase79FakeModels');

const ORDER_ID = 'SO1783414766939439';
const ORDER_CODE = 'B0039116';
const CUSTOMER_CODE = '4501763';
const CORRECTION_ID = 'DCOC-SO1783414766939439-2-e00b3dfcf29f';

function arLedger(category, amount, side, overrides = {}) {
  const debit = side === 'debit' ? amount : 0;
  const credit = side === 'credit' ? amount : 0;
  return {
    id: overrides.id || `${category}-${ORDER_CODE}-${amount}-${side}`,
    code: overrides.code || `${category}-${ORDER_CODE}-${amount}-${side}`,
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    sourceType: overrides.sourceType || 'ORDER_PAYMENT_ALLOCATION',
    sourceId: overrides.sourceId || ORDER_ID,
    sourceCode: overrides.sourceCode || ORDER_CODE,
    refType: overrides.refType || 'ORDER_PAYMENT_ALLOCATION',
    refId: overrides.refId || `OPA-${ORDER_CODE}`,
    refCode: overrides.refCode || `OPA-${ORDER_CODE}`,
    orderId: overrides.orderId || ORDER_ID,
    orderCode: overrides.orderCode || ORDER_CODE,
    salesOrderId: overrides.salesOrderId || ORDER_ID,
    salesOrderCode: overrides.salesOrderCode || ORDER_CODE,
    customerCode: overrides.customerCode || CUSTOMER_CODE,
    customerName: overrides.customerName || 'LÊ Huế',
    debit,
    credit,
    amount,
    direction: side,
    amountField: side,
    accountingConfirmed: overrides.accountingConfirmed ?? true,
    accountingStatus: overrides.accountingStatus || 'confirmed',
    active: overrides.active ?? true,
    reversed: overrides.reversed ?? false,
    status: overrides.status || 'posted',
    idempotencyKey: overrides.idempotencyKey || `${category}:${ORDER_ID}:${amount}:${side}`,
    createdAt: overrides.createdAt || '2026-07-08T08:55:51.359Z',
    ...overrides
  };
}

function sale(amount = 7909502, overrides = {}) {
  return arLedger('AR-SALE', amount, 'debit', overrides);
}

function receipt(amount = 7909502, overrides = {}) {
  return arLedger('AR-RECEIPT', amount, 'credit', {
    sourceType: 'salesOrder',
    refType: 'debtCollection',
    refId: 'DC-PHASE227',
    refCode: 'DC-PHASE227',
    source: 'DebtCollectionPostingService',
    idempotencyKey: `AR-RECEIPT:DC-PHASE227:${ORDER_ID}`,
    ...overrides
  });
}

function order() {
  return {
    id: ORDER_ID,
    orderId: ORDER_ID,
    salesOrderId: ORDER_ID,
    code: ORDER_CODE,
    orderCode: ORDER_CODE,
    salesOrderCode: ORDER_CODE,
    customerCode: CUSTOMER_CODE,
    customerName: 'LÊ Huế',
    salesStaffCode: '39534',
    deliveryStaffCode: 'ghkx'
  };
}

function correctionAllocation(expectedDebtAmount = 7909502) {
  return {
    allocationCode: CORRECTION_ID,
    idempotencyKey: `DCO-RECONCILE:${ORDER_CODE}:DELIVERY_CLOSEOUT_CORRECTION:${CORRECTION_ID}:v2`,
    orderId: ORDER_ID,
    orderCode: ORDER_CODE,
    salesOrderId: ORDER_ID,
    salesOrderCode: ORDER_CODE,
    customerCode: CUSTOMER_CODE,
    customerName: 'LÊ Huế',
    sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
    sourceId: CORRECTION_ID,
    sourceCode: CORRECTION_ID,
    sourceVersion: 2,
    receivableAmount: expectedDebtAmount,
    cashAmount: 0,
    bankAmount: 0,
    rewardAmount: 0,
    returnAmount: 0,
    debtAmount: expectedDebtAmount,
    normalizedDebtAmount: expectedDebtAmount,
    status: 'posted'
  };
}

async function withLedgers(rows, fn) {
  arLedgerReadService.setModelsForTest({ ArLedger: new FakeModel(rows) });
  try {
    return await fn();
  } finally {
    arLedgerReadService.setModelsForTest(null);
  }
}

test('Phase227 regression B0039116 reads existing AR-SALE and skips duplicate debt adjustment', async () => {
  await withLedgers([sale()], async () => {
    const result = await DebtReconcile.reconcileOrderDebt({
      order: order(),
      allocation: correctionAllocation(),
      apply: false,
      zeroTolerance: 1000,
      sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
      sourceId: CORRECTION_ID,
      sourceCode: CORRECTION_ID
    });

    assert.equal(result.currentArBalance, 7909502);
    assert.equal(result.expectedDebtAmount, 7909502);
    assert.equal(result.deltaDebt, 0);
    assert.equal(result.action, 'skip');
    assert.equal(result.skipReason, 'NO_DEBT_DELTA');
    assert.equal(result.needsAdjustment, false);
    assert.equal(result.ledger, undefined);
    assert.deepEqual(result.diagnostic.lookupKeys.sort(), [ORDER_CODE, ORDER_ID].sort());
    assert.equal(result.diagnostic.lookupKeys.includes(CORRECTION_ID), false);
    assert.equal(result.diagnostic.ignoredSourceAliases.includes(CORRECTION_ID), true);
    assert.equal(result.diagnostic.rawMatchedLedgerCount, 1);
    assert.equal(result.diagnostic.canonicalMatchedLedgerCount, 1);
  });
});

test('Phase227 correction identity cannot replace business order identity', () => {
  const identity = orderIdentity.resolveCanonicalArOrderIdentity({
    order: order(),
    allocation: correctionAllocation()
  });
  assert.equal(identity.orderId, ORDER_ID);
  assert.equal(identity.orderCode, ORDER_CODE);
  assert.deepEqual(identity.lookupKeys.sort(), [ORDER_CODE, ORDER_ID].sort());
  assert.equal(identity.lookupKeys.includes(CORRECTION_ID), false);
  assert.equal(identity.ignoredSourceAliases.includes(CORRECTION_ID), true);
});

test('Phase227 canonical balance reader accepts AR-SALE from ORDER_PAYMENT_ALLOCATION', async () => {
  const row = sale();
  assert.equal(validator.canProjectCanonicalAccountingLedgerToDebtReadModel(row), true);
  await withLedgers([row], async () => {
    const details = await DebtReconcile.getCurrentOrderArBalanceDetails({ order: order(), allocation: correctionAllocation() }, CUSTOMER_CODE);
    assert.equal(details.currentArBalance, 7909502);
    assert.equal(details.canonicalMatchedLedgerCount, 1);
    assert.equal(details.excludedLedgerCount, 0);
  });
});

test('Phase227 posts only positive delta as debit when real debt increases', async () => {
  await withLedgers([sale(7000000)], async () => {
    const result = await DebtReconcile.reconcileOrderDebt({
      order: order(),
      allocation: correctionAllocation(7909502),
      apply: false,
      zeroTolerance: 1000
    });
    assert.equal(result.currentArBalance, 7000000);
    assert.equal(result.deltaDebt, 909502);
    assert.equal(result.action, 'create-debit');
    assert.equal(result.ledger.debit, 909502);
    assert.equal(result.ledger.credit, 0);
  });
});

test('Phase227 posts only negative delta as credit when real debt decreases', async () => {
  await withLedgers([sale(7909502)], async () => {
    const result = await DebtReconcile.reconcileOrderDebt({
      order: order(),
      allocation: correctionAllocation(7000000),
      apply: false,
      zeroTolerance: 1000
    });
    assert.equal(result.currentArBalance, 7909502);
    assert.equal(result.deltaDebt, -909502);
    assert.equal(result.action, 'create-credit');
    assert.equal(result.ledger.debit, 0);
    assert.equal(result.ledger.credit, 909502);
  });
});

test('Phase227 anomaly guard blocks posting when raw opening debit is excluded by canonical provenance', async () => {
  const excludedSale = sale(7909502, {
    sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
    sourceId: CORRECTION_ID,
    sourceCode: CORRECTION_ID
  });
  await withLedgers([excludedSale], async () => {
    const result = await DebtReconcile.reconcileOrderDebt({
      order: order(),
      allocation: correctionAllocation(),
      apply: true,
      zeroTolerance: 1000
    });
    assert.equal(result.currentArBalance, 0);
    assert.equal(result.manualReviewRequired, true);
    assert.equal(result.skipReason, 'CANONICAL_AR_LOOKUP_EXCLUDED_EXISTING_LEDGER');
    assert.equal(result.posted, undefined);
    assert.equal(result.diagnostic.rawMatchedLedgerCount, 1);
    assert.equal(result.diagnostic.canonicalMatchedLedgerCount, 0);
    assert.equal(result.diagnostic.excludedLedgerCount, 1);
    assert.equal(result.diagnostic.excludedLedgers[0].exclusionReasons.includes('DETAILED_ACCOUNTING_PROVENANCE_REJECTED'), true);
  });
});

test('Phase227 bulk and manual correction contexts use the same canonical order balance resolver', async () => {
  await withLedgers([sale()], async () => {
    const bulk = await DebtReconcile.reconcileOrderDebt({
      order: order(),
      allocation: { ...correctionAllocation(), sourceType: 'BULK_DELIVERY_ADJUSTMENT_COMMIT' },
      apply: false
    });
    const manual = await DebtReconcile.reconcileOrderDebt({
      order: order(),
      allocation: correctionAllocation(),
      apply: false
    });
    assert.equal(bulk.currentArBalance, 7909502);
    assert.equal(manual.currentArBalance, 7909502);
    assert.deepEqual(bulk.diagnostic.lookupKeys.sort(), manual.diagnostic.lookupKeys.sort());
    assert.equal(bulk.skipReason, 'NO_DEBT_DELTA');
    assert.equal(manual.skipReason, 'NO_DEBT_DELTA');
  });
});

test('Phase227 preserves Phase226 AR-RECEIPT in canonical order balance', async () => {
  await withLedgers([sale(2499694), receipt(2499694)], async () => {
    const details = await DebtReconcile.getCurrentOrderArBalanceDetails({ order: order() }, CUSTOMER_CODE);
    assert.equal(details.currentArBalance, 0);
    assert.equal(details.canonicalMatchedLedgerCount, 2);
    assert.equal(details.excludedLedgerCount, 0);
  });
});

test('Phase227 audit fixture identifies B0039116 over-post and produces reversal plan only', async () => {
  const audit = require('../scripts/audit-bulk-debt-reconcile-balance-lookup');
  const report = await audit.run({ fixture: true, json: true, limit: 10 });
  assert.equal(report.dryRun, true);
  assert.equal(report.readOnly, true);
  assert.equal(report.summary.p0Count, 1);
  assert.equal(report.rows[0].orderCode, ORDER_CODE);
  assert.equal(report.rows[0].rawBalanceBefore, 7909502);
  assert.equal(report.rows[0].canonicalBalanceBefore, 7909502);
  assert.equal(report.rows[0].expectedDelta, 0);
  assert.equal(report.rows[0].postedDebit, 7909502);
  assert.equal(report.rows[0].overPostedAmount, 7909502);
  assert.equal(report.rows[0].remediationPlan.applyAutomatically, false);
  assert.equal(report.rows[0].remediationPlan.reversalDirection, 'credit');
  assert.equal(report.rows[0].remediationPlan.reversalAmount, 7909502);
});
