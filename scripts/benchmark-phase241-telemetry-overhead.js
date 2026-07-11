'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'reports', 'performance');

function runMode(enabled) {
  const output = path.join(OUT_DIR, `phase241-overhead-${enabled ? 'enabled' : 'disabled'}.json`);
  const result = spawnSync(process.execPath, ['scripts/performance/api-benchmark.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PERF_TELEMETRY_ENABLED: enabled ? 'true' : 'false',
      PERF_IN_PROCESS: '1',
      PERF_TARGET_ENV: 'local',
      PERF_ENDPOINTS: process.env.PERF_ENDPOINTS || '/api/health/live,/api/system/status',
      PERF_CONCURRENCY: process.env.PERF_CONCURRENCY || '1,5,10,20',
      PERF_REQUESTS_PER_LEVEL: process.env.PERF_REQUESTS_PER_LEVEL || '50',
      PERF_WARMUP_REQUESTS: process.env.PERF_WARMUP_REQUESTS || '3',
      PERF_OUTPUT: output
    },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`Benchmark ${enabled ? 'enabled' : 'disabled'} failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(fs.readFileSync(output, 'utf8'));
}

function key(row) {
  return `${row.endpoint} c=${row.concurrent}`;
}

function compare(disabled, enabled) {
  const enabledMap = new Map((enabled.results || []).map((row) => [key(row), row]));
  return (disabled.results || []).map((base) => {
    const current = enabledMap.get(key(base)) || {};
    const p95Base = Number(base.latencyMs?.p95 || 0);
    const p95Current = Number(current.latencyMs?.p95 || 0);
    const rpsBase = Number(base.throughputRps || 0);
    const rpsCurrent = Number(current.throughputRps || 0);
    return {
      endpoint: base.endpoint,
      concurrency: base.concurrent,
      disabledP95Ms: p95Base,
      enabledP95Ms: p95Current,
      p95DeltaMs: Number((p95Current - p95Base).toFixed(2)),
      p95DeltaRatio: p95Base > 0 ? Number(((p95Current - p95Base) / p95Base).toFixed(4)) : null,
      disabledThroughputRps: rpsBase,
      enabledThroughputRps: rpsCurrent,
      throughputDeltaRatio: rpsBase > 0 ? Number(((rpsCurrent - rpsBase) / rpsBase).toFixed(4)) : null,
      heapDeltaBytes: Number(current.clientMetrics?.heapUsedDeltaBytes || 0) - Number(base.clientMetrics?.heapUsedDeltaBytes || 0),
      rssDeltaBytes: Number(current.clientMetrics?.rssDeltaBytes || 0) - Number(base.clientMetrics?.rssDeltaBytes || 0),
      eventLoopP95DeltaMs: Number(current.clientMetrics?.eventLoopLagMs?.p95 || 0) - Number(base.clientMetrics?.eventLoopLagMs?.p95 || 0),
      warning: (p95Current - p95Base > 2 && p95Base > 0 && (p95Current - p95Base) / p95Base > 0.05) ? 'OVERHEAD_WARN' : ''
    };
  });
}

function toMarkdown(report) {
  const lines = [
    '# Phase241 Telemetry Overhead Benchmark',
    '',
    `- Generated at: ${report.generatedAt}`,
    '- Evidence: LOCAL_FIXTURE_ONLY',
    '',
    '| Endpoint | Concurrency | p95 off | p95 on | Delta ms | Delta ratio | RPS off | RPS on | Warning |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---|',
    ...report.comparison.map((row) => `|${row.endpoint}|${row.concurrency}|${row.disabledP95Ms}|${row.enabledP95Ms}|${row.p95DeltaMs}|${row.p95DeltaRatio ?? ''}|${row.disabledThroughputRps}|${row.enabledThroughputRps}|${row.warning}|`),
    '',
    'This local fixture compares two in-process runs on the same machine. It is not production capacity evidence.'
  ];
  return `${lines.join('\n')}\n`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const disabled = runMode(false);
  const enabled = runMode(true);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    evidenceStatus: 'LOCAL_FIXTURE_ONLY',
    disabled,
    enabled,
    comparison: compare(disabled, enabled)
  };
  const jsonPath = path.join(OUT_DIR, 'phase241-telemetry-overhead.json');
  const mdPath = path.join(OUT_DIR, 'phase241-telemetry-overhead.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, toMarkdown(report));
  console.log(JSON.stringify({ ok: true, json: jsonPath, markdown: mdPath }, null, 2));
}

main();
