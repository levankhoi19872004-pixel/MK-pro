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
  const currentCacheKey = `${startup.phase}:${mongoose.connection.readyState}:${getRuntimeConfig().import.tempDir || ''}`;
  if (!options.refresh && readinessCache && readinessCacheKey === currentCacheKey && now - readinessCacheAt < 1000) {
    return readinessCache;
  }
  const config = getRuntimeConfig();
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
  const checks = {
    bootstrap: startupState.isReady(),
    database: databaseConnected && databasePing,
    models: Object.keys(mongoose.models || {}).length > 0,
    tempStorage: storage.ok
  };
  readinessCache = {
    ok: Object.values(checks).every(Boolean),
    status: Object.values(checks).every(Boolean) ? 'ready' : 'not_ready',
    service: 'mk-pro-web',
    timestamp: new Date().toISOString(),
    checks
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

async function detailedStatus() {
  const [ready, heartbeats, jobs] = await Promise.all([
    readiness({ refresh: true }),
    mongoose.connection.readyState === 1 ? readHeartbeats().catch(() => []) : Promise.resolve([]),
    queueSummary().catch((error) => ({ available: false, error: error.code || 'QUEUE_STATUS_FAILED' }))
  ]);
  const api = getApiMonitorReport({ limit: 20 });
  return {
    ok: ready.ok,
    generatedAt: new Date().toISOString(),
    release: internalReleaseSummary(),
    config: publicConfigSummary(),
    readiness: ready,
    startup: startupState.snapshot(),
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
  publicReleaseSummary,
  internalReleaseSummary,
  _private: { checkTempStorage }
};
