'use strict';

const ProjectionService = require('../services/analytics/ProjectionService');
const { DEFAULT_TENANT_ID } = require('../utils/tenant.util');

let timer = null;
let running = false;

async function runProjection() {
  if (running) return { skipped: true };
  running = true;
  try {
    return await ProjectionService.rebuildDaily('', {
      tenantId: process.env.PROJECTION_TENANT_ID || DEFAULT_TENANT_ID
    });
  } finally {
    running = false;
  }
}

function startReportingProjectionJob() {
  if (process.env.ENABLE_REPORTING_PROJECTION_JOB !== 'true' || timer) return { started: false };
  const intervalMs = Math.max(15 * 60 * 1000, Number(process.env.REPORTING_PROJECTION_INTERVAL_MS || 60 * 60 * 1000));
  timer = setInterval(() => runProjection().catch((error) => console.error('Reporting projection job failed:', error)), intervalMs);
  timer.unref?.();
  return { started: true, intervalMs };
}

function stopReportingProjectionJob() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { runProjection, startReportingProjectionJob, stopReportingProjectionJob };
