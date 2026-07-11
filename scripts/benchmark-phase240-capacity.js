'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'reports', 'performance');
const JSON_OUT = process.env.PHASE240_BENCHMARK_JSON || path.join(OUT_DIR, 'phase240-api-benchmark.json');
const MD_OUT = process.env.PHASE240_BENCHMARK_MD || path.join(OUT_DIR, 'phase240-api-benchmark.md');

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const benchmark = path.join(ROOT, 'scripts', 'performance', 'api-benchmark.js');
  const env = {
    ...process.env,
    PERF_ENDPOINTS: process.env.PERF_ENDPOINTS || '/api/health/live,/api/health/ready,/api/system/status',
    PERF_CONCURRENCY: process.env.PERF_CONCURRENCY || (process.env.PERF_ALLOW_REMOTE === 'true' ? '1,2,5' : '1,5,10,20'),
    PERF_REQUESTS_PER_LEVEL: process.env.PERF_REQUESTS_PER_LEVEL || '30',
    PERF_WARMUP_REQUESTS: process.env.PERF_WARMUP_REQUESTS || '2',
    PERF_TIMEOUT_MS: process.env.PERF_TIMEOUT_MS || '5000',
    PERF_OUTPUT: JSON_OUT,
    PERF_MARKDOWN_OUTPUT: MD_OUT
  };

  const run = spawnSync(process.execPath, [benchmark], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.status !== 0) {
    process.exitCode = run.status || 1;
    return;
  }
  process.stderr.write(`[phase240-benchmark] wrote ${JSON_OUT} and ${MD_OUT}\n`);
}

if (require.main === module) main();
