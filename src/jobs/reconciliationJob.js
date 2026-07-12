'use strict';

const JobSubmissionService = require('../services/background-jobs/JobSubmissionService');
const BackgroundJobService = require('../services/background-jobs/BackgroundJobService');
const { getRuntimeConfig } = require('../config/app.config');

let intervalTimer = null;
let startupTimer = null;
const state = {
  enabled: false,
  started: false,
  running: false,
  intervalMs: 0,
  runOnStart: false,
  startupDelayMs: 0,
  lastStartedAt: null,
  lastStoppedAt: null,
  lastRunAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastQueuedAt: '',
  lastJobId: '',
  lastError: '',
  enqueueCount: 0,
  duplicateCount: 0
};

function runtimeDefaults() {
  return getRuntimeConfig().scheduler.reconciliation;
}

function normalizeConfig(options) {
  const source = options && typeof options === 'object' ? options : runtimeDefaults();
  return {
    enabled: Boolean(source.enabled),
    runOnStart: Boolean(source.runOnStart),
    intervalMs: Math.max(5 * 60 * 1000, Number(source.intervalMs || 6 * 60 * 60 * 1000)),
    startDelayMs: Math.max(1000, Number(source.startDelayMs || 30000))
  };
}

function intervalMs(options) { return normalizeConfig(options).intervalMs; }
function startupDelayMs(options) { return normalizeConfig(options).startDelayMs; }
function getReconciliationJobState() { return { ...state, mode: 'persistent_background_queue', startupTimerScheduled: Boolean(startupTimer) }; }
function scheduleBucket(now = Date.now(), bucketIntervalMs = state.intervalMs || intervalMs()) { return Math.floor(now / bucketIntervalMs); }

async function runOnce(source = 'scheduled_job') {
  const scheduled = source === 'scheduled_job' || source === 'startup_job';
  const key = scheduled ? `reconciliation:scheduled:${scheduleBucket()}` : '';
  state.running = true;
  state.lastRunAt = new Date().toISOString();
  try {
    const submitted = await JobSubmissionService.submitReconciliation({
      type: 'all',
      source,
      checkedBy: 'system',
      idempotencyKey: key
    });
    state.lastQueuedAt = new Date().toISOString();
    state.lastJobId = submitted.job.id;
    state.lastError = '';
    state.lastSuccessAt = new Date().toISOString();
    state.enqueueCount += submitted.created ? 1 : 0;
    state.duplicateCount += submitted.created ? 0 : 1;
    return { queued: true, created: submitted.created, jobId: submitted.job.id, job: submitted.job };
  } catch (error) {
    state.lastFailureAt = new Date().toISOString();
    state.lastError = String(error?.message || error).slice(0, 500);
    throw error;
  } finally {
    state.running = false;
  }
}

function logFailure(error) { console.error('[reconciliationJob] enqueue failed:', error); }

function startReconciliationJob(options) {
  const config = normalizeConfig(options);
  state.enabled = config.enabled;
  state.intervalMs = config.intervalMs;
  state.runOnStart = config.runOnStart;
  state.startupDelayMs = config.startDelayMs;
  if (!config.enabled) return { started: false, reason: 'JOB_DISABLED', intervalMs: config.intervalMs };
  if (intervalTimer) return { started: true, reason: 'ALREADY_STARTED', intervalMs: state.intervalMs, startupRunEnabled: state.runOnStart };
  intervalTimer = setInterval(() => { runOnce('scheduled_job').catch(logFailure); }, config.intervalMs);
  intervalTimer.unref?.();
  if (config.runOnStart) {
    startupTimer = setTimeout(() => {
      startupTimer = null;
      runOnce('startup_job').catch(logFailure);
    }, config.startDelayMs);
    startupTimer.unref?.();
  }
  state.started = true;
  state.lastStartedAt = new Date().toISOString();
  state.lastStoppedAt = null;
  return {
    started: true,
    reason: 'STARTED',
    mode: 'persistent_background_queue',
    intervalMs: config.intervalMs,
    startupRunEnabled: config.runOnStart,
    startupDelayMs: config.startDelayMs
  };
}

function stopReconciliationJob() {
  if (intervalTimer) clearInterval(intervalTimer);
  if (startupTimer) clearTimeout(startupTimer);
  intervalTimer = null;
  startupTimer = null;
  state.enabled = false;
  state.started = false;
  state.running = false;
  state.lastStoppedAt = new Date().toISOString();
  return { stopped: true };
}

module.exports = {
  startReconciliationJob,
  stopReconciliationJob,
  runOnce,
  getReconciliationJobState,
  intervalMs,
  startupDelayMs,
  _private: { scheduleBucket, normalizeConfig, BackgroundJobService }
};
