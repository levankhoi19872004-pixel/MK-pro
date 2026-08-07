'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TARGETS = Object.freeze([
  { id: 'bulk-commit', method: 'POST', path: '/api/new/delivery-today/adjustments/bulk-commit', metrics: ['p50Ms', 'p95Ms', 'p99Ms', 'avgDbQueries', 'maxDbQueries', 'avgMongoMs', 'avgJsMs', 'statusCounts', 'maxConcurrentObserved'] },
  { id: 'delivery-orders', method: 'GET', path: '/api/new/delivery-today/orders', metrics: ['p50Ms', 'p95Ms', 'p99Ms', 'avgDbQueries', 'avgRows', 'maxRows', 'statusCounts'] },
  { id: 'suggestions', method: 'GET', path: '/api/new/delivery-today/suggestions', metrics: ['p50Ms', 'p95Ms', 'p99Ms', 'avgDbQueries', 'avgRows', 'maxRows', 'statusCounts'] },
  { id: 'dashboard-sales-staff', method: 'GET', path: '/api/dashboard/sales-staff', metrics: ['p50Ms', 'p95Ms', 'p99Ms', 'avgDbQueries', 'avgMongoMs', 'statusCounts'] },
  { id: 'dashboard-delivery-summary', method: 'GET', path: '/api/dashboard/delivery-summary', metrics: ['p50Ms', 'p95Ms', 'p99Ms', 'avgDbQueries', 'avgMongoMs', 'statusCounts'] },
  { id: 'report-center', method: 'GET', path: '/api/reports', metrics: ['p50Ms', 'p95Ms', 'p99Ms', 'avgDbQueries', 'avgRows', 'maxRows', 'avgResponseBytes', 'statusCounts'] }
]);

function buildContract() {
  return {
    schemaVersion: 1,
    phase: 'PERF-A5',
    purpose: 'PERF-A6 canary and production evidence contract',
    instrumentation: {
      api: 'src/middlewares/apiMonitor.middleware.js',
      process: 'src/observability/performanceTelemetry.js',
      operationsReadApi: 'src/services/operationsService.js',
      limitations: [
        'Route statistics are process-local and reset on restart.',
        'Mongo explain/index stats require explicit PERF-A6 runtime capture.',
        'Do not interpret offline logical counters as physical Mongo query counts.'
      ]
    },
    targets: TARGETS,
    releaseSafety: {
      productionPerformanceStatus: 'PENDING',
      concurrencyDefault: 1,
      uniqueIndexAutoApply: false,
      featureFlagsDefaultOff: true
    }
  };
}

function main(argv = process.argv.slice(2)) {
  const arg = argv.find((item) => item.startsWith('--output='));
  const output = arg ? arg.slice('--output='.length) : '';
  const contract = buildContract();
  const json = `${JSON.stringify(contract, null, 2)}\n`;
  if (output) {
    const target = path.resolve(output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, json);
  } else {
    process.stdout.write(json);
  }
}

if (require.main === module) main();
module.exports = { TARGETS, buildContract };
