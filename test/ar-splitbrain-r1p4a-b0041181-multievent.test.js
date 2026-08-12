'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {FakeModel}=require('./helpers/phase79FakeModels');

const searchServicePath=require.resolve(path.join(__dirname,'..','src/services/searchService.js'));
const previousSearchService=require.cache[searchServicePath];
require.cache[searchServicePath]={id:searchServicePath,filename:searchServicePath,loaded:true,exports:{async searchStaffs(){return [];}}};

const Planner=require('../src/services/accounting/HistoricalCorrectionRepairPlanner');
const Executor=require('../src/services/accounting/HistoricalCorrectionRepairExecutor');
const arRead=require('../src/services/arLedgerRead.service');
const arPosting=require('../src/services/arPosting.service');
const debtNew=require('../src/services/v2/debtNew.service');
const FIX=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ar-splitbrain-r1p4a-production-lineage.fixture.json'),'utf8'));
const clone=v=>JSON.parse(JSON.stringify(v));
function opening(){ const o=FIX.order; return {id:'AR-SALE-OPA-B0041181-v1',code:'AR-SALE-OPA-B0041181-v1',account:'AR',category:'AR-SALE',ledgerType:'AR-SALE',entryType:'normal',type:'ar-sale',sourceType:'ORDER_PAYMENT_ALLOCATION',sourceId:o.id,sourceCode:o.code,refType:'ORDER_PAYMENT_ALLOCATION',refId:'DCOA-SO1785834570204388-b00deac1ae6d',refCode:'DCOA-SO1785834570204388-b00deac1ae6d',orderId:o.id,orderCode:o.code,salesOrderId:o.id,salesOrderCode:o.code,customerCode:o.customerCode,customerName:o.customerName,debit:23800085,credit:0,amount:23800085,direction:'debit',amountField:'debit',status:'posted',active:true,reversed:false,accountingConfirmed:true,accountingStatus:'confirmed',idempotencyKey:'AR-SALE:B0041181:v1',createdAt:'2026-08-07T09:14:06.136Z',updatedAt:'2026-08-07T09:14:06.136Z'}; }
let rows;
function install(){ rows=[opening()]; const m=new FakeModel(rows),empty=new FakeModel([]); arRead.setModelsForTest({ArLedger:m}); arPosting.setModelsForTest({ArLedger:m,SalesOrder:{},AuditLog:{}}); debtNew.setModelsForTest({ArLedger:m,DebtCollection:empty,OrderPaymentAllocation:empty}); }
async function currentAr(){ const x=await arRead.inspectActiveDebtReadModelLedgersByOrderKeys([FIX.order.id,FIX.order.code],{customerCode:FIX.order.customerCode,status:'all'},{}); return arRead._internal.sumCanonicalBalanceRows(x.canonicalLedgers||[]); }
function evidence(){return {...clone(FIX),arLedgers:rows.map(clone),currentArBeforeObserved:0};}
function deps(){return {withTransaction:async work=>{const snap=clone(rows);try{return await work({id:'TX'})}catch(e){rows.splice(0,rows.length,...snap);throw e}},reloadEvidence:async()=>({...evidence(),currentArBeforeObserved:await currentAr()}),readCurrentAr:async()=>currentAr()};}
test.afterEach(()=>{arRead.setModelsForTest(null);arPosting.setModelsForTest(null);debtNew.setModelsForTest(null)});
test.after(()=>{if(previousSearchService)require.cache[searchServicePath]=previousSearchService;else delete require.cache[searchServicePath]});

test('R1P4A production-shaped B0041181 applies v2 credit then v3 debit, final raw 85 and Debt New 0',async()=>{
  install(); const input={...evidence(),currentArBeforeObserved:await currentAr()}; const plan=Planner.createRepairPlan(input);
  assert.deepEqual(plan.items.map(x=>[x.fromVersion,x.toVersion,x.expectedMissingEventDelta]),[[1,2,-23800085],[2,3,85]]);
  assert.deepEqual(plan.items.map(x=>[x.expectedArBeforeSequentialApply,x.expectedArAfterSequentialApply]),[[23800085,0],[0,85]]);
  const result=await Executor.executePlan({plan,planHash:plan.planHash,orderCode:'B0041181',apply:true,actor:'r1p4a-test'},deps());
  assert.equal(result.finalAr,85); assert.deepEqual(result.results.map(x=>[x.toVersion,x.arBefore,x.arAfter]),[[2,23800085,0],[3,0,85]]);
  const correctionRows=rows.filter(r=>r.category==='AR-ADJUSTMENT'&&r.sourceType==='DELIVERY_CLOSEOUT_CORRECTION');
  assert.equal(correctionRows.length,2); assert.equal(correctionRows[0].credit,23800085); assert.equal(correctionRows[1].debit,85);
  assert.equal(rows.some(r=>r.category==='AR-DEBT-ADJUSTMENT'),false);
  const list=await debtNew.listCustomers({customerCode:'4499499',status:'all'},{disableAggregation:true});
  const customer=list.customers.find(r=>r.customerCode==='4499499'),order=list.orders.find(r=>r.orderCode==='B0041181');
  assert.ok(customer); assert.ok(order); assert.equal(customer.debtAmount,0); assert.equal(order.debt,0); assert.equal(order.remainingDebt,0);
  const suggestions=await debtNew.suggestions({q:'B0041181',type:'order',limit:10},{}); const suggestion=suggestions.items.find(r=>r.orderCode==='B0041181');
  assert.ok(suggestion); assert.equal(suggestion.debtAmount,0); assert.equal(String(suggestion.subLabel).includes('85'),false);
  const retry=await Executor.executePlan({plan,planHash:plan.planHash,orderCode:'B0041181',apply:true,actor:'r1p4a-test'},deps());
  assert.equal(retry.idempotent,true); assert.equal(await currentAr(),85); assert.equal(rows.filter(r=>r.category==='AR-ADJUSTMENT').length,2);
});
