'use strict';

const IntegrationService = require('../services/integrations/IntegrationService');

let timer = null;
let running = false;

async function drain(limit = 20) {
  if (running) return { skipped: true };
  running = true;
  let processed = 0;
  try {
    while (processed < Math.max(1, Number(limit || 20))) {
      const result = await IntegrationService.processOne();
      if (!result.id) break;
      processed += 1;
    }
    return { processed };
  } finally {
    running = false;
  }
}

function startIntegrationJob() {
  if (process.env.ENABLE_INTEGRATION_WORKER !== 'true' || timer) return { started: false };
  const intervalMs = Math.max(5000, Number(process.env.INTEGRATION_POLL_INTERVAL_MS || 30000));
  timer = setInterval(() => drain().catch((error) => console.error('Integration worker failed:', error)), intervalMs);
  timer.unref?.();
  return { started: true, intervalMs };
}

function stopIntegrationJob() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { drain, startIntegrationJob, stopIntegrationJob };
