'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Planner=require('../src/services/accounting/HistoricalCorrectionRepairPlanner');
const Executor=require('../src/services/accounting/HistoricalCorrectionRepairExecutor');
const Timeline=require('../src/services/accounting/HistoricalCorrectionTimelineService');
const EventDelta=require('../src/services/accounting/CloseoutCorrectionArEventDeltaPostingService');
const FIX=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ar-splitbrain-r1p4a-production-lineage.fixture.json'),'utf8'));
const OLD=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ar-splitbrain-r1p4a-old-real-plan.json'),'utf8'));
const clone=v=>JSON.parse(JSON.stringify(v));
function fresh(extra={}) { return {...clone(FIX), ...extra}; }
function canonicalRow(item,id='LEDGER') {
  return { ...clone(item.canonicalLedgerPreview), id, code:id, account:'AR', entryType:'normal', active:true, reversed:false,
    status:'posted', accountingConfirmed:true, accountingStatus:'confirmed', orderId:item.orderId, orderCode:item.orderCode,
    salesOrderId:item.orderId, salesOrderCode:item.orderCode, customerCode:item.customerCode,
    correctionId:item.correctionId, correctionCode:item.correctionCode };
}

test('R1P4A old REAL plan hash stays valid but DB lineage revalidation rejects it', async()=>{
  assert.equal(Planner.verifyPlanHash(OLD).ok,true);
  const r=await Executor.revalidateRepairPlan({plan:OLD,orderCode:'B0041181'},{reloadEvidence:async()=>fresh()});
  assert.equal(r.planHashValid,true); assert.equal(r.dbRevalidated,true); assert.equal(r.safeToApply,false);
  assert.ok(r.abortReasons.some(x=>x.code==='LINEAGE_MISMATCH'||x.code==='SEQUENCE_INDEX_INVALID'));
});

test('R1P4A fresh plan binds v1->v2->v3 and sequential AR 23800085->0->85',()=>{
  const p=Planner.createRepairPlan(fresh());
  assert.equal(p.items.length,2); assert.deepEqual(p.items.map(x=>[x.fromVersion,x.toVersion,x.expectedMissingEventDelta]),[[1,2,-23800085],[2,3,85]]);
  assert.deepEqual(p.items.map(x=>[x.expectedArBeforeSequentialApply,x.expectedArAfterSequentialApply]),[[23800085,0],[0,85]]);
  assert.equal(p.expectedNetHistoricalEffect,-23800000); assert.equal(p.expectedFinalArRaw,85); assert.equal(p.expectedFinalDebtNormalized,0);
});

test('R1P4A fresh plan DB revalidation passes while reversed item order fails closed', async()=>{
  const p=Planner.createRepairPlan(fresh());
  const ok=await Executor.revalidateRepairPlan({plan:p,orderCode:'B0041181'},{reloadEvidence:async()=>fresh()});
  assert.equal(ok.safeToApply,true); assert.equal(ok.lineageRevalidated,true); assert.equal(ok.eventMissingRevalidated,true);
  const bad=clone(p); bad.items.reverse(); delete bad.planHash; bad.planHash=Planner.sha256({...bad,planHash:undefined});
  const no=await Executor.revalidateRepairPlan({plan:bad,orderCode:'B0041181'},{reloadEvidence:async()=>fresh()});
  assert.equal(no.safeToApply,false); assert.ok(no.abortReasons.some(x=>x.code==='PLAN_ITEM_ORDER_MISMATCH'));
});

test('R1P4A event appearing after plan generation aborts; all-posted retry is idempotent', async()=>{
  const p=Planner.createRepairPlan(fresh());
  const one=fresh({arLedgers:[canonicalRow(p.items[0],'V2-POSTED')]});
  const partial=await Executor.revalidateRepairPlan({plan:p,orderCode:'B0041181'},{reloadEvidence:async()=>one});
  assert.equal(partial.safeToApply,false); assert.ok(partial.abortReasons.some(x=>x.code==='PARTIAL_PLAN_ALREADY_APPLIED'));
  const both=fresh({arLedgers:[canonicalRow(p.items[0],'V2-POSTED'),canonicalRow(p.items[1],'V3-POSTED')]});
  const all=await Executor.revalidateRepairPlan({plan:p,orderCode:'B0041181'},{reloadEvidence:async()=>both});
  assert.equal(all.idempotentAlreadyApplied,true); assert.equal(all.status,'IDEMPOTENT_ALREADY_APPLIED');
});

test('R1P4A ambiguous predecessor produces AMBIGUOUS_LINEAGE and is never planned',()=>{
  const input=fresh();
  // Add two immutable prior version rows with the exact same state as v2 so v3 has
  // two equally authoritative predecessor candidates. The embedded order snapshot is
  // intentionally lower priority than DeliveryCloseoutVersion and cannot disambiguate them.
  input.versions.push({...clone(input.versions[0]),id:'DUP-STATE-v1a',code:'DUP-STATE-v1a',closeoutVersion:1});
  input.versions.push({...clone(input.versions[0]),id:'DUP-STATE-v1b',code:'DUP-STATE-v1b',closeoutVersion:1});
  input.order.deliveryCloseout={...input.order.deliveryCloseout,cashAmount:22200085,rewardAmount:1600000,debtAmount:0};
  const c3=input.corrections.find(x=>x.newCloseoutVersion===3);
  input.corrections=[c3];
  input.versions=input.versions.filter(x=>x.closeoutVersion!==2 && x.closeoutVersion!==4);
  const rows=Timeline.reconstructHistoricalTransitions(input);
  assert.equal(rows[0].classification,'AMBIGUOUS_LINEAGE');
  assert.equal(Planner.createRepairPlan(input).items.length,0);
});

test('R1P4A multi-event executePlan succeeds in sequence and full retry has no duplicate effect', async()=>{
  const input=fresh(); const p=Planner.createRepairPlan(input); let balance=23800085; const ledgers=[]; const writes=[];
  const deps={
    withTransaction:async work=>work({id:'tx'}),
    reloadEvidence:async()=>({...fresh(),arLedgers:clone(ledgers),currentArBeforeObserved:balance}),
    readCurrentAr:async()=>balance,
    postCorrectionEvent:async({transition,item})=>{
      const before=balance; balance+=transition.correctionOwnedDebtDelta; writes.push(item.toVersion);
      const row=canonicalRow(item,`POST-${item.toVersion}`); ledgers.push(row);
      return {posted:true,idempotent:false,arBefore:before,arAfter:balance,ledger:row};
    }
  };
  const r=await Executor.executePlan({plan:p,planHash:p.planHash,orderCode:'B0041181',apply:true,actor:'test'},deps);
  assert.deepEqual(writes,[2,3]); assert.equal(r.finalAr,85); assert.equal(balance,85);
  const retry=await Executor.executePlan({plan:p,planHash:p.planHash,orderCode:'B0041181',apply:true,actor:'test'},deps);
  assert.equal(retry.idempotent,true); assert.equal(balance,85); assert.deepEqual(writes,[2,3]);
});
