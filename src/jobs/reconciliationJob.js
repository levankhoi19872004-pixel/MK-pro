'use strict';

const JobSubmissionService = require('../services/background-jobs/JobSubmissionService');
const BackgroundJobService = require('../services/background-jobs/BackgroundJobService');

let intervalTimer = null;
let startupTimer = null;
const state = {
  enabled: false,
  intervalMs: 0,
  lastQueuedAt: '',
  lastJobId: '',
  lastError: '',
  enqueueCount: 0,
  duplicateCount: 0
};

function intervalMs() {
  return Math.max(5 * 60 * 1000, Number(process.env.RECONCILIATION_INTERVAL_MS || 6 * 60 * 60 * 1000));
}
function startupDelayMs() { return Math.max(1000, Number(process.env.RECONCILIATION_START_DELAY_MS || 30_000)); }
function isEnabled() { return process.env.AUTO_RECONCILIATION_JOB !== 'false'; }
function getReconciliationJobState() { return { ...state, running: false, mode: 'persistent_background_queue' }; }
function scheduleBucket(now = Date.now()) { return Math.floor(now / intervalMs()); }

async function runOnce(source = 'scheduled_job') {
  const scheduled = source === 'scheduled_job' || source === 'startup_job';
  const key = scheduled ? `reconciliation:scheduled:${scheduleBucket()}` : '';
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
    state.enqueueCount += submitted.created ? 1 : 0;
    state.duplicateCount += submitted.created ? 0 : 1;
    return { queued: true, created: submitted.created, jobId: submitted.job.id, job: submitted.job };
  } catch (error) {
    state.lastError = String(error?.message || error).slice(0, 500);
    throw error;
  }
}

function logFailure(error) { console.error('[reconciliationJob] enqueue failed:', error); }
function startReconciliationJob() {
  state.enabled = isEnabled();
  state.intervalMs = intervalMs();
  if (!state.enabled) return { started: false, reason: 'AUTO_RECONCILIATION_JOB_DISABLED' };
  if (intervalTimer) return { started: true, reason: 'ALREADY_STARTED', intervalMs: state.intervalMs };
  intervalTimer = setInterval(() => { runOnce('scheduled_job').catch(logFailure); }, state.intervalMs);
  intervalTimer.unref?.();
  if (process.env.RECONCILIATION_RUN_ON_START !== 'false') {
    startupTimer = setTimeout(() => {
      startupTimer = null;
      runOnce('startup_job').catch(logFailure);
    }, startupDelayMs());
    startupTimer.unref?.();
  }
  return {
    started: true,
    mode: 'persistent_background_queue',
    intervalMs: state.intervalMs,
    startupRunEnabled: process.env.RECONCILIATION_RUN_ON_START !== 'false',
    startupDelayMs: startupDelayMs()
  };
}
function stopReconciliationJob() {
  if (intervalTimer) clearInterval(intervalTimer);
  if (startupTimer) clearTimeout(startupTimer);
  intervalTimer = null;
  startupTimer = null;
  state.enabled = false;
  return { stopped: true };
}
module.exports = { startReconciliationJob, stopReconciliationJob, runOnce, getReconciliationJobState, intervalMs, startupDelayMs, _private: { scheduleBucket } };
