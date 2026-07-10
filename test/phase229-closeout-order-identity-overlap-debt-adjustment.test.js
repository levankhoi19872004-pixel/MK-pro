'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const arLedgerReadService = require('../src/services/arLedgerRead.service');
const DebtReconcile = require('../src/services/accounting/OrderPaymentDebtReconcileService');
const orderIdentity = require('../src/domain/ar/arOrderIdentity');
const { FakeModel } = require('./helpers/phase79FakeModels');

const ORDER_ID = 'SO-B0039252';
const ORDER_CODE = 'B0039252';
const CUSTOMER_CODE = '5052875';
const AMOUNT = 875094;

function order() {
  return {
    id: ORDER_ID,
    orderId: ORDER_ID,
    salesOrderId: ORDER_ID,
    code: ORDER_CODE,
    orderCode: ORDER_CODE,
    salesOrderCode: ORDER_CODE,
    customerCode: CUSTOMER_CODE,
    customerName: 'Trung Liên',
    salesStaffCode: '35095',
    deliveryStaffCode: 'ghth'
  };
}

function normalCloseoutAllocation() {
  return {
    allocationCode: `OPA-${ORDER_CODE}-v1`,
    idempotencyKey: `OPA:${ORDER_ID}:delivery_closeout:scope:v1`,
    orderId: ORDER_ID,
    orderCode: ORDER_CODE,
    customerCode: CUSTOMER_CODE,
    customerName: 'Trung Liên',
    salesStaffCode: '35095',
    deliveryStaffCode: 'ghth',
    sourceType: 'delivery_closeout',
    // Normal closeout intentionally reuses business order identity here.
    sourceId: ORDER_ID,
    sourceCode: ORDER_CODE,
    sourceVersion: 1,
    receivableAmount: AMOUNT,
    cashAmount: 0,
    bankAmount: 0,
    rewardAmount: 0,
    returnAmount: 0,
    rawDebtAmount: AMOUNT,
    normalizedDebtAmount: AMOUNT,
    debtAmount: AMOUNT,
    status: 'posted'
  };
}

function saleLedger() {
  return {
    id: `AR-SALE-${ORDER_CODE}`,
    code: `AR-SALE-${ORDER_CODE}`,
    account: 'AR',
    category: 'AR-SALE',
    ledgerType: 'AR-SALE',
    entryType: 'normal',
    type: 'ar_sale',
    source: 'order_payment_allocation_service',
    sourceType: 'ORDER_PAYMENT_ALLOCATION',
    sourceId: ORDER_ID,
    sourceCode: ORDER_CODE,
    refType: 'ORDER_PAYMENT_ALLOCATION',
    refId: `OPA-${ORDER_CODE}-v1`,
    refCode: `OPA-${ORDER_CODE}-v1`,
    orderId: ORDER_ID,
    orderCode: ORDER_CODE,
    salesOrderId: ORDER_ID,
    salesOrderCode: ORDER_CODE,
    customerCode: CUSTOMER_CODE,
    customerName: 'Trung Liên',
    debit: AMOUNT,
    credit: 0,
    amount: AMOUNT,
    direction: 'debit',
    amountField: 'debit',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: false,
    status: 'posted',
    idempotencyKey: `OPA:${ORDER_ID}:delivery_closeout:scope:v1:AR-SALE`,
    createdAt: '2026-07-10T01:00:00.000Z'
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

test('Phase229 keeps normal closeout source aliases when they equal trusted order identity', () => {
  const identity = orderIdentity.resolveCanonicalArOrderIdentity({
    order: order(),
    allocation: normalCloseoutAllocation()
  });

  assert.deepEqual(identity.lookupKeys.sort(), [ORDER_ID, ORDER_CODE].sort());
  assert.deepEqual(identity.ignoredSourceAliases, []);
  assert.deepEqual(identity.sourceAliasesMatchingBusinessIdentity.sort(), [ORDER_ID, ORDER_CODE].sort());
});

test('Phase229 B0039252 normal closeout reads AR-SALE and skips duplicate AR-DEBT-ADJUSTMENT', async () => {
  await withLedgers([saleLedger()], async () => {
    const result = await DebtReconcile.reconcileOrderDebt({
      order: order(),
      allocation: normalCloseoutAllocation(),
      apply: false,
      zeroTolerance: 1000,
      sourceType: 'delivery_closeout',
      sourceId: ORDER_ID,
      sourceCode: ORDER_CODE
    });

    assert.equal(result.currentArBalance, AMOUNT);
    assert.equal(result.expectedDebtAmount, AMOUNT);
    assert.equal(result.deltaDebt, 0);
    assert.equal(result.needsAdjustment, false);
    assert.equal(result.skipReason, 'NO_DEBT_DELTA');
    assert.equal(result.action, 'skip');
    assert.equal(result.ledger, undefined);
    assert.deepEqual(result.diagnostic.lookupKeys.sort(), [ORDER_ID, ORDER_CODE].sort());
    assert.deepEqual(result.diagnostic.sourceAliasesMatchingBusinessIdentity.sort(), [ORDER_ID, ORDER_CODE].sort());
    assert.equal(result.diagnostic.rawMatchedLedgerCount, 1);
    assert.equal(result.diagnostic.canonicalMatchedLedgerCount, 1);
  });
});

test('Phase229 still ignores a correction document identity that differs from the business order', () => {
  const correctionId = `DCOC-${ORDER_ID}-2-abc`;
  const identity = orderIdentity.resolveCanonicalArOrderIdentity({
    order: order(),
    allocation: {
      ...normalCloseoutAllocation(),
      sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
      sourceId: correctionId,
      sourceCode: correctionId
    }
  });

  assert.deepEqual(identity.lookupKeys.sort(), [ORDER_ID, ORDER_CODE].sort());
  assert.equal(identity.lookupKeys.includes(correctionId), false);
  assert.deepEqual(identity.ignoredSourceAliases, [correctionId]);
});

test('Phase229 blocks full-debt posting when no canonical business order identity can be resolved', async () => {
  await withLedgers([], async () => {
    const result = await DebtReconcile.reconcileOrderDebt({
      order: { customerCode: CUSTOMER_CODE },
      allocation: {
        allocationCode: 'DCOC-UNKNOWN',
        idempotencyKey: 'DCO-RECONCILE:UNKNOWN',
        customerCode: CUSTOMER_CODE,
        sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
        sourceId: 'DCOC-UNKNOWN',
        sourceCode: 'DCOC-UNKNOWN',
        receivableAmount: AMOUNT,
        cashAmount: 0,
        bankAmount: 0,
        rewardAmount: 0,
        returnAmount: 0,
        debtAmount: AMOUNT,
        normalizedDebtAmount: AMOUNT,
        status: 'posted'
      },
      apply: true,
      zeroTolerance: 1000
    });

    assert.equal(result.posted, undefined);
    assert.equal(result.needsAdjustment, false);
    assert.equal(result.manualReviewRequired, true);
    assert.equal(result.skipReason, 'CANONICAL_AR_ORDER_IDENTITY_UNRESOLVED');
    assert.equal(result.action, 'manual-review');
    assert.deepEqual(result.diagnostic.lookupKeys, []);
  });
});

test('Phase229 audit fixture identifies B0039252 duplicate debt and plans reversal only', async () => {
  const audit = require('../scripts/audit-closeout-debt-adjustment-duplicate-ar-sale');
  const report = await audit.run({ fixture: true, json: true, limit: 10 });
  assert.equal(report.dryRun, true);
  assert.equal(report.readOnly, true);
  assert.equal(report.summary.p0DuplicateDebtCount, 1);
  assert.equal(report.summary.totalOverPostedAmount, AMOUNT);
  assert.equal(report.rows[0].orderCode, ORDER_CODE);
  assert.equal(report.rows[0].legacyIdentityCollapsed, true);
  assert.deepEqual(report.rows[0].canonicalLookupKeys.sort(), [ORDER_ID, ORDER_CODE].sort());
  assert.deepEqual(report.rows[0].legacyLookupKeys, []);
  assert.equal(report.rows[0].canonicalBalanceBefore, AMOUNT);
  assert.equal(report.rows[0].expectedDebtAmount, AMOUNT);
  assert.equal(report.rows[0].expectedDelta, 0);
  assert.equal(report.rows[0].postedDebit, AMOUNT);
  assert.equal(report.rows[0].overPostedAmount, AMOUNT);
  assert.equal(report.rows[0].remediationPlan.applyAutomatically, false);
  assert.equal(report.rows[0].remediationPlan.reversalDirection, 'credit');
  assert.equal(report.rows[0].remediationPlan.reversalAmount, AMOUNT);
});
