'use strict';

const ProjectionService = require('../services/analytics/ProjectionService');
const { DEFAULT_TENANT_ID } = require('../utils/tenant.util');
const { getRuntimeConfig } = require('../config/app.config');

let timer = null;
let running = false;
const state = {
  enabled: false,
  started: false,
  running: false,
  intervalMs: 0,
  lastStartedAt: null,
  lastStoppedAt: null,
  lastRunAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: ''
};

async function runProjection() {
  if (running) return { skipped: true, reason: 'ALREADY_RUNNING' };
  running = true;
  state.running = true;
  state.lastRunAt = new Date().toISOString();
  try {
    const result = await ProjectionService.rebuildDaily('', {
      tenantId: process.env.PROJECTION_TENANT_ID || DEFAULT_TENANT_ID
    });
    state.lastSuccessAt = new Date().toISOString();
    state.lastError = '';
    return result;
  } catch (error) {
    state.lastFailureAt = new Date().toISOString();
    state.lastError = String(error?.message || error).slice(0, 500);
    throw error;
  } finally {
    running = false;
    state.running = false;
  }
}

function normalizeConfig(options) {
  if (options && typeof options === 'object') {
    return {
      enabled: Boolean(options.enabled),
      intervalMs: Math.max(15 * 60 * 1000, Number(options.intervalMs || 60 * 60 * 1000))
    };
  }
  const config = getRuntimeConfig().scheduler.reportingProjection;
  return { enabled: config.enabled, intervalMs: config.intervalMs };
}

function startReportingProjectionJob(options) {
  const config = normalizeConfig(options);
  state.enabled = config.enabled;
  state.intervalMs = config.intervalMs;
  if (!config.enabled) return { started: false, reason: 'JOB_DISABLED', intervalMs: config.intervalMs };
  if (timer) return { started: true, reason: 'ALREADY_STARTED', intervalMs: state.intervalMs };
  timer = setInterval(() => runProjection().catch((error) => console.error('Reporting projection job failed:', error)), config.intervalMs);
  timer.unref?.();
  state.started = true;
  state.lastStartedAt = new Date().toISOString();
  state.lastStoppedAt = null;
  return { started: true, reason: 'STARTED', intervalMs: config.intervalMs };
}

function stopReportingProjectionJob() {
  if (timer) clearInterval(timer);
  timer = null;
  state.enabled = false;
  state.started = false;
  state.running = false;
  state.lastStoppedAt = new Date().toISOString();
  return { stopped: true };
}

function getReportingProjectionJobState() {
  return { ...state };
}

module.exports = {
  runProjection,
  startReportingProjectionJob,
  stopReportingProjectionJob,
  getReportingProjectionJobState,
  _private: { normalizeConfig }
};
