'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNormalizationPlan } = require('../scripts/lib/arLegacyNormalizationCore');

test('Phase81 sends B0038423/B0038424 and ACC/REV mismatch chains to manual review', () => {
  const row = {
    _id: 'b0038423',
    id: 'AR-SALE-SO1782550380164673-ACC-SO1782550380164673-1782778730341',
    code: 'AR-SALE-REVERSAL-B0038423-REV-SO1782550380164673-1782778730341',
    account: 'AR',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingBatchId: 'REV-SO1782550380164673-1782778730341',
    active: true,
    reversed: false,
    customerCode: '4501221',
    customerName: 'Chị Hương',
    debit: 1000,
    credit: 0,
    amount: 1000,
    direction: 'debit',
    amountField: 'debit'
  };
  const plan = buildNormalizationPlan([row], { salesOrders: [{ id: 'SO1782550380164673', code: 'B0038423', customerCode: '4501221' }], returnOrders: [], debtCollections: [], fundLedgers: [] });
  assert.equal(plan.actions[0].actionType, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(plan.actions[0].safeToAutoApply, false);
  assert.match(plan.actions[0].reason, /manual accounting review|ACC\/REV/i);
});
