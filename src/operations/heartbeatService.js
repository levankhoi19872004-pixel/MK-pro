'use strict';

const os = require('os');
const OperationalHeartbeat = require('../models/OperationalHeartbeat');
const { readReleaseManifest } = require('./releaseMetadata');
const { getRuntimeConfig } = require('../config/app.config');

function now() { return new Date(); }

function buildIdentity(options = {}) {
  const release = readReleaseManifest();
  const service = String(options.service || 'mk-pro-web');
  const role = String(options.role || 'web');
  const instanceId = String(options.instanceId || `${service}:${os.hostname()}:${process.pid}`);
  return {
    instanceId,
    service,
    role,
    version: release.version,
    releaseId: release.releaseId,
    hostname: os.hostname(),
    pid: process.pid
  };
}

async function writeHeartbeat(identity, patch = {}) {
  const timestamp = now();
  const retentionMs = getRuntimeConfig().operations.heartbeatRetentionMs;
  return OperationalHeartbeat.findOneAndUpdate(
    { instanceId: identity.instanceId },
    {
      $set: {
        ...identity,
        ...patch,
        lastHeartbeatAt: timestamp,
        expireAt: new Date(timestamp.getTime() + retentionMs)
      },
      $setOnInsert: { startedAt: timestamp }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

function createHeartbeat(options = {}) {
  const identity = buildIdentity(options);
  const config = getRuntimeConfig().operations;
  let timer = null;
  let current = {
    status: options.initialStatus || 'starting',
    currentJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    metadata: options.metadata || {}
  };

  async function beat(patch = {}) {
    current = { ...current, ...patch };
    return writeHeartbeat(identity, current);
  }

  async function start() {
    await beat();
    if (!timer) {
      timer = setInterval(() => {
        beat().catch((error) => options.logger?.warn?.({ err: error }, 'Operational heartbeat failed'));
      }, config.heartbeatIntervalMs);
      timer.unref?.();
    }
    return identity;
  }

  async function stop(status = 'stopped') {
    if (timer) clearInterval(timer);
    timer = null;
    await beat({ status, currentJobs: 0 }).catch((error) => options.logger?.warn?.({ err: error }, 'Final operational heartbeat failed'));
  }

  return { identity, start, beat, stop, snapshot: () => ({ ...identity, ...current }) };
}

async function readHeartbeats(options = {}) {
  const config = getRuntimeConfig().operations;
  const staleMs = Number(options.staleMs || config.heartbeatStaleMs);
  const cutoff = new Date(Date.now() - staleMs);
  const rows = await OperationalHeartbeat.find({}).sort({ lastHeartbeatAt: -1 }).limit(100).lean();
  return rows.map((row) => ({
    instanceId: row.instanceId,
    service: row.service,
    role: row.role,
    status: row.status,
    healthy: row.lastHeartbeatAt >= cutoff && !['failed', 'stopped'].includes(row.status),
    version: row.version,
    releaseId: row.releaseId,
    hostname: row.hostname,
    pid: row.pid,
    startedAt: row.startedAt,
    lastHeartbeatAt: row.lastHeartbeatAt,
    lastJobAt: row.lastJobAt,
    lastSuccessAt: row.lastSuccessAt,
    lastFailureAt: row.lastFailureAt,
    currentJobs: row.currentJobs || 0,
    completedJobs: row.completedJobs || 0,
    failedJobs: row.failedJobs || 0,
    metadata: row.metadata || {}
  }));
}

module.exports = { buildIdentity, writeHeartbeat, createHeartbeat, readHeartbeats };
