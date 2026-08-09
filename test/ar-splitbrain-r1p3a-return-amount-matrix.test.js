'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Audit = require('../scripts/audit-closeout-ar-splitbrain');
const DeliveryPaymentStateReadService = require('../src/services/delivery/DeliveryPaymentStateReadService');
const returnArPostingService = require('../src/services/accounting/returnArPostingService');

function analysis(fields) {
  const diagnostics = [];
  const delivery = DeliveryPaymentStateReadService._private.ReturnStateReader.returnOrderAmount(fields, diagnostics);
  const posting = returnArPostingService._internal.returnOrderAmountAnalysis(fields);
  const audit = Audit.returnAmountAnalysisForAudit(fields);
  return { delivery, posting, audit, diagnostics };
}

const matrix = [
  ['A aligned', { returnAmount: 2000, amount: 2000 }, 2000, 2000, false],
  ['B returnAmount vs amount conflict', { returnAmount: 2000, amount: 1500 }, 2000, 1500, true],
  ['C totalReturnAmount vs amount conflict', { totalReturnAmount: 2500, amount: 1500 }, 2500, 1500, true],
  ['D one valid field', { returnAmount: 2000 }, 2000, 2000, false],
  ['E explicit zero remains authoritative for Delivery', { totalReturnAmount: 0, amount: 1500 }, 0, 1500, true],
  ['F null alternatives preserve resolver contract', { returnAmount: null, amount: 1500 }, 1500, 1500, false]
];

for (const [name, fields, expectedDelivery, expectedPosting, mismatch] of matrix) {
  test(`R1P3A amount matrix ${name}`, () => {
    const row = analysis(fields);
    assert.equal(row.delivery, expectedDelivery);
    assert.equal(row.posting.amount, expectedPosting);
    assert.equal(row.audit.deliveryCanonicalReturnAmount, expectedDelivery);
    assert.equal(row.audit.postingCanonicalReturnAmount, expectedPosting);
    assert.equal(row.audit.sourceFieldMismatch, mismatch);
  });
}

function fakeQuery(rows) { return { select(){return this;}, sort(){return this;}, session(){return this;}, lean(){return Promise.resolve(rows.map(r=>({...r})));} }; }
function fakeModel(rows) { return { find(){ return fakeQuery(rows); } }; }
function baseOrder(code) { return { id:`SO-${code}`,orderId:`SO-${code}`,salesOrderId:`SO-${code}`,code,orderCode:code,salesOrderCode:code,customerCode:`C-${code}`,customerName:'R1P3A',receivableAmount:10000,cashAmount:0,bankAmount:0,rewardAmount:0,accountingConfirmed:true }; }
function correction(o) { return { id:`DCOC-${o.code}`,correctionId:`DCOC-${o.code}`,correctionCode:`DCOC-${o.code}`,orderId:o.id,salesOrderId:o.id,orderCode:o.code,salesOrderCode:o.code,customerCode:o.customerCode,receivableDelta:0,cashDelta:0,bankDelta:0,rewardDelta:0,returnDelta:0 }; }
function returnOrder(o, fields) { return { id:`RO-${o.code}`,code:`RO-${o.code}`,returnOrderId:`RO-${o.code}`,returnOrderCode:`RO-${o.code}`,sourceModel:'returnOrders',salesOrderId:o.id,salesOrderCode:o.code,customerCode:o.customerCode,customerId:o.customerCode,status:'posted_to_ar',returnState:'posted_to_ar',accountingStatus:'accounting_confirmed',accountingConfirmed:true,arPosted:true,...fields }; }
function baseLedger(o) { return { id:`AR-OPEN-${o.code}`,account:'AR',category:'AR-DEBT-OPEN',ledgerType:'AR-DEBT-OPEN',sourceType:'SALES_ORDER_DELIVERY_CLOSEOUT',sourceId:o.id,sourceCode:o.code,entryType:'normal',idempotencyKey:`AR-DEBT-OPEN:${o.id}`,accountingConfirmed:true,accountingStatus:'confirmed',active:true,orderId:o.id,orderCode:o.code,salesOrderId:o.id,salesOrderCode:o.code,customerCode:o.customerCode,debit:10000,credit:0,amount:10000,direction:'debit',amountField:'debit',status:'posted' }; }
function returnLedger(o, amount) { const rid=`RO-${o.code}`; return { id:`AR-RET-${o.code}`,code:`AR-RET-${o.code}`,account:'AR',category:'AR-RETURN',ledgerType:'AR-RETURN',sourceType:'RETURN_ORDER',refType:'RETURN_ORDER',sourceModel:'returnOrders',entryType:'normal',accountingConfirmed:true,accountingStatus:'confirmed',active:true,returnOrderId:rid,returnOrderCode:rid,refId:rid,refCode:rid,sourceId:rid,sourceCode:rid,orderId:o.id,orderCode:o.code,salesOrderId:o.id,salesOrderCode:o.code,customerCode:o.customerCode,debit:0,credit:amount,amount,direction:'credit',amountField:'credit',status:'posted',idempotencyKey:`AR-RETURN:${rid}` }; }
async function classify(code, fields, arReturnAmount) {
  const o=baseOrder(code); const ro=returnOrder(o,fields);
  const states=await DeliveryPaymentStateReadService.resolvePaymentStatesForOrders([o],{includeReturnState:true,models:{DeliveryCloseoutVersion:fakeModel([]),OrderPaymentAllocation:fakeModel([]),ReturnOrder:fakeModel([ro])}});
  const state=states.states[0];
  const snapshot={ok:true,state,debtRaw:state.debtRaw,returnState:DeliveryPaymentStateReadService._private.ReturnStateReader.returnStateForOrder(o,states.returnStatesByIdentity),returnRows:DeliveryPaymentStateReadService.returnRowsForOrder(o,states.returnResult),allocationRef:'',closeoutVersionRef:''};
  const ledgers=[baseLedger(o),returnLedger(o,arReturnAmount)];
  return Audit.classifyTimeline({correction:correction(o),canonicalOrderRows:Audit.canonicalRowsFromFixture(ledgers),allArRows:ledgers,snapshot});
}

test('R1P3A G difference within zero tolerance still reports structural source-field conflict', async () => {
  const row=await classify('R1P3A-G',{returnAmount:2000,amount:1500},1500);
  assert.equal(row.deviation,500);
  assert.equal(row.deviationNormalized,0);
  assert.equal(row.sourceFieldMismatch,true);
  assert.match(row.issues,/RETURN_SOURCE_AMOUNT_FIELD_MISMATCH/);
  assert.equal(row.classification,'data_corruption');
});

test('R1P3A H AR-RETURN matches Delivery but not posting analysis', async () => {
  const row=await classify('R1P3A-H',{returnAmount:2000,amount:1500},2000);
  assert.equal(row.deliveryCanonicalReturnAmount,2000);
  assert.equal(row.postingCanonicalReturnAmount,1500);
  assert.equal(row.effectiveArReturnAmount,2000);
  assert.match(row.issues,/RETURN_SOURCE_AMOUNT_FIELD_MISMATCH/);
  assert.match(row.issues,/RETURN_AR_POSTING_AMOUNT_MISMATCH/);
  assert.equal(row.classification,'data_corruption');
});

test('R1P3A I AR-RETURN matches posting analysis but not Delivery', async () => {
  const row=await classify('R1P3A-I',{returnAmount:2000,amount:1500},1500);
  assert.equal(row.deliveryCanonicalReturnAmount,2000);
  assert.equal(row.postingCanonicalReturnAmount,1500);
  assert.equal(row.effectiveArReturnAmount,1500);
  assert.match(row.issues,/RETURN_SOURCE_AMOUNT_FIELD_MISMATCH/);
  assert.match(row.issues,/RETURN_AR_AMOUNT_MISMATCH/);
  assert.equal(row.classification,'data_corruption');
});
