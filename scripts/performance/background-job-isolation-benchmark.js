'use strict';
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const crypto = require('crypto');
const { createWorkbook, appendAoaSheet, writeWorkbook } = require('../../src/utils/excelWriter.util');

const OUT = process.argv[2] || path.join(process.cwd(), 'BACKGROUND_JOB_BENCHMARK.json');
const CSV = process.argv[3] || path.join(process.cwd(), 'BACKGROUND_JOB_BENCHMARK.csv');
const RUNS = Math.max(3, Number(process.env.BACKGROUND_BENCHMARK_RUNS || 5));
const datasets = [
  { scale: '1x', rows: Number(process.env.BACKGROUND_BENCHMARK_1X || 2000) },
  { scale: '5x', rows: Number(process.env.BACKGROUND_BENCHMARK_5X || 10000) },
  { scale: '10x', rows: Number(process.env.BACKGROUND_BENCHMARK_10X || 20000) }
];
function buildRows(count) {
  const rows = [['STT','Mã đơn','Khách hàng','Mã SP','Tên SP','SL','Đơn giá','Thành tiền']];
  for (let i = 0; i < count; i += 1) rows.push([i + 1, `SO${i}`, `Khách ${i % 500}`, `P${i % 2000}`, `Sản phẩm ${i % 2000}`, (i % 20) + 1, 10000 + (i % 100), ((i % 20) + 1) * (10000 + (i % 100))]);
  return rows;
}
function percentile(values, q) {
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1))] || 0;
}
function summarize(samples) {
  return {
    p50Ms: percentile(samples.map(x=>x.durationMs), .5),
    p95Ms: percentile(samples.map(x=>x.durationMs), .95),
    p99Ms: percentile(samples.map(x=>x.durationMs), .99),
    heapDeltaP95Bytes: percentile(samples.map(x=>x.heapDelta), .95),
    cpuUserP95Micros: percentile(samples.map(x=>x.cpuUserMicros || 0), .95),
    bytes: samples[0]?.bytes || 0
  };
}
function runInline(rows) {
  if (global.gc) global.gc();
  const beforeHeap = process.memoryUsage().heapUsed;
  const beforeCpu = process.cpuUsage();
  const start = process.hrtime.bigint();
  const wb = createWorkbook();
  appendAoaSheet(wb, 'Export', buildRows(rows));
  const buffer = writeWorkbook(wb);
  return {
    durationMs: Number(process.hrtime.bigint() - start) / 1e6,
    heapDelta: process.memoryUsage().heapUsed - beforeHeap,
    cpuUserMicros: process.cpuUsage(beforeCpu).user,
    bytes: buffer.length
  };
}
function prepareQueueCommand(rows) {
  if (global.gc) global.gc();
  const beforeHeap = process.memoryUsage().heapUsed;
  const beforeCpu = process.cpuUsage();
  const start = process.hrtime.bigint();
  const query = { invoiceType: 'VAT', dateFrom: '2026-06-01', dateTo: '2026-06-20', limit: String(rows) };
  const idempotencyKey = crypto.createHash('sha256').update(`export|invoice-orders|${JSON.stringify(query)}`).digest('hex');
  const command = JSON.stringify({ type: 'export_excel', idempotencyKey, payload: { type: 'invoice-orders', query } });
  return {
    durationMs: Number(process.hrtime.bigint() - start) / 1e6,
    heapDelta: process.memoryUsage().heapUsed - beforeHeap,
    cpuUserMicros: process.cpuUsage(beforeCpu).user,
    responseBytes: Buffer.byteLength(JSON.stringify({ accepted: true, jobId: 'JOB_BENCHMARK' })),
    commandBytes: Buffer.byteLength(command)
  };
}
function runWorker(rows) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'background-job-benchmark-child.js'), [String(rows)], {
      stdio: ['ignore','ignore','ignore','ipc'],
      execArgv: ['--max-old-space-size=256']
    });
    let settled = false;
    child.on('message', (message) => {
      if (message.type === 'completed' && !settled) {
        settled = true;
        resolve({ durationMs: message.durationMs, heapDelta: message.heapDelta, bytes: message.bytes });
      }
    });
    child.once('error', reject);
    child.once('exit', (code) => { if (code !== 0 && !settled) reject(new Error(`benchmark child exit ${code}`)); });
  });
}

(async () => {
  const results = [];
  for (const dataset of datasets) {
    const before = [];
    const after = [];
    for (let i = 0; i < RUNS; i += 1) before.push(runInline(dataset.rows));
    const workers = [];
    for (let i = 0; i < RUNS; i += 1) {
      after.push(prepareQueueCommand(dataset.rows));
      workers.push(await runWorker(dataset.rows));
    }
    const beforeSummary = summarize(before);
    const afterSummary = summarize(after);
    afterSummary.workerCompletionP95Ms = percentile(workers.map(x=>x.durationMs), .95);
    afterSummary.workerHeapDeltaP95Bytes = percentile(workers.map(x=>x.heapDelta), .95);
    afterSummary.workerOutputBytes = workers[0]?.bytes || 0;
    afterSummary.responseBytes = after[0]?.responseBytes || 0;
    afterSummary.commandBytes = after[0]?.commandBytes || 0;
    results.push({
      scale: dataset.scale,
      rows: dataset.rows,
      before: beforeSummary,
      after: afterSummary,
      webP95ImprovementPercent: beforeSummary.p95Ms ? (beforeSummary.p95Ms - afterSummary.p95Ms) / beforeSummary.p95Ms * 100 : 0
    });
  }
  const concurrentRows = Number(process.env.BACKGROUND_BENCHMARK_CONCURRENT_ROWS || 10000);
  const concurrentStarted = process.hrtime.bigint();
  const concurrentWorkers = await Promise.all([runWorker(concurrentRows), runWorker(concurrentRows)]);
  const report = {
    generatedAt: new Date().toISOString(),
    methodology: 'Synthetic XLSX workload using production excelWriter.util. Before builds XLSX inside the web process. After measures bounded web-side queue-command preparation and separately measures the same XLSX build in a memory-capped worker process.',
    limitations: ['MongoDB enqueue and HTTP network latency are excluded because no production-like MongoDB is available', 'Worker completion remains CPU-bound', 'The benchmark demonstrates web-process CPU/heap isolation, not faster workbook generation'],
    runsPerDataset: RUNS,
    concurrentExportScenario: {
      workers: 2,
      rowsPerWorker: concurrentRows,
      wallMs: Number(process.hrtime.bigint() - concurrentStarted) / 1e6,
      workerDurationsMs: concurrentWorkers.map((item) => item.durationMs),
      workerHeapDeltaBytes: concurrentWorkers.map((item) => item.heapDelta),
      outputBytes: concurrentWorkers.map((item) => item.bytes)
    },
    results
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  const lines = ['scale,rows,before_p95_ms,after_web_dispatch_p95_ms,improvement_percent,before_heap_p95_bytes,after_parent_heap_p95_bytes,worker_completion_p95_ms,worker_heap_p95_bytes'];
  for (const row of results) lines.push([row.scale,row.rows,row.before.p95Ms,row.after.p95Ms,row.webP95ImprovementPercent,row.before.heapDeltaP95Bytes,row.after.heapDeltaP95Bytes,row.after.workerCompletionP95Ms,row.after.workerHeapDeltaP95Bytes].join(','));
  fs.writeFileSync(CSV, lines.join('\n') + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error); process.exit(1); });
