'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const BackgroundJob = require('../models/BackgroundJob');
const startupState = require('./startupState');
const { getApiMonitorReport } = require('../middlewares/apiMonitor.middleware');
const { readHeartbeats } = require('../operations/heartbeatService');
const { publicReleaseSummary, internalReleaseSummary } = require('../operations/releaseMetadata');
const { getRuntimeConfig, publicConfigSummary } = require('../config/app.config');
const performanceTelemetry = require('../observability/performanceTelemetry');
const performanceObservation = require('../observability/performanceObservation');
const { getActiveScheduledJobSnapshot } = require('../jobs/scheduledJobOrchestrator');

performanceObservation.setProviders({
  getApiMonitorReport,
  getReleaseSummary: internalReleaseSummary
});


function evaluateWorkerDependency(heartbeats = [], config = getRuntimeConfig(), release = internalReleaseSummary()) {
  const workers = heartbeats.filter((row) => row.role === 'worker');
  const healthyWorkers = workers.filter((row) => row.healthy === true);
  const sameReleaseWorkers = healthyWorkers.filter((row) => row.releaseId && row.releaseId === release.releaseId);
  const required = Boolean(config.scheduler.readinessRequireBackgroundWorker);
  const reconciliationRequiresExecutor = Boolean(config.scheduler.reconciliation.enabled);
  const warnings = [];
  if (reconciliationRequiresExecutor && sameReleaseWorkers.length === 0) {
    warnings.push('RECONCILIATION_EXECUTOR_UNAVAILABLE');
  }
  return {
    requiredByReadiness: required,
    healthyWorkerCount: healthyWorkers.length,
    sameReleaseWorkerCount: sameReleaseWorkers.length,
    status: required ? (sameReleaseWorkers.length > 0 ? 'READY' : 'NOT_READY') : 'ADVISORY',
    warnings
  };
}

let readinessCache = null;
let readinessCacheAt = 0;
let readinessCacheKey = '';

function withTimeout(promise, timeoutMs, code) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(code || 'Dependency timeout');
        error.code = code || 'DEPENDENCY_TIMEOUT';
        reject(error);
      }, timeoutMs);
      timer.unref?.();
    })
  ]).finally(() => clearTimeout(timer));
}

function liveness() {
  return {
    status: 'ok',
    service: 'mk-pro-web',
    timestamp: new Date().toISOString()
  };
}

async function checkTempStorage() {
  const configured = getRuntimeConfig().import.tempDir;
  const directory = path.resolve(configured || os.tmpdir());
  try {
    await fs.access(directory, fs.constants.R_OK | fs.constants.W_OK);
    return { ok: true, pathConfigured: Boolean(configured) };
  } catch (_) {
    return { ok: false, pathConfigured: Boolean(configured) };
  }
}

async function readiness(options = {}) {
  const now = Date.now();
  const startup = startupState.snapshot();
  const config = getRuntimeConfig();
  const strictWorkerReadiness = Boolean(config.scheduler.readinessRequireBackgroundWorker);
  const currentCacheKey = `${startup.phase}:${mongoose.connection.readyState}:${config.import.tempDir || ''}:${strictWorkerReadiness}`;
  if (!options.refresh && options.heartbeats === undefined && readinessCache && readinessCacheKey === currentCacheKey && now - readinessCacheAt < 1000) {
    return readinessCache;
  }
  const databaseConnected = mongoose.connection.readyState === 1;
  let databasePing = false;
  if (databaseConnected && mongoose.connection.db) {
    try {
      await withTimeout(mongoose.connection.db.admin().ping(), config.operations.readinessDependencyTimeoutMs, 'READINESS_DATABASE_TIMEOUT');
      databasePing = true;
    } catch (_) {
      databasePing = false;
    }
  }
  const storage = await checkTempStorage();
  let heartbeats = Array.isArray(options.heartbeats) ? options.heartbeats : [];
  if (strictWorkerReadiness && options.heartbeats === undefined && databaseConnected) {
    heartbeats = await readHeartbeats().catch(() => []);
  }
  const workerDependency = evaluateWorkerDependency(heartbeats, config, internalReleaseSummary());
  const checks = {
    bootstrap: startupState.isReady(),
    database: databaseConnected && databasePing,
    models: Object.keys(mongoose.models || {}).length > 0,
    tempStorage: storage.ok,
    ...(strictWorkerReadiness ? { backgroundWorker: workerDependency.status === 'READY' } : {})
  };
  const ok = Object.values(checks).every(Boolean);
  readinessCache = {
    ok,
    status: ok ? 'ready' : 'not_ready',
    service: 'mk-pro-web',
    timestamp: new Date().toISOString(),
    checks,
    workerDependency
  };
  readinessCacheAt = now;
  readinessCacheKey = currentCacheKey;
  return readinessCache;
}

async function queueSummary() {
  if (mongoose.connection.readyState !== 1) {
    return { available: false, statusCounts: {}, stuckJobs: 0, oldestPendingAt: null, latest: {} };
  }
  const now = new Date();
  const [statusRows, stuckJobs, oldestPending, latestCompleted, latestFailed] = await Promise.all([
    BackgroundJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    BackgroundJob.countDocuments({ status: 'running', leaseExpiresAt: { $lt: now } }),
    BackgroundJob.findOne({ status: 'pending' }).sort({ availableAt: 1 }).select('availableAt createdAt').lean(),
    BackgroundJob.findOne({ status: 'completed' }).sort({ finishedAt: -1 }).select('id type finishedAt').lean(),
    BackgroundJob.findOne({ status: { $in: ['failed', 'dead_letter'] } }).sort({ updatedAt: -1 }).select('id type status updatedAt lastError.code').lean()
  ]);
  return {
    available: true,
    statusCounts: Object.fromEntries(statusRows.map((row) => [row._id, row.count])),
    stuckJobs,
    oldestPendingAt: oldestPending?.availableAt || oldestPending?.createdAt || null,
    latest: {
      completed: latestCompleted || null,
      failed: latestFailed || null
    }
  };
}

function processSnapshot() {
  const memory = process.memoryUsage();
  return {
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    nodeVersion: process.version,
    memory: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external
    },
    loadAverage: os.loadavg(),
    cpuCount: os.cpus().length
  };
}

function startupBaseline() {
  const startup = startupState.snapshot();
  const started = Date.parse(startup.startedAt || '');
  const ready = Date.parse(startup.readyAt || '');
  return {
    ...startup,
    totalStartupDurationMs: Number.isFinite(started) && Number.isFinite(ready) ? Math.max(0, ready - started) : null
  };
}

async function performanceBaseline() {
  const api = getApiMonitorReport({ limit: 50 });
  const performance = performanceTelemetry.snapshot({ apiSummary: api.summary });
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    version: 'performance-baseline-v1',
    release: internalReleaseSummary(),
    window: performance.window,
    process: performance.process,
    cpu: performance.cpu,
    eventLoop: performance.eventLoop,
    requests: performance.requests,
    highWater: performance.highWater,
    capacity: performance.capacity,
    evidenceQuality: {
      status: api.summary?.totalCalls ? 'MEASURED' : 'INSUFFICIENT_DATA',
      limitations: api.summary?.totalCalls ? [] : ['API latency dimensions need runtime traffic before they become representative.']
    },
    api: {
      summary: api.summary,
      topSlowestApis: api.topSlowestApis.slice(0, 10),
      topCalledApis: api.topCalledApis.slice(0, 10),
      topQueryApis: api.topQueryTraceApis.slice(0, 10),
      topMemoryRiskApis: api.topRowsApis.slice(0, 10)
    },
    startup: startupBaseline(),
    mongo: {
      connected: mongoose.connection.readyState === 1,
      readyState: mongoose.connection.readyState,
      poolDiagnostics: {
        supported: false,
        reason: 'Mongo driver pool event aggregation is not wired in Phase240; no serverStatus command is executed.'
      }
    },
    limitations: performance.limitations
  };
}

async function startPerformanceObservation(options = {}) {
  return performanceObservation.startObservation(options);
}

async function stopPerformanceObservation() {
  return performanceObservation.stopObservation();
}

async function performanceObservationStatus() {
  return performanceObservation.getObservation();
}

async function performanceObservationExport() {
  return performanceObservation.exportObservation();
}

async function performanceOptimizationCandidates() {
  const exported = performanceObservation.exportObservation();
  return exported.data?.candidates || {
    status: 'BLOCKED_NO_PRODUCTION_EVIDENCE',
    candidates: [],
    limitations: ['No observation session has been recorded.']
  };
}

async function resetPerformanceBaseline() {
  const snapshot = performanceTelemetry.reset();
  return {
    ok: true,
    success: true,
    resetAt: new Date().toISOString(),
    data: {
      version: 'performance-baseline-reset-v1',
      activeRequests: snapshot.requests.activeRequests
    }
  };
}

async function detailedStatus() {
  const [ready, heartbeats, jobs] = await Promise.all([
    readiness({ refresh: true }),
    mongoose.connection.readyState === 1 ? readHeartbeats().catch(() => []) : Promise.resolve([]),
    queueSummary().catch((error) => ({ available: false, error: error.code || 'QUEUE_STATUS_FAILED' }))
  ]);
  const api = getApiMonitorReport({ limit: 20 });
  const scheduler = getActiveScheduledJobSnapshot();
  const workerDependency = evaluateWorkerDependency(heartbeats, getRuntimeConfig(), internalReleaseSummary());
  return {
    ok: ready.ok,
    generatedAt: new Date().toISOString(),
    release: internalReleaseSummary(),
    config: publicConfigSummary(),
    readiness: ready,
    startup: startupState.snapshot(),
    performance: performanceTelemetry.snapshot(),
    observation: performanceObservation.getObservation(),
    process: processSnapshot(),
    database: {
      connected: mongoose.connection.readyState === 1,
      readyState: mongoose.connection.readyState
    },
    api: {
      summary: api.summary,
      topSlowestApis: api.topSlowestApis.slice(0, 10),
      topCalledApis: api.topCalledApis.slice(0, 10)
    },
    scheduler,
    workerDependency,
    workers: heartbeats,
    jobs
  };
}

module.exports = {
  withTimeout,
  liveness,
  readiness,
  queueSummary,
  processSnapshot,
  detailedStatus,
  performanceBaseline,
  resetPerformanceBaseline,
  startPerformanceObservation,
  stopPerformanceObservation,
  performanceObservationStatus,
  performanceObservationExport,
  performanceOptimizationCandidates,
  publicReleaseSummary,
  internalReleaseSummary,
  _private: { checkTempStorage, evaluateWorkerDependency }
};
