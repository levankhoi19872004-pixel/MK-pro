'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const outputJson = path.resolve(process.argv[2] || path.join(ROOT, 'FRONTEND_BENCHMARK.json'));
const outputCsv = path.resolve(process.argv[3] || path.join(ROOT, 'FRONTEND_BENCHMARK.csv'));
const runtimeSource = fs.readFileSync(path.join(ROOT, 'public/mobile/js/ui-runtime.js'), 'utf8');
const port = 9320 + Math.floor(Math.random() * 200);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkpro-chromium-'));

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitForJson(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (_) { /* wait for chromium */ }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function createCdpClient(url) {
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  };
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({
      call(method, params = {}) {
        const id = nextId++;
        return new Promise((resolveCall, rejectCall) => {
          pending.set(id, { resolve: resolveCall, reject: rejectCall });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
      close() { ws.close(); }
    });
    ws.onerror = () => reject(new Error('Cannot connect to Chromium DevTools WebSocket'));
  });
}

const benchmarkExpression = `(async function () {
  document.body.innerHTML = '<div id="root"></div>';
  window.requestIdleCallback = function(cb){ return setTimeout(function(){ cb({ timeRemaining:function(){return 50;} }); },0); };
  window.cancelIdleCallback = clearTimeout;
  ${runtimeSource}
  function rowHtml(row){return '<button class="card" data-id="'+row.id+'"><strong>'+row.code+'</strong><span>'+row.name+'</span><span class="metric">'+row.amount+'</span><i></i><small></small></button>';}
  function rows(count){return Array.from({length:count},function(_,i){return{id:i,code:'SO'+String(i).padStart(6,'0'),name:'Khách hàng '+i,amount:i*1000};});}
  function median(values){var a=values.slice().sort(function(x,y){return x-y;});return a[Math.floor(a.length/2)];}
  function tick(){return new Promise(function(resolve){setTimeout(resolve,0);});}
  async function baselineRun(count){var measures=[];var nodes=0;for(var r=0;r<3;r++){var c=document.createElement('div');document.getElementById('root').replaceChildren(c);var data=rows(count);var start=performance.now();c.innerHTML=data.map(rowHtml).join('');c.querySelectorAll('[data-id]').forEach(function(node){node.addEventListener('click',function(){});});var end=performance.now();measures.push(end-start);nodes=c.querySelectorAll('*').length;await tick();}return{firstInteractionMs:median(measures),totalRenderMs:median(measures),initialDomNodes:nodes,domNodes:nodes,rowListeners:count};}
  async function optimizedRun(count){var first=[];var totals=[];var nodes=0;var initialNodes=0;for(var r=0;r<3;r++){var c=document.createElement('div');document.getElementById('root').replaceChildren(c);var lifecycle=MobileUiRuntime.createLifecycle();lifecycle.delegate(c,'click','[data-id]',function(){});var renderer=MobileUiRuntime.createChunkedHtmlRenderer(c,{initialCount:60,chunkSize:80});var data=rows(count);var doneResolve;var done=new Promise(function(resolve){doneResolve=resolve;});var start=performance.now();renderer.render(data,rowHtml,{onComplete:doneResolve});first.push(performance.now()-start);initialNodes=c.querySelectorAll('*').length;await done;totals.push(performance.now()-start);nodes=c.querySelectorAll('*').length;renderer.cancel();lifecycle.destroy();await tick();}return{firstInteractionMs:median(first),totalRenderMs:median(totals),initialDomNodes:initialNodes,domNodes:nodes,rowListeners:1};}
  async function requestCount(){var input=document.createElement('input');document.body.appendChild(input);var count=0;var lifecycle=MobileUiRuntime.createLifecycle();MobileUiRuntime.bindDebouncedInput(lifecycle,input,function(){count+=1;},{wait:30});for(var i=0;i<10;i++){input.value+='x';input.dispatchEvent(new Event('input',{bubbles:true}));}await new Promise(function(resolve){setTimeout(resolve,60);});lifecycle.destroy();input.remove();return count;}
  async function memorySwitch(mode){if(window.gc)window.gc();var start=performance.memory?performance.memory.usedJSHeapSize:0;var root=document.getElementById('root');for(var i=0;i<50;i++){var c=document.createElement('div');root.replaceChildren(c);var data=rows(100);if(mode==='baseline'){c.innerHTML=data.map(rowHtml).join('');c.querySelectorAll('[data-id]').forEach(function(node){node.addEventListener('click',function(){});});}else{var lifecycle=MobileUiRuntime.createLifecycle();lifecycle.delegate(c,'click','[data-id]',function(){});var renderer=MobileUiRuntime.createChunkedHtmlRenderer(c,{initialCount:60,chunkSize:80});await new Promise(function(resolve){renderer.render(data,rowHtml,{onComplete:resolve});});renderer.cancel();lifecycle.destroy();}await tick();}root.replaceChildren();if(window.gc)window.gc();await tick();var end=performance.memory?performance.memory.usedJSHeapSize:0;return Math.max(0,end-start);}
  var result={environment:{userAgent:navigator.userAgent},datasets:{}};
  for (const count of [100,500,1000]) result.datasets[count]={baseline:await baselineRun(count),optimized:await optimizedRun(count)};
  result.requestsForTenKeystrokes={baseline:1,optimized:await requestCount()};
  result.memoryAfter50ScreenSwitchesBytes={baseline:await memorySwitch('baseline'),optimized:await memorySwitch('optimized')};
  return result;
})()`;

(async () => {
  const chromium = spawn('/usr/bin/chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--enable-precise-memory-info', '--js-flags=--expose-gc',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  let client;
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const pageTarget = targets.find((target) => target.type === 'page');
    if (!pageTarget) throw new Error('Chromium page target not found');
    client = await createCdpClient(pageTarget.webSocketDebuggerUrl);
    const evaluated = await client.call('Runtime.evaluate', {
      expression: benchmarkExpression,
      awaitPromise: true,
      returnByValue: true
    });
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.text || 'Benchmark evaluation failed');
    const result = evaluated.result.value;
    result.generatedAt = new Date().toISOString();
    fs.writeFileSync(outputJson, JSON.stringify(result, null, 2) + '\n');
    const csv = ['rows,mode,firstInteractionMs,totalRenderMs,initialDomNodes,domNodes,rowListeners'];
    for (const [rowsCount, modes] of Object.entries(result.datasets)) {
      for (const [mode, values] of Object.entries(modes)) {
        csv.push([rowsCount, mode, values.firstInteractionMs.toFixed(3), values.totalRenderMs.toFixed(3), values.initialDomNodes, values.domNodes, values.rowListeners].join(','));
      }
    }
    fs.writeFileSync(outputCsv, csv.join('\n') + '\n');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (client) {
      client.close();
    }
    chromium.kill('SIGKILL');
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
