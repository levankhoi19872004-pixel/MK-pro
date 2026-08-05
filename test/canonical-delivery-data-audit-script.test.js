'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const audit = require('../scripts/audit-canonical-delivery-financial-read-model');

function chain(rows, counters, name) {
  return { select(){return this;}, sort(){return this;}, session(){return this;}, async lean(){ counters[name]=(counters[name]||0)+1; return rows; } };
}
function model(rows, counters, name) {
  const result = { find(){ return chain(rows, counters, name); } };
  for (const method of ['save','create','insert','insertMany','updateOne','updateMany','findOneAndUpdate','bulkWrite','deleteOne','deleteMany']) {
    result[method] = () => { counters.writes=(counters.writes||0)+1; throw new Error(`unexpected write ${method}`); };
  }
  return result;
}
function fixtures(count = 3) {
  const orders=[]; const versions=[]; const allocations=[]; const returns=[];
  for(let i=0;i<count;i+=1){
    const id=`SO-${i}`; const code=`B${i}`;
    orders.push({_id:id,id,orderId:id,code,orderCode:code,tenantId:'TENANT-A',deliveryDate:`2026-08-0${i+1}T10:00:00.000Z`,totalAmount:10000,cashAmount:0,bankAmount:0,rewardAmount:0,offsetAmount:0,debtAmount:10000,customerName:'SECRET NAME',phone:'0900000000',address:'SECRET ADDRESS'});
    versions.push({id:`V-${i}`,orderId:id,orderCode:code,tenantId:'TENANT-A',closeoutVersion:1,status:'accounting_confirmed',originalAmount:10000,cashAmount:1000});
    allocations.push({id:`A-${i}`,allocationCode:`A-${i}`,orderId:id,orderCode:code,tenantId:'TENANT-A',sourceVersion:1,status:'posted',active:true,receivableAmount:10000,cashAmount:5000,returnAmount:0});
    returns.push({id:`R-${i}`,orderId:id,orderCode:code,tenantId:'TENANT-A',status:'waiting_receive',returnAmount:5000});
  }
  return {orders,versions,allocations,returns};
}
function models(data,counters={}){ return { models:{DeliveryCloseoutVersion:model(data.versions,counters,'versions'),OrderPaymentAllocation:model(data.allocations,counters,'allocations'),ReturnOrder:model(data.returns,counters,'returns')}, counters}; }


test('AUDIT-001: audit defaults to dry-run', () => {
  const parsed = audit.parseArgs([]);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.batchSize, 200);
  assert.equal(parsed.limit, 1000);
});

test('AUDIT-002: audit rejects apply/write/fix flags', () => {
  for (const flag of ['--apply','--write','--fix','--apply=true']) assert.throws(() => audit.parseArgs([flag]), (error) => error.exitCode === 64);
});

test('AUDIT-003: audit applies date filter', () => {
  const filter = audit.buildOrderFilter({from:'2026-08-01',to:'2026-08-04'});
  assert.equal(filter.$orDate.$gte.toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(filter.$orDate.$lte.toISOString(), '2026-08-04T23:59:59.999Z');
});

test('AUDIT-004: audit applies exact order-code filter', () => {
  const parsed = audit.parseArgs(['--order-code=B0040961']);
  const filter = audit.buildOrderFilter(parsed);
  assert.deepEqual(filter.$or, [{orderCode:'B0040961'},{code:'B0040961'},{salesOrderCode:'B0040961'}]);
  assert.throws(() => audit.parseArgs(['--order-code=B.*']), (error) => error.exitCode === 64);
});

test('AUDIT-005: audit respects batch and hard limits without N+1', async () => {
  const data=fixtures(5); const harness=models(data,{});
  const {report}=await audit.auditOrders(data.orders,{models:harness.models,batchSize:2,limit:3,sampleLimit:2});
  assert.equal(report.ordersScanned,3);
  assert.deepEqual(report.queryCount,{allocations:2,versions:2,returns:2});
  assert.equal(harness.counters.writes||0,0);
});

test('AUDIT-006: audit classifies legacy Web/App split-brain', () => {
  const order={orderCode:'B0040961',totalAmount:1931784,cashAmount:0};
  const state={receivableAmount:1931784,cashAmount:1932000,bankAmount:0,rewardAmount:0,offsetAmount:0,returnAmount:1931784,debtRaw:-1932000,debtAmount:-1932000,paymentStateSource:'orderPaymentAllocations.current',returnStateSource:'returnOrders',rawPostedAllocation:{cashAmount:1932000,returnAmount:0,sourceVersion:1}};
  const codes=new Set(audit.classifyOrder(order,state).map((item)=>item.findingCode));
  assert.equal(codes.has('LEGACY_WEB_APP_SPLIT_BRAIN'),true);
  assert.equal(codes.has('PAYMENT_AND_FULL_RETURN_OVERHANDLED'),true);
});

test('AUDIT-007: audit classifies stale and mismatched allocation versions', () => {
  const base={receivableAmount:10000,cashAmount:0,bankAmount:0,rewardAmount:0,offsetAmount:0,returnAmount:0,debtRaw:10000,debtAmount:10000,paymentStateSource:'deliveryCloseoutVersions.latest',returnStateSource:'returnOrders',diagnostics:{warnings:['ALLOCATION_VERSION_MISMATCH']},rawPostedAllocation:{sourceVersion:1},latestCorrectionVersion:2};
  const codes=new Set(audit.classifyOrder({orderCode:'B1',totalAmount:10000},base).map((item)=>item.findingCode));
  assert.equal(codes.has('ALLOCATION_VERSION_MISMATCH'),true);
  assert.equal(codes.has('VERSION_NEWER_THAN_ALLOCATION'),true);
  const stale={...base,diagnostics:{warnings:['ALLOCATION_STALE']},stalePaymentAllocationIgnored:true};
  assert.equal(audit.classifyOrder({orderCode:'B2',totalAmount:10000},stale).some((item)=>item.findingCode==='ALLOCATION_STALE'),true);
});

test('AUDIT-008: audit classifies return snapshot difference', () => {
  const state={receivableAmount:10000,cashAmount:0,bankAmount:0,rewardAmount:0,offsetAmount:0,returnAmount:9000,debtRaw:1000,debtAmount:0,paymentStateSource:'allocation',returnStateSource:'returnOrders',rawPostedAllocation:{returnAmount:0,sourceVersion:1}};
  assert.equal(audit.classifyOrder({orderCode:'B3',totalAmount:10000},state).some((item)=>item.findingCode==='RETURN_SNAPSHOT_DIFF'),true);
});

test('AUDIT-009: audit classifies stored debt difference', () => {
  const state={receivableAmount:10000,cashAmount:5000,bankAmount:0,rewardAmount:0,offsetAmount:0,returnAmount:0,debtRaw:5000,debtAmount:5000,paymentStateSource:'allocation',returnStateSource:'returnOrders'};
  assert.equal(audit.classifyOrder({orderCode:'B4',totalAmount:10000,debtAmount:10000},state).some((item)=>item.findingCode==='STORED_DEBT_DIFF'),true);
});

test('AUDIT-010: audit classifies negative and overhandled money', () => {
  const negative={receivableAmount:10000,cashAmount:-1,bankAmount:0,rewardAmount:0,offsetAmount:0,returnAmount:0,debtRaw:10001,debtAmount:10001,paymentStateSource:'legacy',returnStateSource:'returnOrders'};
  assert.equal(audit.classifyOrder({orderCode:'B5',totalAmount:10000},negative).some((item)=>item.findingCode==='NEGATIVE_INPUT_COMPONENT'),true);
  const over={...negative,cashAmount:10000,returnAmount:10000,debtRaw:-10000,debtAmount:-10000};
  const codes=new Set(audit.classifyOrder({orderCode:'B6',totalAmount:10000},over).map((item)=>item.findingCode));
  assert.equal(codes.has('COMPONENT_EXCEEDS_RECEIVABLE'),true);
  assert.equal(codes.has('PAYMENT_AND_FULL_RETURN_OVERHANDLED'),true);
});

test('AUDIT-011: audit writes stable JSON atomically', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-audit-')); const file=path.join(dir,'result.json');
  audit.atomicWrite(file,`${JSON.stringify({schemaVersion:audit.SCHEMA_VERSION,dryRun:true},null,2)}\n`);
  assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{schemaVersion:audit.SCHEMA_VERSION,dryRun:true});
});

test('AUDIT-012: audit writes stable CSV', () => {
  const csv=audit.toCsv([{severity:'P1',findingCode:'TEST',orderCode:'B,1'}]);
  assert.equal(csv.split('\n')[0],audit.CSV_COLUMNS.join(','));
  assert.match(csv,/"B,1"/);
});

test('AUDIT-013: audit redacts PII and caps samples', async () => {
  const data=fixtures(3); const harness=models(data,{});
  const {report}=await audit.auditOrders(data.orders,{models:harness.models,batchSize:3,limit:3,sampleLimit:1});
  const encoded=JSON.stringify(report);
  for(const secret of ['SECRET NAME','0900000000','SECRET ADDRESS']) assert.equal(encoded.includes(secret),false);
  for(const samples of Object.values(report.samples)) assert.ok(samples.length<=1);
});

test('AUDIT-014: audit uses severity exit-code contract', () => {
  assert.equal(audit.exitCodeFor({}),0);
  assert.equal(audit.exitCodeFor({P2:1}),2);
  assert.equal(audit.exitCodeFor({P1:1}),3);
  assert.equal(audit.EXIT.CLI,64);
  assert.equal(audit.EXIT.RUNTIME,70);
});
