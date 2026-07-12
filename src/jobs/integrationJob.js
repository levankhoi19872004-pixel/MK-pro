'use strict';

const IntegrationService = require('../services/integrations/IntegrationService');
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

async function drain(limit = 20) {
  if (running) return { skipped: true, reason: 'ALREADY_RUNNING' };
  running = true;
  state.running = true;
  state.lastRunAt = new Date().toISOString();
  let processed = 0;
  try {
    while (processed < Math.max(1, Number(limit || 20))) {
      const result = await IntegrationService.processOne();
      if (!result.id) break;
      processed += 1;
    }
    state.lastSuccessAt = new Date().toISOString();
    state.lastError = '';
    return { processed };
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
      intervalMs: Math.max(5000, Number(options.intervalMs || 30000))
    };
  }
  const config = getRuntimeConfig().scheduler.integration;
  return { enabled: config.enabled, intervalMs: config.intervalMs };
}

function startIntegrationJob(options) {
  const config = normalizeConfig(options);
  state.enabled = config.enabled;
  state.intervalMs = config.intervalMs;
  if (!config.enabled) return { started: false, reason: 'JOB_DISABLED', intervalMs: config.intervalMs };
  if (timer) return { started: true, reason: 'ALREADY_STARTED', intervalMs: state.intervalMs };
  timer = setInterval(() => drain().catch((error) => console.error('Integration worker failed:', error)), config.intervalMs);
  timer.unref?.();
  state.started = true;
  state.lastStartedAt = new Date().toISOString();
  state.lastStoppedAt = null;
  return { started: true, reason: 'STARTED', intervalMs: config.intervalMs };
}

function stopIntegrationJob() {
  if (timer) clearInterval(timer);
  timer = null;
  state.enabled = false;
  state.started = false;
  state.running = false;
  state.lastStoppedAt = new Date().toISOString();
  return { stopped: true };
}

function getIntegrationJobState() {
  return { ...state };
}

module.exports = { drain, startIntegrationJob, stopIntegrationJob, getIntegrationJobState, _private: { normalizeConfig } };
