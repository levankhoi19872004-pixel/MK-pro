'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeModel } = require('./helpers/phase79FakeModels');
const {
  buildNormalizationPlan,
  validatePlanForApply,
  applyNormalizationPlan
} = require('../scripts/lib/arLegacyNormalizationCore');
const arLedgerReadService = require('../src/services/arLedgerRead.service');

function saleFixture() {
  return {
    _id: 'sale1',
    id: 'AR-SALE-SO1780001001',
    code: 'AR-SALE-SO1780001001',
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
    amountField: 'debit'
  };
}
const salesOrder = { id: 'SO1780001001', code: 'B001001', customerCode: 'C001', customerName: 'Customer 1', salesStaffCode: '35095', deliveryStaffCode: 'ghth' };

test('Phase81 apply refuses empty plans, missing rollback patches, and low-confidence-only plans', () => {
  assert.throws(() => validatePlanForApply({ actions: [] }), /empty Phase81 plan/);
  assert.throws(() => validatePlanForApply({ actions: [{ actionType: 'NORMALIZE_AR_SALE_CONTRACT', confidence: 'high', safeToAutoApply: true, after: { category: 'AR-SALE' } }] }), /rollbackPatch/);
  assert.throws(() => validatePlanForApply({ actions: [{ actionType: 'MANUAL_REVIEW_REQUIRED', confidence: 'low', safeToAutoApply: false, rollbackPatch: { $set: {} }, after: {} }] }), /without high-confidence/);
});

test('Phase81 dry-run apply does not mutate ledger rows', async () => {
  const row = saleFixture();
  const plan = buildNormalizationPlan([row], { salesOrders: [salesOrder], returnOrders: [], debtCollections: [], fundLedgers: [] });
  const model = new FakeModel([row]);
  const result = await applyNormalizationPlan(plan, { ArLedger: model }, { dryRun: true });
  assert.equal(result.requestedActions, 1);
  assert.equal(result.appliedActions, 0);
  assert.equal(model.rows[0].category, undefined);
});

test('Phase81 apply on fixture creates canonical ledger readable by Phase80 read layer', async () => {
  const row = saleFixture();
  const plan = buildNormalizationPlan([row], { salesOrders: [salesOrder], returnOrders: [], debtCollections: [], fundLedgers: [] });
  const model = new FakeModel([row]);
  await applyNormalizationPlan(plan, { ArLedger: model }, { dryRun: false, actor: 'unit-test' });
  arLedgerReadService.setModelsForTest({ ArLedger: model });
  const canonical = await arLedgerReadService.getCanonicalArLedgers({ status: 'all' });
  arLedgerReadService.setModelsForTest(null);
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].category, 'AR-SALE');
  assert.equal(canonical[0].sourceId, 'SO1780001001');
});
