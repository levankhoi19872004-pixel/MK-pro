'use strict';

/**
 * Read-only mobile production benchmark wrapper.
 * It delegates GET requests to api-benchmark.js and validates realistic mobile thresholds.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_ENDPOINTS = [
  '/api/mobile/customers?page=1&limit=40',
  '/api/mobile/product-groups',
  '/api/mobile/products?q=a&page=1&limit=50&inStockOnly=1',
  '/api/mobile/sales/orders?mine=1&page=1&limit=30',
  '/api/mobile/debts?page=1&limit=30'
];

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function evaluate(report = {}, env = process.env) {
  const maxP95Ms = Math.max(100, number(env.MOBILE_BENCHMARK_MAX_P95_MS, 3000));
  const maxAverageBytes = Math.max(1024, number(env.MOBILE_BENCHMARK_MAX_AVG_BYTES, 200000));
  const maxFailureRate = Math.min(1, Math.max(0, number(env.MOBILE_BENCHMARK_MAX_FAILURE_RATE, 0.01)));
  const violations = [];
  for (const row of report.results || []) {
    const failureRate = Number(row.failures || 0) / Math.max(1, Number(row.requests || 0));
    if (Number(row.latencyMs?.p95 || 0) > maxP95Ms) {
      violations.push({ endpoint: row.endpoint, concurrency: row.concurrent, code: 'P95_MS', value: row.latencyMs.p95, limit: maxP95Ms });
    }
    if (Number(row.responseBytes?.average || 0) > maxAverageBytes) {
      violations.push({ endpoint: row.endpoint, concurrency: row.concurrent, code: 'AVG_BYTES', value: row.responseBytes.average, limit: maxAverageBytes });
    }
    if (failureRate > maxFailureRate) {
      violations.push({ endpoint: row.endpoint, concurrency: row.concurrent, code: 'FAILURE_RATE', value: Number(failureRate.toFixed(4)), limit: maxFailureRate });
    }
  }
  return { maxP95Ms, maxAverageBytes, maxFailureRate, violations };
}

function main() {
  const output = process.env.MOBILE_BENCHMARK_OUTPUT || path.join(os.tmpdir(), `mkpro-mobile-benchmark-${process.pid}.json`);
  const endpoints = process.env.MOBILE_BENCHMARK_ENDPOINTS || DEFAULT_ENDPOINTS.join(',');
  const benchmark = path.join(__dirname, 'api-benchmark.js');
  const env = {
    ...process.env,
    PERF_ENDPOINTS: endpoints,
    PERF_CONCURRENCY: process.env.MOBILE_BENCHMARK_CONCURRENCY || '1,5',
    PERF_REQUESTS_PER_LEVEL: process.env.MOBILE_BENCHMARK_REQUESTS || '20',
    PERF_WARMUP_REQUESTS: process.env.MOBILE_BENCHMARK_WARMUP || '2',
    PERF_TIMEOUT_MS: process.env.MOBILE_BENCHMARK_TIMEOUT_MS || '5000',
    PERF_OUTPUT: output
  };
  const run = spawnSync(process.execPath, [benchmark], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  if (run.status !== 0) {
    process.stderr.write(run.stdout || '');
    process.exitCode = run.status || 1;
    return;
  }
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  const audit = evaluate(report);
  const combined = { ...report, mobileAudit: audit };
  const text = `${JSON.stringify(combined, null, 2)}\n`;
  if (process.env.MOBILE_BENCHMARK_OUTPUT) fs.writeFileSync(process.env.MOBILE_BENCHMARK_OUTPUT, text);
  process.stdout.write(text);
  if (process.env.MOBILE_BENCHMARK_ENFORCE === '1' && audit.violations.length) process.exitCode = 1;
  if (!process.env.MOBILE_BENCHMARK_OUTPUT) fs.rmSync(output, { force: true });
}

if (require.main === module) main();
module.exports = { evaluate, DEFAULT_ENDPOINTS };
