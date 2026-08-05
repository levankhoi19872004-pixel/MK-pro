'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const resolver = require('../../src/services/delivery/DeliveryPaymentStateReadService');

const DEFAULT_SIZES = [1, 10, 100, 1000];
const ABSOLUTE_GATES = Object.freeze({ p95_100: 100, p95_1000: 500, heap100: 8 * 1024 * 1024, heap1000: 40 * 1024 * 1024, payload1000: 8 * 1024 * 1024 });

function parseArgs(argv = process.argv.slice(2)) {
  const values = {};
  argv.filter((arg) => arg.startsWith('--')).forEach((arg) => {
    const [key, ...rest] = arg.slice(2).split('=');
    values[key] = rest.length ? rest.join('=') : true;
  });
  const sizes = String(values.sizes || DEFAULT_SIZES.join(',')).split(',').map(Number).filter((value) => Number.isInteger(value) && value > 0);
  const warmup = Math.max(0, Math.min(Number(values.warmup ?? 5), 100));
  const iterations = Math.max(1, Math.min(Number(values.iterations ?? 30), 500));
  const seed = Number(values.seed ?? 261) || 261;
  if (!sizes.length || sizes.some((size) => size > 1000)) throw new Error('sizes must contain integers from 1 to 1000');
  return { sizes, warmup, iterations, seed, json: values.json || '', mongoExplain: values['mongo-explain'] === true || values['mongo-explain'] === 'true' };
}

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1))];
}
function chain(rows) {
  return { select() { return this; }, sort() { return this; }, session() { return this; }, async lean() { return rows; } };
}
function instrumentedModel(name, rows, counters) {
  const model = { find() { counters.find[name] = (counters.find[name] || 0) + 1; return chain(rows); } };
  for (const method of ['save','create','insert','insertMany','updateOne','updateMany','findOneAndUpdate','bulkWrite','deleteOne','deleteMany']) {
    model[method] = () => { counters.write[method] = (counters.write[method] || 0) + 1; throw new Error(`unexpected write ${method}`); };
  }
  return model;
}

function fixture(size, seed = 261) {
  const random = rng(seed + size);
  const orders = [];
  const versions = [];
  const allocations = [];
  const returns = [];
  for (let index = 0; index < size; index += 1) {
    const id = `SO-${index}`;
    const code = `B${String(index).padStart(7, '0')}`;
    const total = 100000 + (index % 17) * 1000;
    const bucket = random();
    const order = { _id: id, id, orderId: id, code, orderCode: code, tenantId: 'TENANT-A', totalAmount: total, cashAmount: 0, bankAmount: 0, rewardAmount: 0, offsetAmount: 0, status: 'delivered' };
    orders.push(order);
    if (bucket < 0.4) {
      versions.push({ id: `V-${index}`, orderId: id, orderCode: code, tenantId: 'TENANT-A', closeoutVersion: 2, status: 'accounting_confirmed', originalAmount: total, cashAmount: 25000, bankAmount: 5000, rewardAmount: 0, offsetAmount: 0 });
      allocations.push({ id: `A-${index}`, allocationCode: `A-${index}`, orderId: id, orderCode: code, tenantId: 'TENANT-A', sourceVersion: 2, status: 'posted', active: true, receivableAmount: total, cashAmount: 30000, bankAmount: 5000, rewardAmount: 0, offsetAmount: 0 });
    } else if (bucket < 0.55) {
      versions.push({ id: `V-${index}`, orderId: id, orderCode: code, tenantId: 'TENANT-A', closeoutVersion: 2, status: 'accounting_confirmed', originalAmount: total, cashAmount: 20000 });
      allocations.push({ id: `A-${index}`, allocationCode: `A-${index}`, orderId: id, orderCode: code, tenantId: 'TENANT-A', sourceVersion: 1, status: 'posted', active: true, receivableAmount: total, cashAmount: 30000 });
    } else if (bucket < 0.75) {
      versions.push({ id: `V-${index}`, orderId: id, orderCode: code, tenantId: 'TENANT-A', closeoutVersion: 1, status: 'accounting_confirmed', originalAmount: total, cashAmount: 18000, bankAmount: 2000 });
    } else if (bucket < 0.9) {
      order.deliveryCloseout = { originalAmount: total, cashAmount: 12000, bankAmount: 1000, rewardAmount: 0, offsetAmount: 0 };
    }
    const returnCount = index % 4;
    for (let r = 0; r < returnCount; r += 1) returns.push({ id: `R-${index}-${r}`, orderId: id, orderCode: code, tenantId: 'TENANT-A', status: r === 2 ? 'cancelled' : 'waiting_receive', returnAmount: 1000 + r * 250 });
  }
  return { orders, versions, allocations, returns };
}

async function executeOnce(data) {
  const counters = { find: {}, write: {} };
  const models = {
    DeliveryCloseoutVersion: instrumentedModel('versions', data.versions, counters),
    OrderPaymentAllocation: instrumentedModel('allocations', data.allocations, counters),
    ReturnOrder: instrumentedModel('returns', data.returns, counters)
  };
  const startHeap = process.memoryUsage().heapUsed;
  const start = performance.now();
  const result = await resolver.resolvePaymentStatesForOrders(data.orders, { models, includeReturnState: true, maxOrders: 1000, maxPaymentCandidates: 200000, maxReturnCandidates: 200000 });
  const durationMs = performance.now() - start;
  const endHeap = process.memoryUsage().heapUsed;
  const payloadBytes = Buffer.byteLength(JSON.stringify(result.states));
  return { durationMs, heapDeltaBytes: Math.max(0, endHeap - startHeap), payloadBytes, queryCount: Object.values(counters.find).reduce((sum, value) => sum + value, 0), queries: counters.find, writes: counters.write, states: result.states.length };
}

function evaluateSize(size, samples) {
  const durations = samples.map((item) => item.durationMs);
  const heaps = samples.map((item) => item.heapDeltaBytes);
  const payloads = samples.map((item) => item.payloadBytes);
  const p50 = percentile(durations, 0.5);
  const p95 = percentile(durations, 0.95);
  const heapMedian = percentile(heaps, 0.5);
  const payloadMedian = percentile(payloads, 0.5);
  const queryPass = samples.every((item) => item.queryCount === 3 && Object.keys(item.writes).length === 0);
  let latencyPass = true;
  if (size <= 100) latencyPass = p95 <= ABSOLUTE_GATES.p95_100;
  else if (size === 1000) latencyPass = p95 <= ABSOLUTE_GATES.p95_1000;
  let heapPass = true;
  if (size === 100) heapPass = heapMedian <= ABSOLUTE_GATES.heap100;
  else if (size === 1000) heapPass = heapMedian <= ABSOLUTE_GATES.heap1000;
  const payloadPass = size !== 1000 || payloadMedian <= ABSOLUTE_GATES.payload1000;
  return { size, iterations: samples.length, p50Ms: Number(p50.toFixed(3)), p95Ms: Number(p95.toFixed(3)), heapDeltaMedianBytes: heapMedian, payloadMedianBytes: payloadMedian, queryCount: samples[0]?.queryCount || 0, queries: samples[0]?.queries || {}, writes: samples.reduce((sum, item) => sum + Object.values(item.writes || {}).reduce((inner, value) => inner + Number(value || 0), 0), 0), queryPass, latencyPass, heapPass, payloadPass, pass: queryPass && latencyPass && heapPass && payloadPass };
}

async function runBenchmark(options = {}) {
  const sizes = options.sizes || DEFAULT_SIZES;
  const warmup = options.warmup ?? 5;
  const iterations = options.iterations ?? 30;
  const results = [];
  for (const size of sizes) {
    const data = fixture(size, options.seed || 261);
    for (let index = 0; index < warmup; index += 1) await executeOnce(data);
    const samples = [];
    for (let index = 0; index < iterations; index += 1) {
      if (global.gc) global.gc();
      samples.push(await executeOnce(data));
    }
    results.push(evaluateSize(size, samples));
  }
  const report = {
    schemaVersion: 'canonical-delivery-financial-performance-v1',
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    gcExposed: typeof global.gc === 'function',
    options: { sizes, warmup, iterations, seed: options.seed || 261 },
    absoluteGates: ABSOLUTE_GATES,
    results,
    mongoExplain: { status: options.mongoExplain ? 'NOT_RUN_ENV_UNAVAILABLE' : 'NOT_REQUESTED' },
    relativeEndpointComparison: { status: 'NOT_COMPARABLE_SYNTHETIC', reason: 'No production-like endpoint baseline or MongoDB environment supplied' },
    pass: results.every((item) => item.pass)
  };
  return report;
}

async function main() {
  const options = parseArgs();
  const report = await runBenchmark(options);
  if (options.json) {
    const target = path.resolve(options.json);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { DEFAULT_SIZES, ABSOLUTE_GATES, parseArgs, fixture, executeOnce, evaluateSize, runBenchmark, percentile };
