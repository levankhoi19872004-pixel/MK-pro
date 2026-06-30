'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNormalizationPlan } = require('../scripts/lib/arLegacyNormalizationCore');

function baseLedger(overrides = {}) {
  return {
    _id: overrides._id || overrides.id || 'ledger-1',
    id: overrides.id || 'AR-SALE-SO1780001001',
    code: overrides.code || overrides.id || 'AR-SALE-SO1780001001',
    account: 'AR',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: false,
    customerCode: 'C001',
    customerName: 'Customer 1',
    debit: 1000,
    credit: 0,
    amount: 1000,
    direction: 'debit',
    amountField: 'debit',
    ...overrides
  };
}

const salesOrder = {
  id: 'SO1780001001',
  code: 'B001001',
  orderCode: 'B001001',
  customerCode: 'C001',
  customerName: 'Customer 1',
  salesStaffCode: '35095',
  deliveryStaffCode: 'ghth',
  masterOrderId: 'MO1',
  masterOrderCode: 'DT1'
};
const returnOrder = {
  id: 'RO1780001001',
  code: 'RO-B001001',
  customerCode: 'C001',
  customerName: 'Customer 1',
  salesStaffCode: '35095',
  deliveryStaffCode: 'ghth',
  sourceOrderId: 'SO1780001001',
  sourceOrderCode: 'B001001'
};

test('Phase81 plan normalizes high-confidence AR-SALE only when a unique salesOrder source is matched', () => {
  const plan = buildNormalizationPlan([
    baseLedger({ _id: 'sale1', id: 'AR-SALE-SO1780001001', code: 'AR-SALE-SO1780001001' })
  ], { salesOrders: [salesOrder], returnOrders: [], debtCollections: [], fundLedgers: [] });
  const action = plan.actions[0];
  assert.equal(action.actionType, 'NORMALIZE_AR_SALE_CONTRACT');
  assert.equal(action.confidence, 'high');
  assert.equal(action.safeToAutoApply, true);
  assert.equal(action.after.category, 'AR-SALE');
  assert.equal(action.after.ledgerType, 'AR-SALE');
  assert.equal(action.after.entryType, 'normal');
  assert.equal(action.after.sourceType, 'salesOrder');
  assert.equal(action.after.sourceId, 'SO1780001001');
  assert.equal(action.after.sourceCode, 'B001001');
  assert.equal(action.after.idempotencyKey, 'AR-SALE:salesOrder:SO1780001001');
  assert.ok(action.rollbackPatch);
});

test('Phase81 plan refuses to normalize AR-SALE without a real source match', () => {
  const plan = buildNormalizationPlan([
    baseLedger({ _id: 'sale-no-source', id: 'AR-SALE-SO-NO-SOURCE', code: 'AR-SALE-SO-NO-SOURCE' })
  ], { salesOrders: [], returnOrders: [], debtCollections: [], fundLedgers: [] });
  assert.equal(plan.actions[0].actionType, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(plan.actions[0].safeToAutoApply, false);
});

test('Phase81 plan normalizes high-confidence AR-RETURN only when a unique returnOrder source is matched', () => {
  const plan = buildNormalizationPlan([
    baseLedger({ _id: 'return1', id: 'AR-RETURN-RO-B001001', code: 'AR-RETURN-RO-B001001', debit: 0, credit: 250, amount: 250, direction: 'credit', amountField: 'credit' })
  ], { salesOrders: [], returnOrders: [returnOrder], debtCollections: [], fundLedgers: [] });
  const action = plan.actions[0];
  assert.equal(action.actionType, 'NORMALIZE_AR_RETURN_CONTRACT');
  assert.equal(action.confidence, 'high');
  assert.equal(action.after.category, 'AR-RETURN');
  assert.equal(action.after.sourceType, 'returnOrder');
  assert.equal(action.after.sourceId, 'RO1780001001');
  assert.equal(action.after.idempotencyKey, 'AR-RETURN:returnOrder:RO1780001001');
});

test('Phase81 plan marks true duplicate inactive and never deletes it', () => {
  const rows = [
    baseLedger({ _id: 'dup-a', id: 'AR-SALE-SO1780001001-A', idempotencyKey: 'AR-SALE:salesOrder:SO1780001001', category: 'AR-SALE', ledgerType: 'AR-SALE', entryType: 'normal', sourceType: 'salesOrder', sourceId: 'SO1780001001', sourceCode: 'B001001' }),
    baseLedger({ _id: 'dup-b', id: 'AR-SALE-SO1780001001-B', idempotencyKey: 'AR-SALE:salesOrder:SO1780001001' })
  ];
  const plan = buildNormalizationPlan(rows, { salesOrders: [salesOrder], returnOrders: [], debtCollections: [], fundLedgers: [] });
  const duplicate = plan.actions.find((action) => action.actionType === 'MARK_DUPLICATE_INACTIVE');
  assert.ok(duplicate);
  assert.equal(duplicate.after.active, false);
  assert.equal(duplicate.after.accountingStatus, 'duplicate_cancelled');
  assert.ok(!JSON.stringify(duplicate).includes('deleteOne'));
});
