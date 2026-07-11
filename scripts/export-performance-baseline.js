'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.PERF_TELEMETRY_ENABLED = process.env.PERF_TELEMETRY_ENABLED || 'false';

const { internalReleaseSummary } = require('../src/operations/releaseMetadata');
const performanceTelemetry = require('../src/observability/performanceTelemetry');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'reports', 'performance');
const JSON_OUT = process.env.PERF_BASELINE_JSON || path.join(OUT_DIR, 'phase240-baseline.json');
const MD_OUT = process.env.PERF_BASELINE_MD || path.join(OUT_DIR, 'phase240-baseline.md');

function markdown(report) {
  const lines = [
    '# Phase240 Performance Baseline',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Evidence status: ${report.evidenceStatus}`,
    `- Node: ${report.runtime.nodeVersion}`,
    `- Platform: ${report.runtime.platform} ${report.runtime.arch}`,
    `- Release: ${report.release.releaseId || report.release.version || 'unknown'}`,
    '',
    '## Runtime Snapshot',
    '',
    `- RSS: ${report.snapshot.process.rssBytes}`,
    `- Heap used: ${report.snapshot.process.heapUsedBytes}`,
    `- Heap total: ${report.snapshot.process.heapTotalBytes}`,
    `- Event loop p95: ${report.snapshot.eventLoop.p95Ms}ms`,
    `- Active requests: ${report.snapshot.requests.activeRequests}`,
    `- Capacity: ${report.snapshot.capacity.status}`,
    '',
    '## Limitations',
    '',
    ...report.limitations.map((item) => `- ${item}`)
  ];
  return `${lines.join('\n')}\n`;
}

function buildReport() {
  const snapshot = performanceTelemetry.sampleNow();
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    evidenceStatus: 'BLOCKED_NO_RUNTIME_WORKLOAD',
    release: internalReleaseSummary(),
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      pid: process.pid,
      cwd: ROOT
    },
    snapshot: {
      process: snapshot.process,
      cpu: snapshot.cpu,
      eventLoop: snapshot.eventLoop,
      requests: snapshot.requests,
      capacity: snapshot.capacity
    },
    benchmark: {
      configured: false,
      status: 'BLOCKED_NO_RUNTIME_WORKLOAD',
      reason: 'Run scripts/performance/api-benchmark.js or scripts/benchmark-phase240-capacity.js against a selected target to attach benchmark results.'
    },
    limitations: [
      'This exporter captures the current process only.',
      'No production or staging workload was executed by this script.',
      'Do not use this artifact to claim production capacity.'
    ]
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = buildReport();
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(MD_OUT, markdown(report));
  process.stdout.write(`${JSON.stringify({ ok: true, json: JSON_OUT, markdown: MD_OUT }, null, 2)}\n`);
}

if (require.main === module) main();
module.exports = { buildReport, markdown };
