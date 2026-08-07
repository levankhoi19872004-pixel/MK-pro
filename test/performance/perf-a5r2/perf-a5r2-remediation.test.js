'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const store = require('../../../src/observability/performanceMeasurementStore');
const Policy = require('../../../src/services/reports/ReportExecutionPolicy');

function withEnv(values, fn) {
  const old = {};
  for (const [k,v] of Object.entries(values)) { old[k]=process.env[k]; if(v==null) delete process.env[k]; else process.env[k]=v; }
  try { return fn(); } finally { for (const [k,v] of Object.entries(old)) { if(v==null) delete process.env[k]; else process.env[k]=v; } }
}

test('telemetry master enable guard parses false values and records nothing when OFF', () => {
  for (const value of ['0','false','off','no']) withEnv({PERF_TELEMETRY_ENABLED:value}, () => {
    store._testing.resetForTest(); store.startWindow('off-test',{productionMode:false,allowUnknown:true});
    const start=store.beginMeasurement({endpoint:'/off'}); assert.equal(start,null);
    assert.equal(store.completeMeasurement(start,{statusCode:200}),null);
    assert.equal(store.exportWindow(store.getWindow().id).sampleCount,0);
  });
  for (const value of ['1','true','on','yes']) withEnv({PERF_TELEMETRY_ENABLED:value}, () => assert.equal(store.telemetryEnabled(),true));
});

test('sample window state machine excludes requests started after close and drains in-flight', () => withEnv({PERF_TELEMETRY_ENABLED:'1'}, () => {
  store._testing.resetForTest();
  const w=store.startWindow('baseline',{productionMode:false,allowUnknown:true});
  const inFlight=store.beginMeasurement({endpoint:'/before-close'});
  const closing=store.closeWindow();
  assert.equal(closing.state,store.WINDOW_STATES.CLOSING);
  assert.equal(closing.inFlightAtClose,1);
  assert.equal(store.beginMeasurement({endpoint:'/after-close'}),null);
  store.completeMeasurement(inFlight,{statusCode:200});
  const exported=store.exportWindow(w.id);
  assert.equal(exported.sampleCount,1);
  assert.equal(exported.records[0].endpoint,'/before-close');
  assert.equal(exported.window.state,store.WINDOW_STATES.CLOSED);
}));

test('production window rejects unknown release metadata', () => withEnv({RELEASE_ID:'unknown',RELEASE_SHA:'unknown',SOURCE_SHA:'unknown'}, () => {
  store._testing.resetForTest();
  assert.throws(()=>store.startWindow('prod',{productionMode:true}), err=>err.code==='PERF_RELEASE_METADATA_REQUIRED');
  const local=store.startWindow('local',{productionMode:false,allowUnknown:true}); assert.equal(local.state,'OPEN');
}));

test('runBounded passes full execution context and admission waits for underlying cancellation', async () => {
  Policy._testing.resetAdmission(); let got; let stopped=false;
  await assert.rejects(Policy.withAdmission(() => Policy.runBounded([{name:'real-call',run:(ctx)=>{ got=ctx; return new Promise((resolve,reject)=>ctx.signal.addEventListener('abort',()=>setTimeout(()=>{stopped=true;reject(new Error('stopped'));},20),{once:true})); }}],{timeoutMs:100,concurrency:1}),{maxActive:1}), err=>err.code==='REPORT_EXECUTION_TIMEOUT');
  assert.ok(got.signal); assert.equal(got.maxTimeMS,100); assert.ok(got.executionId); assert.ok(got.deadlineAt); assert.equal(stopped,true); assert.equal(Policy._testing.getActiveRequests(),0);
});

test('real report descriptors accept and propagate execution context', () => {
  for (const file of ['ReportCenterService.js','DataQualitySnapshotService.js','DashboardReportService.js']) {
    const source=fs.readFileSync(path.join(__dirname,'../../../src/services/reports',file),'utf8');
    assert.match(source,/run:\s*\(ctx\)\s*=>/);
    assert.match(source,/__executionContext:\s*ctx/);
  }
  const dashboard=fs.readFileSync(path.join(__dirname,'../../../src/services/reports/DashboardReportService.js'),'utf8');
  assert.match(dashboard,/maxTimeMS:\s*ctx\.maxTimeMS/);
  assert.match(dashboard,/signal:\s*ctx\.signal/);
});
