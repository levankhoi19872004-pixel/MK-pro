'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');

const DEFAULT_ENDPOINTS = ['/api/health/live', '/api/health/ready', '/api/system/status'];
const DEFAULT_LOCAL_CONCURRENCY = [1, 5, 10, 20];
const DEFAULT_REMOTE_CONCURRENCY = [1, 2, 5];

function envNumber(name, fallback, minimum = 0) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

function csv(value, fallback = []) {
  const rows = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  return rows.length ? rows : fallback;
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.min(index, sorted.length - 1)];
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function localTarget(url) {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
}

function validateReadOnlyEndpoint(endpoint) {
  if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('\\')) {
    throw new Error(`Endpoint phải là path cùng host và bắt đầu bằng một dấu /: ${endpoint}`);
  }
  if (/\s/.test(endpoint)) throw new Error(`Endpoint không hợp lệ: ${endpoint}`);
  const lower = endpoint.toLowerCase();
  const forbidden = ['/commit', '/closeout', '/confirm', '/reconciliation/run', '/repair', '/reset', '/delete', '/update', '/create'];
  if (forbidden.some((item) => lower.includes(item))) {
    throw new Error(`Benchmark only allows read-only GET paths; refused write-like endpoint: ${endpoint}`);
  }
  return endpoint;
}

async function startInProcessServer() {
  process.env.NODE_ENV = 'test';
  process.env.API_PERF_LOG = '0';
  process.env.TRUST_PROXY = '0';
  const { app } = require('../../src/app');
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.once('error', reject);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function fetchOnce(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  timeout.unref?.();
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: options.headers,
      signal: controller.signal,
      redirect: 'manual'
    });
    const body = await response.arrayBuffer();
    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      latencyMs: performance.now() - started,
      bytes: body.byteLength,
      mongoMs: Number(response.headers.get('x-mongo-time-ms') || 0),
      jsMs: Number(response.headers.get('x-js-time-ms') || 0),
      serverMs: Number(response.headers.get('x-response-time-ms') || 0),
      dbQueries: Number(response.headers.get('x-db-queries') || 0)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: performance.now() - started,
      bytes: 0,
      mongoMs: 0,
      jsMs: 0,
      serverMs: 0,
      dbQueries: 0,
      error: error && error.name === 'AbortError' ? 'timeout' : String(error && error.message || error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runConcurrent(total, concurrency, task) {
  let cursor = 0;
  const results = new Array(total);
  const workerCount = Math.min(total, concurrency);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= total) return;
      results[index] = await task(index);
    }
  }));
  return results;
}

function average(rows, field) {
  return rows.length ? rows.reduce((sum, row) => sum + Number(row[field] || 0), 0) / rows.length : 0;
}

function summarize(results, elapsedMs, before, after, loop, context) {
  const latencies = results.map((row) => row.latencyMs).sort((a, b) => a - b);
  const success = results.filter((row) => row.ok).length;
  const failures = results.length - success;
  const statusCounts = {};
  const errors = {};
  for (const row of results) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    if (row.error) errors[row.error] = (errors[row.error] || 0) + 1;
  }
  const cpuUserMs = (after.cpu.user - before.cpu.user) / 1000;
  const cpuSystemMs = (after.cpu.system - before.cpu.system) / 1000;
  return {
    endpoint: context.endpoint,
    concurrent: context.concurrency,
    requests: results.length,
    success,
    failures,
    throughputRps: round(results.length / Math.max(elapsedMs / 1000, 0.001)),
    latencyMs: {
      min: round(latencies[0]),
      average: round(average(results, 'latencyMs')),
      median: round(percentile(latencies, 0.5)),
      p95: round(percentile(latencies, 0.95)),
      p99: round(percentile(latencies, 0.99)),
      max: round(latencies[latencies.length - 1])
    },
    apiMonitor: {
      averageServerMs: round(average(results, 'serverMs')),
      averageMongoMs: round(average(results, 'mongoMs')),
      averageJsMs: round(average(results, 'jsMs')),
      averageQueriesPerRequest: round(average(results, 'dbQueries'))
    },
    responseBytes: {
      average: round(average(results, 'bytes')),
      max: Math.max(0, ...results.map((row) => row.bytes || 0))
    },
    process: {
      scope: context.inProcess ? 'benchmark-client-and-in-process-server' : 'benchmark-client-only',
      cpuUserMs: round(cpuUserMs),
      cpuSystemMs: round(cpuSystemMs),
      rssDeltaBytes: after.memory.rss - before.memory.rss,
      heapUsedDeltaBytes: after.memory.heapUsed - before.memory.heapUsed,
      heapUsedBeforeBytes: before.memory.heapUsed,
      heapUsedAfterBytes: after.memory.heapUsed
    },
    eventLoopLagMs: {
      mean: Number.isFinite(loop.mean) ? round(loop.mean / 1e6) : 0,
      p95: round(loop.percentile(95) / 1e6),
      p99: round(loop.percentile(99) / 1e6),
      max: round(loop.max / 1e6)
    },
    statusCounts,
    errors,
    elapsedMs: round(elapsedMs)
  };
}

function toMarkdown(report = {}) {
  const lines = [
    '# Phase240 API Benchmark',
    '',
    `- Generated at: ${report.generatedAt || ''}`,
    `- Evidence status: ${report.evidenceStatus || ''}`,
    `- Base URL: ${report.safety?.baseUrl || ''}`,
    `- Method: ${report.safety?.method || 'GET'}`,
    `- Production writes: ${report.safety?.productionWrites === false ? 'false' : 'unknown'}`,
    '',
    '| Endpoint | Concurrency | Requests | Success | Failures | RPS | Avg ms | p50 | p95 | p99 | Max | Avg Mongo | Avg JS | Avg queries | Avg bytes | Event loop p95 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
  ];
  for (const row of report.results || []) {
    lines.push(`|${[
      row.endpoint,
      row.concurrent,
      row.requests,
      row.success,
      row.failures,
      row.throughputRps,
      row.latencyMs?.average,
      row.latencyMs?.median,
      row.latencyMs?.p95,
      row.latencyMs?.p99,
      row.latencyMs?.max,
      row.apiMonitor?.averageMongoMs,
      row.apiMonitor?.averageJsMs,
      row.apiMonitor?.averageQueriesPerRequest,
      row.responseBytes?.average,
      row.eventLoopLagMs?.p95
    ].join('|')}|`);
  }
  lines.push('');
  lines.push('Production capacity must only be interpreted when the target environment and workload are production-like.');
  return `${lines.join('\n')}\n`;
}

async function benchmarkScenario(baseUrl, endpoint, concurrency, options) {
  const base = new URL(baseUrl);
  const target = new URL(endpoint, base);
  if (target.origin !== base.origin) throw new Error(`Endpoint vượt ra ngoài benchmark host: ${endpoint}`);
  const url = target.toString();
  for (let index = 0; index < options.warmup; index += 1) {
    await fetchOnce(url, options);
  }

  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const before = { cpu: process.cpuUsage(), memory: process.memoryUsage() };
  const started = performance.now();
  const results = await runConcurrent(options.requests, concurrency, () => fetchOnce(url, options));
  const elapsedMs = performance.now() - started;
  const after = { cpu: process.cpuUsage(), memory: process.memoryUsage() };
  loop.disable();
  return summarize(results, elapsedMs, before, after, loop, {
    endpoint,
    concurrency,
    inProcess: options.inProcess
  });
}

function printHelp() {
  console.log(`Usage: node scripts/performance/api-benchmark.js\n\nEnvironment:\n  PERF_IN_PROCESS=1              Start Express only; no Mongo connection or jobs\n  PERF_BASE_URL=http://127.0.0.1:3000\n  PERF_ENDPOINTS=/api/health/live,/api/health/ready,/api/system/status\n  PERF_CONCURRENCY=1,5,10,20\n  PERF_REQUESTS_PER_LEVEL=50\n  PERF_WARMUP_REQUESTS=3\n  PERF_TIMEOUT_MS=5000\n  PERF_TOKEN=<JWT>               Optional Bearer token for protected GET endpoints\n  PERF_ALLOW_REMOTE=true         Explicit opt-in for non-local targets\n  PERF_ALLOW_HIGH_REMOTE_CONCURRENCY=true\n  PERF_OUTPUT=<path.json>        Optional JSON output file\n  PERF_MARKDOWN_OUTPUT=<path.md> Optional Markdown output file\n\nThe benchmark sends GET requests only.`);
}

async function main() {
  if (process.argv.includes('--help')) {
    printHelp();
    return;
  }
  const inProcess = process.env.PERF_IN_PROCESS === '1';
  const endpoints = csv(process.env.PERF_ENDPOINTS, DEFAULT_ENDPOINTS).map(validateReadOnlyEndpoint);
  const configuredBaseUrl = process.env.PERF_BASE_URL || 'http://127.0.0.1:3000';
  const parsedBaseForConcurrency = new URL(configuredBaseUrl);
  const remoteTarget = !inProcess && !localTarget(parsedBaseForConcurrency);
  const defaultConcurrency = remoteTarget ? DEFAULT_REMOTE_CONCURRENCY : DEFAULT_LOCAL_CONCURRENCY;
  const maxConcurrency = remoteTarget && process.env.PERF_ALLOW_HIGH_REMOTE_CONCURRENCY !== 'true' ? 5 : 50;
  const concurrencyLevels = csv(process.env.PERF_CONCURRENCY, defaultConcurrency.map(String))
    .map(Number).filter((value) => Number.isInteger(value) && value > 0 && value <= maxConcurrency);
  if (!concurrencyLevels.length) throw new Error('PERF_CONCURRENCY không hợp lệ');
  if (!inProcess) {
    const parsedBase = new URL(configuredBaseUrl);
    if (!localTarget(parsedBase) && process.env.PERF_ALLOW_REMOTE !== 'true') {
      throw new Error('Từ chối benchmark target không phải localhost. Đặt PERF_ALLOW_REMOTE=true sau khi được phê duyệt.');
    }
  }
  const localServer = inProcess ? await startInProcessServer() : null;
  const baseUrl = localServer ? localServer.baseUrl : configuredBaseUrl;

  const token = String(process.env.PERF_TOKEN || '').trim();
  const options = {
    inProcess,
    requests: Math.max(1, envNumber('PERF_REQUESTS_PER_LEVEL', 50, 1)),
    warmup: Math.max(0, envNumber('PERF_WARMUP_REQUESTS', 3, 0)),
    timeoutMs: Math.max(100, envNumber('PERF_TIMEOUT_MS', 5000, 100)),
    headers: token ? { authorization: `Bearer ${token}` } : {}
  };
  const report = {
    generatedAt: new Date().toISOString(),
    evidenceStatus: inProcess ? 'MEASURED_LOCAL' : (localTarget(new URL(baseUrl)) ? 'MEASURED_LOCAL' : 'MEASURED_PRODUCTION_READ_ONLY'),
    safety: {
      method: 'GET',
      baseUrl,
      inProcess,
      productionWrites: false,
      maxConcurrency: Math.max(...concurrencyLevels)
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid
    },
    config: {
      endpoints,
      concurrencyLevels,
      requestsPerLevel: options.requests,
      warmupRequests: options.warmup,
      timeoutMs: options.timeoutMs
    },
    results: []
  };

  try {
    for (const endpoint of endpoints) {
      for (const concurrency of concurrencyLevels) {
        const result = await benchmarkScenario(baseUrl, endpoint, concurrency, options);
        report.results.push(result);
        console.error(`${endpoint} c=${concurrency} avg=${result.latencyMs.average}ms p95=${result.latencyMs.p95}ms rps=${result.throughputRps} failures=${result.failures}`);
      }
    }
  } finally {
    if (localServer) await localServer.close();
  }

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (process.env.PERF_OUTPUT) {
    fs.mkdirSync(path.dirname(process.env.PERF_OUTPUT), { recursive: true });
    fs.writeFileSync(process.env.PERF_OUTPUT, json);
  }
  if (process.env.PERF_MARKDOWN_OUTPUT) {
    fs.mkdirSync(path.dirname(process.env.PERF_MARKDOWN_OUTPUT), { recursive: true });
    fs.writeFileSync(process.env.PERF_MARKDOWN_OUTPUT, toMarkdown(report));
  }
  process.stdout.write(json);
}

main().catch((error) => {
  console.error(`[api-benchmark] ${error && error.stack || error}`);
  process.exitCode = 1;
});
