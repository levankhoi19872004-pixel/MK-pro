'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Audit = require('../scripts/audit-closeout-ar-splitbrain');
const DeliveryPaymentStateReadService = require('../src/services/delivery/DeliveryPaymentStateReadService');

function fakeQuery(rows) { return { select(){return this;}, sort(){return this;}, session(){return this;}, lean(){return Promise.resolve(rows.map(r=>({...r})));} }; }
function fakeModel(rows) { return { find(){ return fakeQuery(rows); } }; }
function order() { return { id:'SO-R1P3',orderId:'SO-R1P3',salesOrderId:'SO-R1P3',code:'B-R1P3',orderCode:'B-R1P3',salesOrderCode:'B-R1P3',customerCode:'C-R1P3',customerName:'Return Audit',receivableAmount:10000,cashAmount:0,bankAmount:0,rewardAmount:0,accountingConfirmed:true }; }
function correction(o=order()) { return { id:'DCOC-R1P3',correctionId:'DCOC-R1P3',correctionCode:'DCOC-R1P3',orderId:o.id,salesOrderId:o.id,orderCode:o.code,salesOrderCode:o.code,customerCode:o.customerCode,receivableDelta:0,cashDelta:0,bankDelta:0,rewardDelta:0,returnDelta:0 }; }
function returnOrder(id, amount, state='posted_to_ar') {
  const accountingConfirmed = ['accounting_confirmed','posted_to_ar'].includes(state);
  const arPosted = state === 'posted_to_ar';
  return { id,code:id,returnOrderId:id,returnOrderCode:id,sourceModel:'returnOrders',salesOrderId:'SO-R1P3',salesOrderCode:'B-R1P3',customerCode:'C-R1P3',customerId:'C-R1P3',status:state,returnState:state,accountingStatus:accountingConfirmed?'accounting_confirmed':'pending',accountingConfirmed,arPosted,returnAmount:amount,amount };
}
function baseLedger() { return { id:'AR-OPEN-R1P3',account:'AR',category:'AR-DEBT-OPEN',ledgerType:'AR-DEBT-OPEN',sourceType:'SALES_ORDER_DELIVERY_CLOSEOUT',sourceId:'SO-R1P3',sourceCode:'B-R1P3',entryType:'normal',idempotencyKey:'AR-DEBT-OPEN:SO-R1P3',accountingConfirmed:true,accountingStatus:'confirmed',active:true,orderId:'SO-R1P3',orderCode:'B-R1P3',salesOrderId:'SO-R1P3',salesOrderCode:'B-R1P3',customerCode:'C-R1P3',debit:10000,credit:0,amount:10000,direction:'debit',amountField:'debit',status:'posted' }; }
function returnLedger(id, returnId, amount, extra={}) { return { id,code:id,account:'AR',category:'AR-RETURN',ledgerType:'AR-RETURN',sourceType:'RETURN_ORDER',refType:'RETURN_ORDER',sourceModel:'returnOrders',entryType:'normal',accountingConfirmed:true,accountingStatus:'confirmed',active:true,returnOrderId:returnId,returnOrderCode:returnId,refId:returnId,refCode:returnId,sourceId:returnId,sourceCode:returnId,orderId:'SO-R1P3',orderCode:'B-R1P3',salesOrderId:'SO-R1P3',salesOrderCode:'B-R1P3',customerCode:'C-R1P3',debit:0,credit:amount,amount,direction:'credit',amountField:'credit',status:'posted',idempotencyKey:`AR-RETURN:${returnId}`,...extra }; }
function receiptLedger(amount=4000) { return { id:'AR-RECEIPT-DC-R1P3',code:'AR-RECEIPT-DC-R1P3',account:'AR',category:'AR-RECEIPT',ledgerType:'AR-RECEIPT',sourceType:'DEBTCOLLECTION',refType:'DEBTCOLLECTION',sourceId:'DC-R1P3',sourceCode:'DC-R1P3',entryType:'normal',idempotencyKey:'AR-RECEIPT:DC-R1P3:SO-R1P3',accountingConfirmed:true,accountingStatus:'confirmed',active:true,orderId:'SO-R1P3',orderCode:'B-R1P3',salesOrderId:'SO-R1P3',salesOrderCode:'B-R1P3',customerCode:'C-R1P3',debit:0,credit:amount,amount,direction:'credit',amountField:'credit',status:'posted' }; }
async function snapshot(returnRows) {
  const o=order();
  const result=await DeliveryPaymentStateReadService.resolvePaymentStatesForOrders([o],{includeReturnState:true,models:{DeliveryCloseoutVersion:fakeModel([]),OrderPaymentAllocation:fakeModel([]),ReturnOrder:fakeModel(returnRows)}});
  const state=result.states[0];
  return {o,snapshot:{ok:true,state,debtRaw:state.debtRaw,returnState:DeliveryPaymentStateReadService._private.ReturnStateReader.returnStateForOrder(o,result.returnStatesByIdentity),returnRows:DeliveryPaymentStateReadService.returnRowsForOrder(o,result.returnResult),allocationRef:'',closeoutVersionRef:''}};
}
async function classify(returnRows, ledgers) {
  const {o,snapshot:s}=await snapshot(returnRows);
  const canonical=Audit.canonicalRowsFromFixture(ledgers);
  return Audit.classifyTimeline({correction:correction(o),canonicalOrderRows:canonical,allArRows:ledgers,snapshot:s});
}

test('RETURN-001 healthy posted return is aligned and not double-counted', async()=>{
  const row=await classify([returnOrder('RO-1',2000)],[baseLedger(),returnLedger('AR-RET-1','RO-1',2000)]);
  assert.equal(row.deliverySnapshotDebt,8000); assert.equal(row.canonicalArDebt,8000); assert.equal(row.expectedArFromEventTimeline,8000); assert.equal(row.classification,'no_mismatch'); assert.match(row.returnIssues,/RETURN_AR_ALIGNED/);
});
test('RETURN-002 pending return is in delivery snapshot but AR is not yet required', async()=>{
  const row=await classify([returnOrder('RO-2',2000,'waiting_receive')],[baseLedger()]);
  assert.equal(row.deliverySnapshotDebt,8000); assert.equal(row.pendingReturnRestoreAmount,2000); assert.equal(row.expectedArFromEventTimeline,10000); assert.equal(row.canonicalArDebt,10000); assert.equal(row.classification,'no_mismatch'); assert.match(row.returnIssues,/RETURN_AR_NOT_YET_REQUIRED/);
});
test('RETURN-003 accounting-confirmed return missing AR-RETURN is detected', async()=>{
  const row=await classify([returnOrder('RO-3',2000,'accounting_confirmed')],[baseLedger()]);
  assert.equal(row.classification,'true_splitbrain'); assert.match(row.issues,/RETURN_AR_MISSING/); assert.equal(row.expectedArFromEventTimeline,8000); assert.equal(row.canonicalArDebt,10000);
});
test('RETURN-004 duplicate effective AR-RETURN is data corruption', async()=>{
  const r=returnOrder('RO-4',2000);
  const row=await classify([r],[baseLedger(),returnLedger('AR-RET-4A','RO-4',2000),returnLedger('AR-RET-4B','RO-4',2000,{idempotencyKey:'AR-RETURN:RO-4:DUP'})]);
  assert.equal(row.classification,'data_corruption'); assert.match(row.issues,/RETURN_AR_DUPLICATE/); assert.equal(row.effectiveArReturnAmount,4000);
});
test('RETURN-005 AR-RETURN amount mismatch is detected', async()=>{
  const row=await classify([returnOrder('RO-5',2000)],[baseLedger(),returnLedger('AR-RET-5','RO-5',1500)]);
  assert.equal(row.classification,'data_corruption'); assert.match(row.issues,/RETURN_AR_AMOUNT_MISMATCH/); assert.equal(row.deviation,500);
});
test('RETURN-006 two legitimate returns with different identities are both preserved', async()=>{
  const rows=[returnOrder('RO-6A',2000),returnOrder('RO-6B',1000)];
  const row=await classify(rows,[baseLedger(),returnLedger('AR-RET-6A','RO-6A',2000),returnLedger('AR-RET-6B','RO-6B',1000)]);
  assert.equal(row.deliveryReturnAmount,3000); assert.equal(row.effectiveArReturnAmount,3000); assert.equal(row.canonicalArDebt,7000); assert.equal(row.classification,'no_mismatch');
});
test('RETURN-007 retry/same ingested AR-RETURN row is stable-deduped', async()=>{
  const ret=returnLedger('AR-RET-7','RO-7',2000); const clone=JSON.parse(JSON.stringify(ret));
  const row=await classify([returnOrder('RO-7',2000)],[baseLedger(),ret,clone]);
  assert.equal(row.effectiveArReturnAmount,2000); assert.equal(row.classification,'no_mismatch'); assert.doesNotMatch(row.issues,/RETURN_AR_DUPLICATE/);
});
test('RETURN-008 reversed/inactive return is excluded from snapshot and active AR effect', async()=>{
  const reversedReturn=returnOrder('RO-8',2000,'reversed');
  const reversedLedger=returnLedger('AR-RET-8','RO-8',2000,{active:false,reversed:true,status:'reversed'});
  const row=await classify([reversedReturn],[baseLedger(),reversedLedger]);
  assert.equal(row.deliveryReturnAmount,0); assert.equal(row.effectiveArReturnAmount,0); assert.equal(row.canonicalArDebt,10000); assert.equal(row.classification,'no_mismatch'); assert.match(row.returnIssues,/RETURN_AR_INACTIVE_ALIGNED/);
});
test('mixed posted return + confirmed debt receipt applies receipt once and return zero extra times', async()=>{
  const row=await classify([returnOrder('RO-MIX',2000)],[baseLedger(),returnLedger('AR-RET-MIX','RO-MIX',2000),receiptLedger(4000)]);
  assert.equal(row.deliverySnapshotDebt,8000); assert.equal(row.confirmedReceiptEffect,-4000); assert.equal(row.expectedArFromEventTimeline,4000); assert.equal(row.canonicalArDebt,4000); assert.equal(row.classification,'explained_by_subsequent_events');
});
