'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { FakeModel } = require('./helpers/phase79FakeModels');

const searchServicePath = require.resolve(path.join(__dirname, '..', 'src/services/searchService.js'));
const previousSearchService = require.cache[searchServicePath];
require.cache[searchServicePath] = {
  id: searchServicePath, filename: searchServicePath, loaded: true,
  exports: { async searchStaffs() { return []; } }
};

const Planner = require('../src/services/accounting/HistoricalCorrectionRepairPlanner');
const Executor = require('../src/services/accounting/HistoricalCorrectionRepairExecutor');
const arReadService = require('../src/services/arLedgerRead.service');
const arPostingService = require('../src/services/arPosting.service');
const debtNew = require('../src/services/v2/debtNew.service');
const returnArPostingService = require('../src/services/accounting/returnArPostingService');

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ar-splitbrain-r1p4-b0041181.fixture.json'), 'utf8'));
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function canonicalOpening(input = FIXTURE) { return clone(input.arLedgers[0]); }
function canonicalReceipt({ id='AR-RECEIPT-AFTER', amount=5000000, order=FIXTURE.order } = {}) {
  return {
    id, code:id, account:'AR', category:'AR-RECEIPT-CASH', ledgerType:'AR-RECEIPT-CASH', entryType:'normal', type:'ar-receipt-cash',
    sourceType:'DEBTCOLLECTION', sourceId:order.id, sourceCode:order.code,
    refType:'DEBTCOLLECTION', refId:`DC-${id}`, refCode:`DC-${id}`,
    orderId:order.id, orderCode:order.code, salesOrderId:order.id, salesOrderCode:order.code,
    customerCode:order.customerCode, customerName:order.customerName,
    debit:0, credit:amount, amount, direction:'credit', amountField:'credit',
    status:'posted', active:true, reversed:false, accountingConfirmed:true, accountingStatus:'confirmed',
    idempotencyKey:`AR-RECEIPT:${id}:${order.id}`, createdAt:'2026-08-05T00:00:00.000Z', updatedAt:'2026-08-05T00:00:00.000Z'
  };
}
function canonicalReturn({ amount=2000000, order=FIXTURE.order } = {}) {
  return {
    ...returnArPostingService.buildReturnARLedgerEntry({
      id:'RO-R1P4-1', code:'RO-R1P4-1', returnOrderId:'RO-R1P4-1', returnOrderCode:'RO-R1P4-1',
      sourceModel:'returnOrders', customerCode:order.customerCode, customerName:order.customerName,
      orderId:order.id, orderCode:order.code, salesOrderId:order.id, salesOrderCode:order.code,
      amount, accountingConfirmed:true, accountingStatus:'confirmed', createdAt:'2026-08-06T00:00:00.000Z'
    }, { assumeConfirmed:true, confirmedBy:'r1p4-test' }),
    entryType:'normal', active:true, reversed:false
  };
}

let rows;
let model;
function installRows(initialRows) {
  rows = initialRows.map(clone);
  model = new FakeModel(rows);
  const empty = new FakeModel([]);
  arReadService.setModelsForTest({ ArLedger: model });
  arPostingService.setModelsForTest({ ArLedger: model, SalesOrder: {}, AuditLog: {} });
  debtNew.setModelsForTest({ ArLedger: model, DebtCollection: empty, OrderPaymentAllocation: empty });
}
async function currentAr(order = FIXTURE.order) {
  const inspect = await arReadService.inspectActiveDebtReadModelLedgersByOrderKeys(
    [order.id, order.code], { customerCode: order.customerCode, status:'all' }, {}
  );
  return arReadService._internal.sumCanonicalBalanceRows(inspect.canonicalLedgers || []);
}
function inputWithRows(input, currentRows) {
  return {
    ...clone(input),
    arLedgers: currentRows.map(clone),
    currentArBeforeObserved: currentRows.reduce((sum, r) => sum + Number(r.debit || 0) - Number(r.credit || 0), 0),
    subsequentEvents: currentRows.filter((r) => String(r.createdAt || '') > '2026-08-02T00:00:00.000Z')
  };
}
function planFor(input, generatedAt='2026-08-10T03:00:00.000Z') {
  return Planner.createRepairPlan({ ...clone(input), generatedAt });
}
function depsFor(input) {
  return {
    withTransaction: async (work) => {
      const snapshot = clone(rows);
      try { return await work({ id:'FAKE-TX' }); }
      catch (error) { rows.splice(0, rows.length, ...snapshot); throw error; }
    },
    reloadEvidence: async () => ({
      ...clone(input),
      arLedgers: rows.map(clone),
      currentArBeforeObserved: await currentAr(input.order)
    })
  };
}

async function execute(plan, input, extra = {}, depsOverride = {}) {
  const item = plan.items[0];
  return Executor.executePlanItem({
    plan, planHash:plan.planHash, planItemHash:item.planItemHash,
    orderCode:plan.orderCode, apply:true, actor:'r1p4-test', ...extra
  }, { ...depsFor(input), ...depsOverride });
}

test.afterEach(() => {
  arReadService.setModelsForTest(null); arPostingService.setModelsForTest(null); debtNew.setModelsForTest(null);
});
test.after(() => {
  if (previousSearchService) require.cache[searchServicePath] = previousSearchService;
  else delete require.cache[searchServicePath];
});

test('R1P4 executor B0041181: actual canonical event posts once, AR raw=85 and Debt New/list/suggestion=0', async () => {
  installRows([canonicalOpening()]);
  const input = inputWithRows(FIXTURE, rows);
  const plan = planFor(input);
  assert.equal(plan.items[0].expectedMissingEventDelta, -23800000);

  const result = await execute(plan, input);
  assert.equal(result.applied, true);
  assert.equal(result.expectedMissingEventDelta, -23800000);
  assert.equal(result.arBefore, 23800085);
  assert.equal(result.arAfter, 85);
  assert.equal(result.expectedArAfter, 85);
  const correctionRows = rows.filter((r) => r.category === 'AR-ADJUSTMENT' && r.sourceType === 'DELIVERY_CLOSEOUT_CORRECTION');
  assert.equal(correctionRows.length, 1);
  const ledger = correctionRows[0];
  assert.equal(ledger.debit, 0);
  assert.equal(ledger.credit, 23800000);
  assert.equal(ledger.refId, 'DCOC-B0041181-v2');
  assert.equal(ledger.sourceId, 'SO-B0041181');
  assert.equal(ledger.idempotencyKey, plan.items[0].idempotencyIdentity);
  assert.equal(rows.some((r) => r.category === 'AR-DEBT-ADJUSTMENT'), false);

  const list = await debtNew.listCustomers({ customerCode:'4499499', status:'all' }, { disableAggregation:true });
  const customer = list.customers.find((r) => r.customerCode === '4499499');
  const projected = list.orders.find((r) => r.orderCode === 'B0041181');
  assert.ok(customer); assert.ok(projected);
  assert.equal(customer.debtAmount, 0);
  assert.equal(projected.debt, 0);
  assert.equal(projected.debtAmount, 0);
  assert.equal(projected.remainingDebt, 0);
  const suggestions = await debtNew.suggestions({ q:'B0041181', type:'order', limit:10 }, {});
  const suggestion = suggestions.items.find((r) => r.orderCode === 'B0041181');
  assert.ok(suggestion);
  assert.equal(suggestion.debtAmount, 0);
  assert.equal(String(suggestion.subLabel).includes('85'), false);

  const retry = await execute(plan, input);
  assert.equal(retry.applied, false);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.reason, 'ALREADY_POSTED');
  assert.equal(rows.filter((r) => r.category === 'AR-ADJUSTMENT' && r.sourceType === 'DELIVERY_CLOSEOUT_CORRECTION').length, 1);
});

test('R1P4 executor preserves subsequent confirmed receipt: current AR + historical delta, never target snapshot', async () => {
  const receipt = canonicalReceipt({ amount:5000000 });
  installRows([canonicalOpening(), receipt]);
  const input = inputWithRows(FIXTURE, rows);
  const plan = planFor(input, '2026-08-10T04:00:00.000Z');
  assert.equal(plan.items[0].expectedMissingEventDelta, -23800000);
  assert.equal(plan.items[0].currentArBeforeObserved, 18800085);
  assert.equal(plan.items[0].expectedCurrentArAfterIfAppliedNow, -4999915);

  const result = await execute(plan, input);
  assert.equal(result.arBefore, 18800085);
  assert.equal(result.arAfter, -4999915);
  assert.equal(rows.filter((r) => r.category === 'AR-RECEIPT-CASH').length, 1);
  assert.equal(rows.find((r) => r.category === 'AR-RECEIPT-CASH').credit, 5000000);
});

test('R1P4 executor preserves subsequent AR-RETURN and never generic-repairs return', async () => {
  const ret = canonicalReturn({ amount:2000000 });
  installRows([canonicalOpening(), ret]);
  const input = inputWithRows(FIXTURE, rows);
  const plan = planFor(input, '2026-08-10T05:00:00.000Z');
  assert.equal(plan.items[0].expectedMissingEventDelta, -23800000);
  const result = await execute(plan, input);
  assert.equal(result.arBefore, 21800085);
  assert.equal(result.arAfter, -1999915);
  assert.equal(rows.filter((r) => r.category === 'AR-RETURN').length, 1);
  assert.equal(rows.filter((r) => r.category === 'AR-ADJUSTMENT').length, 1);
});

test('R1P4 executor fails closed on duplicate existing event', async () => {
  installRows([canonicalOpening()]);
  const input = inputWithRows(FIXTURE, rows);
  const plan = planFor(input, '2026-08-10T06:00:00.000Z');
  const item = plan.items[0];
  const preview = item.canonicalLedgerPreview;
  rows.push({ ...clone(preview), id:'DUP-A', code:'DUP-A', account:'AR', entryType:'normal', active:true, reversed:false, status:'posted', accountingConfirmed:true, accountingStatus:'confirmed', orderId:item.orderId, orderCode:item.orderCode, salesOrderId:item.orderId, salesOrderCode:item.orderCode, customerCode:item.customerCode, correctionId:item.correctionId, correctionCode:item.correctionCode });
  rows.push({ ...clone(preview), id:'DUP-B', code:'DUP-B', account:'AR', entryType:'normal', active:true, reversed:false, status:'posted', accountingConfirmed:true, accountingStatus:'confirmed', orderId:item.orderId, orderCode:item.orderCode, salesOrderId:item.orderId, salesOrderCode:item.orderCode, customerCode:item.customerCode, correctionId:item.correctionId, correctionCode:item.correctionCode });
  await assert.rejects(execute(plan, input), (e) => e && e.code === 'HISTORICAL_REPAIR_PRECONDITION_FAILED' && e.data?.classification === 'DUPLICATE_EXISTING_EVENT');
});

test('R1P4 executor fails closed on existing event amount mismatch', async () => {
  installRows([canonicalOpening()]);
  const input = inputWithRows(FIXTURE, rows);
  const plan = planFor(input, '2026-08-10T07:00:00.000Z');
  const item = plan.items[0];
  const preview = item.canonicalLedgerPreview;
  rows.push({ ...clone(preview), id:'WRONG', code:'WRONG', account:'AR', entryType:'normal', debit:0, credit:10000000, amount:10000000, active:true, reversed:false, status:'posted', accountingConfirmed:true, accountingStatus:'confirmed', orderId:item.orderId, orderCode:item.orderCode, salesOrderId:item.orderId, salesOrderCode:item.orderCode, customerCode:item.customerCode, correctionId:item.correctionId, correctionCode:item.correctionCode });
  await assert.rejects(execute(plan, input), (e) => e && e.code === 'HISTORICAL_REPAIR_PRECONDITION_FAILED' && e.data?.classification === 'EVENT_AMOUNT_MISMATCH');
});

test('R1P4 executor transaction wrapper rolls back if posting/invariant path throws', async () => {
  installRows([canonicalOpening()]);
  const input = inputWithRows(FIXTURE, rows);
  const plan = planFor(input, '2026-08-10T08:00:00.000Z');
  const before = clone(rows);
  await assert.rejects(execute(plan, input, {}, {
    postCorrectionEvent: async () => {
      rows.push({ id:'PARTIAL-WRITE', category:'AR-ADJUSTMENT', credit:23800000 });
      const err = new Error('simulated persistence/invariant failure'); err.code='TEST_REPAIR_POST_FAILURE'; throw err;
    }
  }), (e) => e && e.code === 'TEST_REPAIR_POST_FAILURE');
  assert.deepEqual(rows, before);
});

test('R1P4 executor requires explicit apply, exact plan hash and exact order', () => {
  installRows([canonicalOpening()]);
  const input = inputWithRows(FIXTURE, rows);
  const plan = planFor(input, '2026-08-10T09:00:00.000Z');
  const item = plan.items[0];
  assert.throws(() => Executor.assertApplyGuard({ apply:false, plan, planHash:plan.planHash, orderCode:plan.orderCode, planItemHash:item.planItemHash }), (e) => e.code === 'HISTORICAL_REPAIR_APPLY_REQUIRED');
  assert.throws(() => Executor.assertApplyGuard({ apply:true, plan, planHash:'bad', orderCode:plan.orderCode, planItemHash:item.planItemHash }), (e) => e.code === 'HISTORICAL_REPAIR_PLAN_HASH_MISMATCH');
  assert.throws(() => Executor.assertApplyGuard({ apply:true, plan, planHash:plan.planHash, orderCode:'OTHER', planItemHash:item.planItemHash }), (e) => e.code === 'HISTORICAL_REPAIR_ORDER_MISMATCH');
});
