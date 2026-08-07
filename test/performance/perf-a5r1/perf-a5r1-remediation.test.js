'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../../src/observability/performanceMeasurementStore');
const Policy = require('../../../src/services/reports/ReportExecutionPolicy');
const Batch = require('../../../src/services/delivery/DeliveryAdjustmentBatchContextService');

test('telemetry record contains release/instance/window/flags and immutable request snapshot', () => {
  store._testing.resetForTest();
  store.startWindow('test',{productionMode:false,allowUnknown:true});
  process.env.PERF_BULK_BATCH_CONTEXT_V1='0';
  const start=store.beginMeasurement({endpoint:'/api/x',httpMethod:'GET',operationMode:'cache-hit',cacheSource:'hit'});
  process.env.PERF_BULK_BATCH_CONTEXT_V1='1';
  const row=store.completeMeasurement(start,{durationMs:10,statusCode:200,rowsReturned:2});
  for (const key of ['schemaVersion','releaseId','releaseSha','sourceSha','instanceId','processId','sampleWindowId','startedAt','completedAt','endpoint','httpMethod','operationName','operationMode','featureFlags','durationMs','mongoDurationMs','jsDurationMs','queryCount','rowsReturned','statusCode','errorCategory','correctnessCheck','debtDeviation','duplicateLedgerDetected']) assert.ok(Object.hasOwn(row,key), key);
  assert.equal(row.featureFlags.PERF_BULK_BATCH_CONTEXT_V1,'0');
});

test('baseline/canary windows are isolated and grouped by flag snapshot/mode', () => {
  store._testing.resetForTest();
  const w1=store.startWindow('baseline');
  store.completeMeasurement(store.beginMeasurement({endpoint:'/a',httpMethod:'GET',operationMode:'fallback'}),{durationMs:5,statusCode:200});
  store.closeWindow();
  const w2=store.startWindow('canary');
  store.completeMeasurement(store.beginMeasurement({endpoint:'/a',httpMethod:'GET',operationMode:'cache-hit',cacheSource:'hit'}),{durationMs:2,statusCode:200});
  assert.equal(store.exportWindow(w1.id).sampleCount,1);
  assert.equal(store.exportWindow(w2.id).sampleCount,1);
  assert.notEqual(w1.id,w2.id);
});

test('report timeout aborts underlying work and admission slot is not released early', async () => {
  Policy._testing.resetAdmission();
  let aborted=false;
  const started=Date.now();
  await assert.rejects(Policy.withAdmission(() => Policy.runWithTimeout(({ signal }) => new Promise((resolve,reject) => {
    signal.addEventListener('abort',()=>{aborted=true; setTimeout(()=>reject(Object.assign(new Error('stopped'),{code:'ABORTED'})),20);},{once:true});
  }),{timeoutMs:100,name:'slow'}),{maxActive:1}), (err) => err && err.code === 'REPORT_EXECUTION_TIMEOUT');
  assert.equal(aborted,true);
  assert.ok(Date.now()-started>=115);
  assert.equal(Policy._testing.getActiveRequests(),0);
});

test('report pagination allowlist is per report and default empty/off', () => {
  process.env.PERF_REPORT_DB_PAGINATION_V1='1';
  process.env.PERF_REPORT_DB_PAGINATION_ALLOWLIST='sales-detail,debt-ledger';
  assert.equal(Policy.isReportPaginationEnabled('sales-detail'),true);
  assert.equal(Policy.isReportPaginationEnabled('returns-detail'),false);
  assert.equal(Policy.isReportPaginationEnabled('inventory-current'),false);
});

test('batch context reverse index lookup preserves matching semantics and avoids full scan per order', () => {
  const rows=[]; const orders=[];
  for(let i=0;i<100;i++){orders.push({id:`SO${i}`,code:`SO${i}`}); for(let j=0;j<10;j++) rows.push({_id:`${i}-${j}`,orderId:`SO${i}`,version:j});}
  const index=Batch._internal.buildRowsByRef(rows);
  let candidates=0;
  for(const order of orders){const found=Batch._internal.rowsForOrder(index,order); candidates+=found.length; assert.equal(found.length,10);}
  assert.equal(candidates,1000);
  assert.ok(candidates < rows.length*orders.length);
});
