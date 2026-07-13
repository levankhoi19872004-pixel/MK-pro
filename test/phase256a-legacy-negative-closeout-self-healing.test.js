'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');
const AccountingCloseoutService = require('../src/services/accounting/AccountingCloseoutService');
const orderRepository = require('../src/repositories/orderRepository');
const OrderPaymentAllocationService = require('../src/services/accounting/OrderPaymentAllocationService');
const OrderPaymentDebtReconcileService = require('../src/services/accounting/OrderPaymentDebtReconcileService');
const auditService = require('../src/services/auditService');

function expectedCloseout() {
  return {
    originalAmount: 7842510,
    deliveredAmount: 7551334,
    returnedAmount: 291176,
    cashAmount: 0,
    bankAmount: 0,
    rewardAmount: 0,
    collectedAmount: 0,
    finalDebtAmount: 7551334,
    rawFinalDebtAmount: 7551334,
    status: 'pending_accounting'
  };
}

test('compareCloseout converts legacy negative returnedAmount into mismatch without throw', () => {
  const compare = DeliveryCloseoutService.compareCloseout(expectedCloseout(), {
    status: 'pending_accounting',
    originalAmount: 7842510,
    deliveredAmount: 8133686,
    returnedAmount: -291176,
    collectedAmount: 0,
    finalDebtAmount: 8133686
  });
  assert.equal(compare.ok, false);
  const mismatch = compare.mismatches.find((row) => row.field === 'returnedAmount');
  assert.equal(mismatch.reason, 'legacy_negative_closeout_value');
  assert.equal(mismatch.expected, 291176);
  assert.equal(mismatch.actual, -291176);
  assert.equal(mismatch.rawActual, -291176);
});

test('compareCloseout converts invalid and missing legacy snapshot money into mismatch', () => {
  const invalid = DeliveryCloseoutService.compareCloseout(expectedCloseout(), {
    status: 'pending_accounting',
    originalAmount: 7842510,
    deliveredAmount: 7551334,
    returnedAmount: 'invalid',
    collectedAmount: 0,
    finalDebtAmount: 7551334
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.mismatches.find((row) => row.field === 'returnedAmount').reason, 'invalid_legacy_closeout_money');

  const missing = DeliveryCloseoutService.compareCloseout(expectedCloseout(), {
    status: 'pending_accounting',
    originalAmount: 7842510,
    deliveredAmount: 7551334,
    collectedAmount: 0,
    finalDebtAmount: 7551334
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.mismatches.find((row) => row.field === 'returnedAmount').reason, 'missing_required_closeout_field');
});

test('compareCloseout stays ok for matching snapshot and throws for invalid canonical expected', () => {
  assert.equal(DeliveryCloseoutService.compareCloseout(expectedCloseout(), {
    status: 'pending_accounting',
    originalAmount: 7842510,
    deliveredAmount: 7551334,
    returnedAmount: 291176,
    collectedAmount: 0,
    finalDebtAmount: 7551334
  }).ok, true);

  assert.throws(
    () => DeliveryCloseoutService.compareCloseout({ ...expectedCloseout(), returnedAmount: -1 }, { status: 'pending_accounting' }),
    (err) => err.code === 'CONTRACT_VALIDATION_ERROR'
  );
  assert.throws(
    () => DeliveryCloseoutService.buildCloseout(
      { id: 'SO-NEG', code: 'B-NEG', customerCode: 'C1', totalAmount: 1000 },
      [{ id: 'RO-NEG', code: 'RO-NEG', sourceOrderId: 'SO-NEG', totalReturnAmount: -2000, status: 'active' }]
    ),
    (err) => err.code === 'DELIVERY_CLOSEOUT_CANONICAL_RETURN_NEGATIVE'
  );
});

test('confirmOneOrder rebuilds legacy negative snapshot from returnOrders SSoT', async () => {
  const calls = { audits: [], patch: null };
  const originalPatch = orderRepository.patchAccountingCloseoutById;
  const originalAllocation = OrderPaymentAllocationService.buildAndPostFromCloseout;
  const originalReconcile = OrderPaymentDebtReconcileService.reconcileOrderDebt;
  const originalAuditLog = auditService.log;

  orderRepository.patchAccountingCloseoutById = async (id, patch) => {
    calls.patch = { id, patch };
    return { matchedCount: 1, modifiedCount: 1 };
  };
  OrderPaymentAllocationService.buildAndPostFromCloseout = async (order, closeout) => ({
    allocation: {
      allocationCode: `OPA-${order.code}`,
      id: `OPA-${order.code}`,
      sourceId: closeout.id || order.id,
      sourceCode: order.code,
      cashAmount: closeout.cashAmount,
      bankAmount: closeout.bankAmount,
      rewardAmount: closeout.rewardAmount,
      returnAmount: closeout.returnedAmount,
      debtAmount: closeout.finalDebtAmount
    },
    arLedgers: [{ id: 'AR-DEBT-OPEN-SO-39101', idempotencyKey: 'AR-DEBT-OPEN:SO-39101', debit: 7551334 }],
    fundLedgers: [],
    expectedArLedgers: [],
    arPostingResults: []
  });
  OrderPaymentDebtReconcileService.reconcileOrderDebt = async () => ({ posted: false, skipped: true });
  auditService.log = async (action, payload) => {
    calls.audits.push({ action, payload });
    return { ok: true };
  };

  try {
    const order = {
      id: 'SO-39101',
      code: 'B0039101',
      customerCode: 'C1',
      totalAmount: 7842510,
      deliveryStatus: 'delivered',
      accountingConfirmed: false,
      deliveryCloseout: {
        status: 'pending_accounting',
        originalAmount: 7842510,
        deliveredAmount: 8133686,
        returnedAmount: -291176,
        collectedAmount: 0,
        finalDebtAmount: 8133686
      }
    };
    const result = await AccountingCloseoutService.confirmOneOrder(order, [
      { id: 'RO-39101', code: 'RO-39101', sourceOrderId: 'SO-39101', totalReturnAmount: 291176, status: 'active' }
    ], { actor: 'KT', skipReadModelRebuild: true });

    assert.equal(result.closeout.returnedAmount, 291176);
    assert.equal(result.closeout.finalDebtAmount, 7551334);
    assert.equal(result.rebuiltFromSsot, true);
    assert.equal(result.previousCloseoutMismatches.some((row) => row.reason === 'legacy_negative_closeout_value'), true);
    assert.equal(calls.patch.patch.deliveryCloseout.returnedAmount, 291176);
    assert.equal(calls.audits.some((row) => row.action === 'DELIVERY_CLOSEOUT_REBUILT_FROM_SSOT'), true);
  } finally {
    orderRepository.patchAccountingCloseoutById = originalPatch;
    OrderPaymentAllocationService.buildAndPostFromCloseout = originalAllocation;
    OrderPaymentDebtReconcileService.reconcileOrderDebt = originalReconcile;
    auditService.log = originalAuditLog;
  }
});

test('two-order fixture totals match Phase256A expected debt and returns', () => {
  const orderA = { id: 'SO-A', code: 'B0039101', customerCode: 'C1', totalAmount: 7842510 };
  const orderB = { id: 'SO-B', code: 'B0039100', customerCode: 'C2', totalAmount: 13606658, deliveryCloseout: { rewardAmount: 1850000 } };
  const closeoutA = DeliveryCloseoutService.buildCloseout(orderA, [
    { id: 'RO-A', code: 'RO-A', sourceOrderId: 'SO-A', totalReturnAmount: 291176, status: 'active' }
  ]);
  const closeoutB = DeliveryCloseoutService.buildCloseout(orderB, [
    { id: 'RO-B', code: 'RO-B', sourceOrderId: 'SO-B', totalReturnAmount: 282279, status: 'active' }
  ]);
  assert.equal(closeoutA.returnedAmount + closeoutB.returnedAmount, 573455);
  assert.equal(closeoutA.finalDebtAmount, 7551334);
  assert.equal(closeoutB.finalDebtAmount, 11474379);
  assert.equal(closeoutA.finalDebtAmount + closeoutB.finalDebtAmount, 19025713);
});
