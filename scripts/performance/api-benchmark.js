'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
const { resolveBenchmarkEndpoints, validateEndpointPath } = require('../../config/performance-benchmark-endpoints');

const DEFAULT_LOCAL_CONCURRENCY = [1, 5, 10, 20];
const DEFAULT_REMOTE_CONCURRENCY = [1, 2, 5];
const EVIDENCE_STATUS = Object.freeze({
  local: 'MEASURED_LOCAL',
  staging: 'MEASURED_STAGING_READ_ONLY',
  production: 'MEASURED_PRODUCTION_READ_ONLY'
});

function envNumber(name, fallback, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= minimum ? Math.min(value, maximum) : fallback;
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

function redact(value) {
  return String(value || '')
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/token=[^&\s]+/gi, 'token=[redacted]')
    .replace(/jwt=[^&\s]+/gi, 'jwt=[redacted]');
}

function classifyEnvironment({ inProcess, baseUrl, env = process.env }) {
  const parsed = new URL(baseUrl);
  if (inProcess || localTarget(parsed)) {
    return { targetEnv: 'local', evidenceStatus: EVIDENCE_STATUS.local, remote: false };
  }
  const targetEnv = String(env.PERF_TARGET_ENV || '').trim().toLowerCase();
  if (!['staging', 'production'].includes(targetEnv)) {
    return { targetEnv: targetEnv || 'remote-unclassified', evidenceStatus: 'REMOTE_UNCLASSIFIED', remote: true };
  }
  return { targetEnv, evidenceStatus: EVIDENCE_STATUS[targetEnv], remote: true };
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

async function readResponseBytes(response, options = {}) {
  const maxBytes = options.maxResponseBytes || 1024 * 1024;
  if (!response.body || typeof response.body.getReader !== 'function') {
    const bytes = Number(response.headers.get('content-length') || 0);
    return { bytes: Number.isFinite(bytes) ? bytes : 0, tooLarge: bytes > maxBytes, streamUnavailable: true };
  }
  const reader = response.body.getReader();
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value ? value.byteLength : 0;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => {});
      return { bytes, tooLarge: true };
    }
  }
  return { bytes, tooLarge: false };
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
    const body = await readResponseBytes(response, options);
    const authBlocked = response.status === 401 || response.status === 403;
    return {
      ok: response.status >= 200 && response.status < 400 && !body.tooLarge && !authBlocked,
      status: response.status,
      latencyMs: performance.now() - started,
      bytes: body.bytes,
      mongoMs: Number(response.headers.get('x-mongo-time-ms') || 0),
      jsMs: Number(response.headers.get('x-js-time-ms') || 0),
      serverMs: Number(response.headers.get('x-response-time-ms') || 0),
      dbQueries: Number(response.headers.get('x-db-queries') || 0),
      error: authBlocked ? 'BLOCKED_AUTH' : (body.tooLarge ? 'RESPONSE_TOO_LARGE' : '')
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
      error: error && error.name === 'AbortError' ? 'timeout' : redact(error && error.message || error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  timeout.unref?.();
  try {
    const response = await fetch(url, { method: 'GET', headers: options.headers, signal: controller.signal, redirect: 'manual' });
    if (response.status === 401 || response.status === 403) return { ok: false, status: response.status, error: 'BLOCKED_AUTH' };
    if (response.status < 200 || response.status >= 400) return { ok: false, status: response.status, error: `HTTP_${response.status}` };
    const text = await response.text();
    if (text.length > options.maxResponseBytes) return { ok: false, status: response.status, error: 'RESPONSE_TOO_LARGE' };
    return { ok: true, status: response.status, json: JSON.parse(text) };
  } catch (error) {
    return { ok: false, status: 0, error: redact(error.message || error) };
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

function releaseId(snapshot) {
  return snapshot?.startup?.releaseId
    || snapshot?.release?.releaseId
    || snapshot?.data?.releaseId
    || snapshot?.releaseId
    || snapshot?.startup?.version
    || '';
}

function serverDelta(before, after) {
  if (!before || !after || before.ok === false || after.ok === false) return null;
  return {
    rssBytes: Number(after.process?.rssBytes || 0) - Number(before.process?.rssBytes || 0),
    heapUsedBytes: Number(after.process?.heapUsedBytes || 0) - Number(before.process?.heapUsedBytes || 0),
    requestCount: Number(after.requests?.completedRequests || 0) - Number(before.requests?.completedRequests || 0),
    failedRequests: Number(after.requests?.failedRequests || 0) - Number(before.requests?.failedRequests || 0),
    maxActiveRequests: after.requests?.maxActiveRequests || 0,
    apiP95Ms: after.api?.summary?.overallP95Ms || 0,
    errorRate5Minutes: after.window?.errorRate5Minutes || 0,
    capacity: after.capacity || null
  };
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
    endpointId: context.endpointId,
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
    apiMonitorHeaders: {
      averageServerMs: round(average(results, 'serverMs')),
      averageMongoMs: round(average(results, 'mongoMs')),
      averageJsMs: round(average(results, 'jsMs')),
      averageQueriesPerRequest: round(average(results, 'dbQueries'))
    },
    responseBytes: {
      average: round(average(results, 'bytes')),
      max: Math.max(0, ...results.map((row) => row.bytes || 0))
    },
    clientMetrics: {
      scope: context.inProcess ? 'benchmark-client-and-in-process-server' : 'benchmark-client-only',
      cpuUserMs: round(cpuUserMs),
      cpuSystemMs: round(cpuSystemMs),
      rssDeltaBytes: after.memory.rss - before.memory.rss,
      heapUsedDeltaBytes: after.memory.heapUsed - before.memory.heapUsed,
      eventLoopLagMs: {
        mean: Number.isFinite(loop.mean) ? round(loop.mean / 1e6) : 0,
        p95: round(loop.percentile(95) / 1e6),
        p99: round(loop.percentile(99) / 1e6),
        max: round(loop.max / 1e6)
      }
    },
    statusCounts,
    errors,
    elapsedMs: round(elapsedMs)
  };
}

async function benchmarkScenario(baseUrl, endpointMeta, concurrency, options) {
  const base = new URL(baseUrl);
  const target = new URL(endpointMeta.path, base);
  if (target.origin !== base.origin) throw new Error(`Endpoint leaves benchmark host: ${endpointMeta.path}`);
  validateEndpointPath(`${target.pathname}${target.search}`);
  const url = target.toString();
  for (let index = 0; index < options.warmup; index += 1) {
    await fetchOnce(url, options);
  }

  const baselineUrl = new URL('/api/system/performance-baseline', base).toString();
  const serverBefore = options.remote || endpointMeta.auth !== 'none'
    ? await fetchJson(baselineUrl, options)
    : null;

  if (serverBefore?.json?.capacity?.status === 'critical' && options.targetEnv === 'production') {
    return {
      endpoint: endpointMeta.path,
      endpointId: endpointMeta.id,
      concurrent: concurrency,
      skipped: true,
      skipReason: 'SERVER_CAPACITY_CRITICAL',
      serverBefore: serverBefore.json || serverBefore
    };
  }

  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const before = { cpu: process.cpuUsage(), memory: process.memoryUsage() };
  const started = performance.now();
  const results = await runConcurrent(options.requests, concurrency, () => fetchOnce(url, options));
  const elapsedMs = performance.now() - started;
  const after = { cpu: process.cpuUsage(), memory: process.memoryUsage() };
  loop.disable();
  const row = summarize(results, elapsedMs, before, after, loop, {
    endpoint: endpointMeta.path,
    endpointId: endpointMeta.id,
    concurrency,
    inProcess: options.inProcess
  });
  const serverAfter = options.remote || endpointMeta.auth !== 'none'
    ? await fetchJson(baselineUrl, options)
    : null;
  row.serverBefore = serverBefore?.json || serverBefore;
  row.serverAfter = serverAfter?.json || serverAfter;
  row.serverDelta = serverDelta(row.serverBefore, row.serverAfter);
  const beforeRelease = releaseId(row.serverBefore);
  const afterRelease = releaseId(row.serverAfter);
  if (beforeRelease && afterRelease && beforeRelease !== afterRelease) {
    row.evidenceStatus = 'BLOCKED_RELEASE_CHANGED';
    row.releaseChanged = { before: beforeRelease, after: afterRelease };
  }
  if (row.errors.BLOCKED_AUTH) row.evidenceStatus = 'BLOCKED_AUTH';
  if (row.serverBefore?.ok === false || row.serverAfter?.ok === false) row.evidenceStatus = row.evidenceStatus || 'BLOCKED_BASELINE_API';
  return row;
}

function toMarkdown(report = {}) {
  const lines = [
    '# Phase241 API Benchmark',
    '',
    `- Generated at: ${report.generatedAt || ''}`,
    `- Evidence status: ${report.evidenceStatus || ''}`,
    `- Target environment: ${report.environment?.targetEnv || ''}`,
    `- Base URL: ${report.safety?.baseUrl || ''}`,
    `- Method: ${report.safety?.method || 'GET'}`,
    `- Production writes: ${report.safety?.productionWrites === false ? 'false' : 'unknown'}`,
    '',
    '| Endpoint | Concurrency | Requests | Success | Failures | RPS | Avg ms | p95 | Avg Mongo header | Avg JS header | Avg bytes | Client loop p95 | Server API p95 after | Status |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|'
  ];
  for (const row of report.results || []) {
    lines.push(`|${[
      row.endpoint,
      row.concurrent,
      row.requests || 0,
      row.success || 0,
      row.failures || 0,
      row.throughputRps || 0,
      row.latencyMs?.average || 0,
      row.latencyMs?.p95 || 0,
      row.apiMonitorHeaders?.averageMongoMs || 0,
      row.apiMonitorHeaders?.averageJsMs || 0,
      row.responseBytes?.average || 0,
      row.clientMetrics?.eventLoopLagMs?.p95 || 0,
      row.serverAfter?.api?.summary?.overallP95Ms || '',
      row.evidenceStatus || (row.skipped ? row.skipReason : 'MEASURED')
    ].join('|')}|`);
  }
  lines.push('');
  lines.push('Client CPU/memory/event-loop metrics describe the benchmark client process only unless the run is explicitly in-process.');
  lines.push('Server capacity must be read from serverBefore/serverAfter/serverDelta only.');
  return `${lines.join('\n')}\n`;
}

function printHelp() {
  console.log(`Usage: node scripts/performance/api-benchmark.js\n\nEnvironment:\n  PERF_IN_PROCESS=1\n  PERF_BASE_URL=http://127.0.0.1:3000\n  PERF_TARGET_ENV=local|staging|production\n  PERF_ENDPOINTS=/api/health/live,/api/system/status\n  PERF_ALLOW_CUSTOM_ENDPOINTS=true\n  PERF_APPROVED_ENDPOINTS=/api/custom/read-only\n  PERF_CONCURRENCY=1,5,10,20\n  PERF_REQUESTS_PER_LEVEL=50\n  PERF_WARMUP_REQUESTS=3\n  PERF_TIMEOUT_MS=5000\n  PERF_MAX_RESPONSE_BYTES=1048576\n  PERF_SCENARIO_COOLDOWN_MS=1000\n  PERF_TOKEN=<JWT>\n  PERF_ALLOW_REMOTE=true\n  PERF_ALLOW_HIGH_REMOTE_CONCURRENCY=true\n\nThe benchmark sends approved GET requests only and redacts tokens from output.`);
}

async function sleep(ms) {
  if (!ms) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (process.argv.includes('--help')) {
    printHelp();
    return;
  }
  const inProcess = process.env.PERF_IN_PROCESS === '1';
  const configuredBaseUrl = process.env.PERF_BASE_URL || 'http://127.0.0.1:3000';
  const endpoints = resolveBenchmarkEndpoints(process.env.PERF_ENDPOINTS, process.env);
  const localServer = inProcess ? await startInProcessServer() : null;
  const baseUrl = localServer ? localServer.baseUrl : configuredBaseUrl;
  const target = classifyEnvironment({ inProcess, baseUrl });
  if (target.remote && process.env.PERF_ALLOW_REMOTE !== 'true') {
    throw new Error('Refused non-local benchmark target. Set PERF_ALLOW_REMOTE=true only after approval.');
  }
  if (target.remote && target.evidenceStatus === 'REMOTE_UNCLASSIFIED') {
    throw new Error('Remote benchmark requires PERF_TARGET_ENV=staging or production.');
  }

  const defaultConcurrency = target.remote ? DEFAULT_REMOTE_CONCURRENCY : DEFAULT_LOCAL_CONCURRENCY;
  const hardCeiling = target.remote ? (process.env.PERF_ALLOW_HIGH_REMOTE_CONCURRENCY === 'true' ? 10 : 5) : 50;
  const concurrencyLevels = csv(process.env.PERF_CONCURRENCY, defaultConcurrency.map(String))
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0 && value <= hardCeiling);
  if (!concurrencyLevels.length) throw new Error('PERF_CONCURRENCY is invalid');

  const token = String(process.env.PERF_TOKEN || '').trim();
  const options = {
    inProcess,
    remote: target.remote,
    targetEnv: target.targetEnv,
    requests: envNumber('PERF_REQUESTS_PER_LEVEL', target.remote ? 30 : 50, 1, target.remote ? 50 : 500),
    warmup: envNumber('PERF_WARMUP_REQUESTS', target.remote ? 1 : 3, 0, 20),
    timeoutMs: envNumber('PERF_TIMEOUT_MS', 5000, 100, 120000),
    maxResponseBytes: envNumber('PERF_MAX_RESPONSE_BYTES', 1024 * 1024, 1024, 10 * 1024 * 1024),
    headers: token ? { authorization: `Bearer ${token}` } : {}
  };
  const cooldownMs = envNumber('PERF_SCENARIO_COOLDOWN_MS', target.remote ? 5000 : 1000, 0, 600000);
  const report = {
    generatedAt: new Date().toISOString(),
    evidenceStatus: target.evidenceStatus,
    safety: {
      method: 'GET',
      baseUrl,
      inProcess,
      productionWrites: false,
      maxConcurrency: Math.max(...concurrencyLevels),
      endpointRegistry: true,
      customEndpointsAllowed: process.env.PERF_ALLOW_CUSTOM_ENDPOINTS === 'true'
    },
    environment: {
      targetEnv: target.targetEnv,
      evidenceStatus: target.evidenceStatus,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid
    },
    config: {
      endpoints: endpoints.map((row) => ({ id: row.id, path: row.path, auth: row.auth, workloadClass: row.workloadClass })),
      concurrencyLevels,
      requestsPerLevel: options.requests,
      warmupRequests: options.warmup,
      timeoutMs: options.timeoutMs,
      maxResponseBytes: options.maxResponseBytes,
      scenarioCooldownMs: cooldownMs
    },
    results: []
  };

  try {
    for (const endpoint of endpoints) {
      const endpointCeiling = target.remote ? Number(endpoint.maxConcurrency || hardCeiling) : hardCeiling;
      const allowedConcurrency = concurrencyLevels.filter((value) => value <= endpointCeiling);
      for (const concurrency of allowedConcurrency) {
        const result = await benchmarkScenario(baseUrl, endpoint, concurrency, options);
        report.results.push(result);
        if (result.evidenceStatus) report.evidenceStatus = result.evidenceStatus;
        console.error(redact(`${endpoint.path} c=${concurrency} p95=${result.latencyMs?.p95 || 0}ms failures=${result.failures || 0} status=${result.evidenceStatus || 'MEASURED'}`));
        if (result.evidenceStatus === 'BLOCKED_AUTH' || result.evidenceStatus === 'BLOCKED_RELEASE_CHANGED') break;
        if (target.targetEnv === 'production' && result.serverAfter?.capacity?.status === 'critical') break;
        await sleep(cooldownMs);
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
  console.error(`[api-benchmark] ${redact(error && error.stack || error)}`);
  process.exitCode = 1;
});
