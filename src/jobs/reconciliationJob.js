'use strict';

const ReconciliationService = require('../domain/reconciliation/ReconciliationService');

let timer = null;
let running = false;

function intervalMs() {
  return Number(process.env.RECONCILIATION_INTERVAL_MS || 6 * 60 * 60 * 1000);
}

async function runOnce(source = 'scheduled_job') {
  if (running) return { skipped: true, reason: 'RECONCILIATION_ALREADY_RUNNING' };

  running = true;
  try {
    return await ReconciliationService.runReconciliation('all', {
      source,
      checkedBy: 'system'
    });
  } finally {
    running = false;
  }
}

function startReconciliationJob() {
  if (process.env.AUTO_RECONCILIATION_JOB !== 'true') {
    return { started: false, reason: 'AUTO_RECONCILIATION_JOB_DISABLED' };
  }

  if (timer) return { started: true, reason: 'ALREADY_STARTED' };

  timer = setInterval(() => {
    runOnce('scheduled_job').catch((err) => {
      console.error('[reconciliationJob] failed:', err);
    });
  }, intervalMs());

  timer.unref?.();

  return { started: true, intervalMs: intervalMs() };
}

function stopReconciliationJob() {
  if (timer) clearInterval(timer);
  timer = null;
  return { stopped: true };
}

module.exports = {
  startReconciliationJob,
  stopReconciliationJob,
  runOnce
};
