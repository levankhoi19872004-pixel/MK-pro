'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Audit = require('../scripts/audit-closeout-ar-splitbrain');
const DeliveryPaymentStateReadService = require('../src/services/delivery/DeliveryPaymentStateReadService');
const returnArPostingService = require('../src/services/accounting/returnArPostingService');

function fakeQuery(rows) {
  return {
    select(){ return this; }, sort(){ return this; }, session(){ return this; },
    lean(){ return Promise.resolve(rows.map((row) => ({ ...row }))); }
  };
}
function fakeModel(rows) { return { find(){ return fakeQuery(rows); } }; }
function order() {
  return {
    id: 'SO-R1P3A', orderId: 'SO-R1P3A', salesOrderId: 'SO-R1P3A',
    code: 'R1P3A-RETURN-AMOUNT-CONFLICT-001', orderCode: 'R1P3A-RETURN-AMOUNT-CONFLICT-001', salesOrderCode: 'R1P3A-RETURN-AMOUNT-CONFLICT-001',
    customerCode: 'C-R1P3A', customerName: 'Return Amount Conflict',
    receivableAmount: 10000, cashAmount: 0, bankAmount: 0, rewardAmount: 0, accountingConfirmed: true
  };
}
function correction(o = order()) {
  return {
    id: 'DCOC-R1P3A', correctionId: 'DCOC-R1P3A', correctionCode: 'DCOC-R1P3A',
    orderId: o.id, salesOrderId: o.id, orderCode: o.code, salesOrderCode: o.code,
    customerCode: o.customerCode, receivableDelta: 0, cashDelta: 0, bankDelta: 0, rewardDelta: 0, returnDelta: 0
  };
}
function returnOrder() {
  return {
    id: 'RO-R1P3A', code: 'RO-R1P3A', returnOrderId: 'RO-R1P3A', returnOrderCode: 'RO-R1P3A',
    sourceModel: 'returnOrders', salesOrderId: 'SO-R1P3A', salesOrderCode: 'R1P3A-RETURN-AMOUNT-CONFLICT-001',
    customerCode: 'C-R1P3A', customerId: 'C-R1P3A',
    status: 'posted_to_ar', returnState: 'posted_to_ar', accountingStatus: 'accounting_confirmed',
    accountingConfirmed: true, arPosted: true,
    returnAmount: 2000,
    amount: 1500
  };
}
function baseLedger() {
  return {
    id: 'AR-OPEN-R1P3A', account: 'AR', category: 'AR-DEBT-OPEN', ledgerType: 'AR-DEBT-OPEN',
    sourceType: 'SALES_ORDER_DELIVERY_CLOSEOUT', sourceId: 'SO-R1P3A', sourceCode: 'R1P3A-RETURN-AMOUNT-CONFLICT-001',
    entryType: 'normal', idempotencyKey: 'AR-DEBT-OPEN:SO-R1P3A', accountingConfirmed: true,
    accountingStatus: 'confirmed', active: true, orderId: 'SO-R1P3A', orderCode: 'R1P3A-RETURN-AMOUNT-CONFLICT-001',
    salesOrderId: 'SO-R1P3A', salesOrderCode: 'R1P3A-RETURN-AMOUNT-CONFLICT-001', customerCode: 'C-R1P3A',
    debit: 10000, credit: 0, amount: 10000, direction: 'debit', amountField: 'debit', status: 'posted'
  };
}
function returnLedger() {
  return {
    id: 'AR-RET-R1P3A', code: 'AR-RET-R1P3A', account: 'AR', category: 'AR-RETURN', ledgerType: 'AR-RETURN',
    sourceType: 'RETURN_ORDER', refType: 'RETURN_ORDER', sourceModel: 'returnOrders', entryType: 'normal',
    accountingConfirmed: true, accountingStatus: 'confirmed', active: true,
    returnOrderId: 'RO-R1P3A', returnOrderCode: 'RO-R1P3A', refId: 'RO-R1P3A', refCode: 'RO-R1P3A',
    sourceId: 'RO-R1P3A', sourceCode: 'RO-R1P3A', orderId: 'SO-R1P3A', orderCode: 'R1P3A-RETURN-AMOUNT-CONFLICT-001',
    salesOrderId: 'SO-R1P3A', salesOrderCode: 'R1P3A-RETURN-AMOUNT-CONFLICT-001', customerCode: 'C-R1P3A',
    debit: 0, credit: 1500, amount: 1500, direction: 'credit', amountField: 'credit', status: 'posted',
    idempotencyKey: 'AR-RETURN:RO-R1P3A'
  };
}

async function productionShapedSnapshot(row) {
  const o = order();
  const result = await DeliveryPaymentStateReadService.resolvePaymentStatesForOrders([o], {
    includeReturnState: true,
    models: {
      DeliveryCloseoutVersion: fakeModel([]),
      OrderPaymentAllocation: fakeModel([]),
      ReturnOrder: fakeModel([row])
    }
  });
  const state = result.states[0];
  return {
    o,
    snapshot: {
      ok: true,
      state,
      debtRaw: state.debtRaw,
      returnState: DeliveryPaymentStateReadService._private.ReturnStateReader.returnStateForOrder(o, result.returnStatesByIdentity),
      returnRows: DeliveryPaymentStateReadService.returnRowsForOrder(o, result.returnResult),
      allocationRef: '', closeoutVersionRef: ''
    }
  };
}

test('R1P3A RED: conflicting return money fields must never audit as aligned/no_mismatch', async () => {
  const ro = returnOrder();
  const deliveryAmount = DeliveryPaymentStateReadService._private.ReturnStateReader.returnOrderAmount(ro, []);
  const posting = returnArPostingService._internal.returnOrderAmountAnalysis(ro);
  assert.equal(deliveryAmount, 2000, 'production Delivery resolver must choose returnAmount=2000');
  assert.equal(posting.amount, 1500, 'production AR posting analysis must choose amount=1500');
  assert.equal(posting.amountField, 'amount');
  assert.ok(posting.warnings.some((warning) => warning.code === 'return_amount_field_mismatch'));

  const { o, snapshot } = await productionShapedSnapshot(ro);
  assert.equal(snapshot.state.returnAmount, 2000);
  assert.equal(snapshot.debtRaw, 8000);

  const ledgers = [baseLedger(), returnLedger()];
  const canonical = Audit.canonicalRowsFromFixture(ledgers);
  const result = Audit.classifyTimeline({
    correction: correction(o),
    canonicalOrderRows: canonical,
    allArRows: ledgers,
    snapshot
  });

  assert.equal(result.canonicalArDebt, 8500);
  assert.equal(result.deliveryCanonicalReturnAmount, 2000);
  assert.equal(result.postingCanonicalReturnAmount, 1500);
  assert.equal(result.effectiveArReturnAmount, 1500);
  assert.equal(result.sourceFieldMismatch, true);
  assert.match(result.issues, /RETURN_SOURCE_AMOUNT_FIELD_MISMATCH/);
  assert.doesNotMatch(result.returnIssues, /RETURN_AR_ALIGNED/);
  assert.notEqual(result.classification, 'no_mismatch');
});
