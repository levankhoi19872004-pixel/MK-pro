'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeModel } = require('./helpers/phase79FakeModels');
const arReadService = require('../src/services/arLedgerRead.service');
const arPostingService = require('../src/services/arPosting.service');
const eventDeltaService = require('../src/services/accounting/CloseoutCorrectionArEventDeltaPostingService');

function openingLedger(order) {
  return {
    id: 'AR-OPEN-B0041181', code: 'AR-OPEN-B0041181', account: 'AR',
    category: 'AR-SALE', ledgerType: 'AR-SALE', entryType: 'normal', type: 'ar-sale',
    sourceType: 'ORDER_PAYMENT_ALLOCATION', sourceId: order.id, sourceCode: order.code,
    refType: 'ORDER_PAYMENT_ALLOCATION', refId: 'DCO-B0041181-v1', refCode: 'DCO-B0041181-v1',
    orderId: order.id, orderCode: order.code, salesOrderId: order.id, salesOrderCode: order.code,
    customerCode: order.customerCode, customerName: order.customerName,
    debit: 23800085, credit: 0, amount: 23800085, direction: 'debit', amountField: 'debit',
    status: 'posted', active: true, reversed: false, accountingConfirmed: true, accountingStatus: 'confirmed',
    idempotencyKey: 'AR-SALE:B0041181', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z'
  };
}

const order = {
  id: 'SO-B0041181', orderId: 'SO-B0041181', salesOrderId: 'SO-B0041181',
  code: 'B0041181', orderCode: 'B0041181', salesOrderCode: 'B0041181',
  customerCode: '4499499', customerName: 'Đinh Mười', accountingConfirmed: true, accountingStatus: 'confirmed',
  totalAmount: 23800085,
  deliveryCloseout: {
    id: 'DCO-B0041181-v1', code: 'DCO-B0041181-v1', closeoutVersion: 1, status: 'confirmed',
    originalAmount: 23800085, receivableAmount: 23800085,
    cashAmount: 0, bankAmount: 0, rewardAmount: 0, returnAmount: 0, debtAmount: 23800085
  }
};

const historicalCorrection = {
  id: 'DCOC-B0041181-v2', code: 'DCOC-B0041181-v2', correctionId: 'DCOC-B0041181-v2', correctionCode: 'DCOC-B0041181-v2',
  orderId: order.id, orderCode: order.code, salesOrderId: order.id, salesOrderCode: order.code,
  customerCode: order.customerCode, customerName: order.customerName,
  originalCloseoutId: 'DCO-B0041181-v1', originalCloseoutVersion: 1, newCloseoutVersion: 2,
  previousCashAmount: 0, previousBankAmount: 0, previousRewardAmount: 0, previousReturnAmount: 0, previousDebtAmount: 23800085,
  newCashAmount: 22140000, newBankAmount: 0, newRewardAmount: 1660000, newReturnAmount: 0, newDebtAmount: 85,
  cashDeltaAmount: 22140000, bankDeltaAmount: 0, rewardDeltaAmount: 1660000, returnAdjustmentAmount: 0,
  sourceType: 'DELIVERY_CLOSEOUT_CORRECTION', status: 'confirmed', createdAt: '2026-08-02T00:00:00.000Z'
};

const historicalVersion = {
  id: 'DCOV-B0041181-v2', code: 'DCOV-B0041181-v2', originalCloseoutId: 'DCO-B0041181-v1',
  closeoutVersion: 2, correctionId: historicalCorrection.id, correctionCode: historicalCorrection.code,
  orderId: order.id, orderCode: order.code, salesOrderId: order.id, salesOrderCode: order.code,
  customerCode: order.customerCode, saleAmount: 23800085, originalAmount: 23800085,
  previousCashAmount: 0, previousBankAmount: 0, previousRewardAmount: 0, previousReturnAmount: 0, previousDebtAmount: 23800085,
  cashAmount: 22140000, bankAmount: 0, rewardAmount: 1660000, returnAmount: 0, debtAmount: 85,
  cashDeltaAmount: 22140000, bankDeltaAmount: 0, rewardDeltaAmount: 1660000, returnAdjustmentAmount: 0,
  sourceType: 'DELIVERY_CLOSEOUT_CORRECTION', status: 'corrected_confirmed', immutable: true,
  createdAt: '2026-08-02T00:00:00.000Z'
};

const currentNoopCorrection = {
  id: 'DCOC-B0041181-v3-NOOP', code: 'DCOC-B0041181-v3-NOOP', correctionId: 'DCOC-B0041181-v3-NOOP', correctionCode: 'DCOC-B0041181-v3-NOOP',
  newCloseoutVersion: 3, orderId: order.id, orderCode: order.code, salesOrderId: order.id, salesOrderCode: order.code,
  customerCode: order.customerCode, customerName: order.customerName,
  previousCashAmount: 22140000, previousBankAmount: 0, previousRewardAmount: 1660000, previousReturnAmount: 0,
  newCashAmount: 22140000, newBankAmount: 0, newRewardAmount: 1660000, newReturnAmount: 0,
  cashDeltaAmount: 0, bankDeltaAmount: 0, rewardDeltaAmount: 0, returnAdjustmentAmount: 0,
  sourceType: 'DELIVERY_CLOSEOUT_CORRECTION', status: 'confirmed', createdAt: '2026-08-09T00:00:00.000Z'
};


const currentNoopVersion = {
  id: 'DCOV-B0041181-v3', code: 'DCOV-B0041181-v3', originalCloseoutId: 'DCO-B0041181-v1',
  closeoutVersion: 3, originalCloseoutVersion: 2, correctionId: currentNoopCorrection.id, correctionCode: currentNoopCorrection.code,
  orderId: order.id, orderCode: order.code, salesOrderId: order.id, salesOrderCode: order.code,
  customerCode: order.customerCode, saleAmount: 23800085, originalAmount: 23800085,
  previousCashAmount: 22140000, previousBankAmount: 0, previousRewardAmount: 1660000, previousReturnAmount: 0, previousDebtAmount: 85,
  cashAmount: 22140000, bankAmount: 0, rewardAmount: 1660000, returnAmount: 0, debtAmount: 85,
  cashDeltaAmount: 0, bankDeltaAmount: 0, rewardDeltaAmount: 0, returnAdjustmentAmount: 0,
  sourceType: 'DELIVERY_CLOSEOUT_CORRECTION', status: 'corrected_confirmed', immutable: true,
  createdAt: '2026-08-09T00:00:00.000Z'
};

let rows;

test.afterEach(() => {
  arReadService.setModelsForTest(null);
  arPostingService.setModelsForTest(null);
});

test('R1P4 RED production-shaped B0041181: no-op stays safe; forensic engine must locate earlier -23.8m missing event', async () => {
  rows = [openingLedger(order)];
  const model = new FakeModel(rows);
  arReadService.setModelsForTest({ ArLedger: model });
  arPostingService.setModelsForTest({ ArLedger: model, SalesOrder: {}, AuditLog: {} });

  const noop = await eventDeltaService.postCorrectionEventDelta({
    order,
    correction: currentNoopCorrection,
    version: { closeoutVersion: 3 }
  }, { actor: 'r1p4-red', now: '2026-08-09T00:00:00.000Z', zeroTolerance: 1000 });

  assert.equal(noop.skipped, true);
  assert.equal(noop.reason, 'ZERO_CORRECTION_OWNED_DEBT_DELTA');
  assert.equal(noop.correctionOwnedDebtDelta, 0);
  assert.equal(noop.arAfter, 23800085);
  assert.equal(rows.filter((row) => row.category === 'AR-ADJUSTMENT').length, 0);

  // R1.3a has no immutable-history reconstruction capability. This assertion is
  // intentionally RED until R1.4 introduces a read-only timeline engine.
  const timeline = require('../src/services/accounting/HistoricalCorrectionTimelineService');
  const transitions = timeline.reconstructHistoricalTransitions({
    order,
    corrections: [historicalCorrection, currentNoopCorrection],
    versions: [historicalVersion, currentNoopVersion]
  });
  const missingTransition = transitions.find((row) => row.correctionId === historicalCorrection.id);
  const noopTransition = transitions.find((row) => row.correctionId === currentNoopCorrection.id);

  assert.ok(missingTransition);
  assert.equal(missingTransition.correctionOwnedDebtDelta, -23800000);
  assert.equal(missingTransition.classification, 'RECONSTRUCTED');
  assert.ok(noopTransition);
  assert.equal(noopTransition.fromVersion, 2);
  assert.equal(noopTransition.correctionOwnedDebtDelta, 0);
  assert.equal(noopTransition.classification, 'NO_EFFECT');
});
