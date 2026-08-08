'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../../src/services/accounting/closeout/CloseoutArBatchPostingService');
const workloads = [1,5,7,10,23,60];

function row(order, i) {
  const category = i === 0 ? 'AR-SALE' : i === 1 ? 'AR-RECEIPT-CASH' : 'AR-REWARD-ALLOWANCE';
  const amount = i === 0 ? 200 : 100;
  const debit = i === 0 ? amount : 0;
  const credit = i === 0 ? 0 : amount;
  return {
    id: `${category}-SO${order}`, code: `${category}-B${order}`, account:'AR', category, ledgerType:category, entryType:'normal', type:category.toLowerCase(),
    sourceType:'ORDER_PAYMENT_ALLOCATION', sourceId:`SO${order}`, sourceCode:`B${order}`, refType:'ORDER_PAYMENT_ALLOCATION', refId:`OPA-SO${order}-v1`, refCode:`OPA-SO${order}-v1`,
    orderId:`SO${order}`, orderCode:`B${order}`, salesOrderId:`SO${order}`, salesOrderCode:`B${order}`, customerCode:`C${order}`,
    debit, credit, amount, direction:debit?'debit':'credit', amountField:debit?'debit':'credit', accountingConfirmed:true, accountingStatus:'confirmed', active:true, reversed:false, status:'posted',
    idempotencyKey:`OPA:SO${order}:scope:v1:${category}`
  };
}
function repo() {
  const state=[]; const calls={read:0,bulk:0,ops:0};
  return { calls, async findByIdempotencyKeys(keys){calls.read+=1;return state.filter(r=>keys.includes(r.idempotencyKey));}, async bulkUpsert(rows){calls.bulk+=1;calls.ops+=rows.length;state.push(...rows.map(r=>({...r,_id:`mongo-${r.id}`})));return {upsertedCount:rows.length};} };
}
for (const n of workloads) test(`G4 command budget workload ${n}: request AR persistence is bounded`, async () => {
  const intents=[]; for(let o=1;o<=n;o+=1) for(let i=0;i<3;i+=1) intents.push(row(o,i));
  const repository=repo(); const out=await service.postEligibleArIntentsBatch(intents,{repository,session:{id:'tx'},suppressConflictAuditForTest:true});
  assert.equal(repository.calls.read,2); assert.equal(repository.calls.bulk,1); assert.equal(repository.calls.ops,3*n);
  assert.equal(out.telemetry.arPreflightReadCommands,1); assert.equal(out.telemetry.arBulkWriteCommands,1); assert.equal(out.telemetry.arReadbackCommands,1);
  const g2=7*n+11; const g4=g2-(3*n)+3;
  assert.equal(g4,4*n+14); assert.equal(g4 <= g2,true); if(n>1) assert.equal(g4<g2,true);
});
