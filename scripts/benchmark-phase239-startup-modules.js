'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RETIRED_RUNTIME_PATH = 'src/services/master-order/masterOrderPrintLegacy.impl.js';

function normalize(value) {
  return String(value || '').replace(/\\/g, '/');
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.codex', '.cache', 'logs', 'tmp', 'temp'].includes(entry.name)) return [];
      return walk(absolute);
    }
    return [absolute];
  });
}

function sourceStats() {
  const files = ['src', 'services', 'public']
    .flatMap((root) => walk(path.join(ROOT, root)))
    .filter((file) => file.endsWith('.js'));
  return {
    runtimeJsFileCount: files.length,
    sourceDeployBytes: files.reduce((sum, file) => sum + fs.statSync(file).size, 0)
  };
}

function measureRequire(label, relativeModule) {
  const beforeCount = Object.keys(require.cache).length;
  const before = process.memoryUsage();
  const started = process.hrtime.bigint();
  require(path.join(ROOT, relativeModule));
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  const after = process.memoryUsage();
  const loadedFiles = Object.keys(require.cache).map((file) => normalize(path.relative(ROOT, file)));
  return {
    label,
    requiredModule: relativeModule,
    requiredModuleCountDelta: Object.keys(require.cache).length - beforeCount,
    durationMs: Number(durationMs.toFixed(3)),
    heapUsedDeltaBytes: after.heapUsed - before.heapUsed,
    rssDeltaBytes: after.rss - before.rss,
    retiredRuntimeLoaded: loadedFiles.includes(RETIRED_RUNTIME_PATH),
    retiredRuntimePath: RETIRED_RUNTIME_PATH
  };
}

function run() {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  const stats = sourceStats();
  const masterOrderFacade = measureRequire('master-order facade require', 'src/services/master-order/masterOrderLegacy.service.js');
  return {
    measuredAt: new Date().toISOString(),
    static: stats,
    measurements: [masterOrderFacade]
  };
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(run(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`[phase239-startup] ERROR ${error.stack || error.message}\n`);
    process.exit(1);
  }
}

module.exports = { run };
