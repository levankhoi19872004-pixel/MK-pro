'use strict';

const ReconciliationService = require('../domain/reconciliation/ReconciliationService');

let intervalTimer = null;
let startupTimer = null;
let running = false;
const state = {
  enabled: false,
  running: false,
  intervalMs: 0,
  lastStartedAt: '',
  lastFinishedAt: '',
  lastSuccessAt: '',
  lastStatus: 'never_run',
  lastError: '',
  mismatchCount: 0,
  runCount: 0,
  failureCount: 0,
  consecutiveFailures: 0
};

function intervalMs() {
  return Math.max(5 * 60 * 1000, Number(process.env.RECONCILIATION_INTERVAL_MS || 6 * 60 * 60 * 1000));
}

function startupDelayMs() {
  return Math.max(1000, Number(process.env.RECONCILIATION_START_DELAY_MS || 30_000));
}

function isEnabled() {
  return process.env.AUTO_RECONCILIATION_JOB !== 'false';
}

function getReconciliationJobState() {
  return { ...state, running };
}

async function runOnce(source = 'scheduled_job') {
  if (running) return { skipped: true, reason: 'RECONCILIATION_ALREADY_RUNNING' };

  running = true;
  state.running = true;
  state.lastStartedAt = new Date().toISOString();
  state.lastError = '';
  try {
    const result = await ReconciliationService.runReconciliation('all', {
      source,
      checkedBy: 'system'
    });
    state.runCount += 1;
    state.consecutiveFailures = 0;
    state.lastStatus = String(result?.status || 'unknown');
    state.mismatchCount = Array.isArray(result?.items) ? result.items.length : 0;
    state.lastSuccessAt = new Date().toISOString();
    return result;
  } catch (err) {
    state.runCount += 1;
    state.failureCount += 1;
    state.consecutiveFailures += 1;
    state.lastStatus = 'failed';
    state.lastError = String(err?.message || err || 'RECONCILIATION_FAILED').slice(0, 500);
    throw err;
  } finally {
    state.lastFinishedAt = new Date().toISOString();
    state.running = false;
    running = false;
  }
}

function logFailure(err) {
  console.error('[reconciliationJob] failed:', err);
}

function startReconciliationJob() {
  state.enabled = isEnabled();
  state.intervalMs = intervalMs();
  if (!state.enabled) {
    return { started: false, reason: 'AUTO_RECONCILIATION_JOB_DISABLED' };
  }

  if (intervalTimer) return { started: true, reason: 'ALREADY_STARTED', intervalMs: state.intervalMs };

  intervalTimer = setInterval(() => {
    runOnce('scheduled_job').catch(logFailure);
  }, state.intervalMs);
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

module.exports = {
  startReconciliationJob,
  stopReconciliationJob,
  runOnce,
  getReconciliationJobState,
  intervalMs,
  startupDelayMs
};
