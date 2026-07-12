'use strict';

require('dotenv').config();
const { validateRuntimeConfig, getRuntimeConfig } = require('../src/config/app.config');
const connectDB = require('../src/config/db');
const { runLoop, stop: stopBackgroundWorker, configureRuntime, getWorkerState } = require('../src/jobs/backgroundJobWorker');
const { createScheduledJobOrchestrator } = require('../src/jobs/scheduledJobOrchestrator');
const { createLogger } = require('../src/observability/logger');
const { createHeartbeat } = require('../src/operations/heartbeatService');
const { internalReleaseSummary } = require('../src/operations/releaseMetadata');
const { closeMongoForShutdown } = require('../src/operations/mongoShutdown');

const logger = createLogger({ service: 'mk-pro-background-worker' });
let heartbeat = null;
let schedulerOrchestrator = null;
let shutdownPromise = null;

async function shutdown(code = 0, signal = 'completed', error = null, options = {}) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    logger[code ? 'fatal' : 'info']({ signal, err: error || undefined, worker: getWorkerState() }, 'Background worker shutdown started');
    await stopBackgroundWorker({ timeoutMs: getRuntimeConfig().operations.workerShutdownTimeoutMs });
    await schedulerOrchestrator?.stop();
    await heartbeat?.stop(code ? 'failed' : 'stopped');
    await closeMongoForShutdown(getRuntimeConfig().operations.workerShutdownTimeoutMs, logger);
    logger.info({ signal, code }, 'Background worker shutdown completed');
    if (options.exit !== false) process.exit(code);
  })();
  return shutdownPromise;
}

async function main(options = {}) {
  const runtimeConfig = validateRuntimeConfig(options.env || process.env, { profile: 'worker' });
  logger.info({ release: internalReleaseSummary() }, 'Background worker bootstrap started');
  await (options.connectDB || connectDB)();
  heartbeat = (options.createHeartbeat || createHeartbeat)({
    service: 'mk-pro-background-worker',
    role: 'worker',
    initialStatus: 'starting',
    logger,
    metadata: { concurrency: getWorkerState().concurrency }
  });
  await heartbeat.start();
  configureRuntime({ logger, heartbeat });

  schedulerOrchestrator = (options.createOrchestrator || createScheduledJobOrchestrator)({
    processRole: 'worker',
    schedulerConfig: runtimeConfig.scheduler,
    logger,
    activate: true
  });
  const schedulerSnapshot = await schedulerOrchestrator.start();
  const schedulerJobsStarted = Object.values(schedulerSnapshot.jobs || {}).filter((job) => job.started).map((job) => job.id);
  await heartbeat.beat({
    status: 'ready',
    metadata: {
      concurrency: getWorkerState().concurrency,
      schedulerOwner: schedulerSnapshot.configuredOwner,
      schedulerJobsStarted
    }
  });
  logger.info({ worker: getWorkerState(), scheduler: schedulerSnapshot, release: internalReleaseSummary() }, 'Background worker ready');
  await (options.runLoop || runLoop)({ once: options.once ?? process.argv.includes('--once') });
  if (options.autoShutdown !== false) {
    await shutdown(0, (options.once ?? process.argv.includes('--once')) ? 'once-completed' : 'loop-stopped', null, { exit: options.exit !== false });
  }
  return { runtimeConfig, schedulerSnapshot };
}

function bindSignals() {
  process.once('SIGINT', () => void shutdown(0, 'SIGINT'));
  process.once('SIGTERM', () => void shutdown(0, 'SIGTERM'));
  process.once('uncaughtException', (error) => void shutdown(1, 'uncaughtException', error));
  process.once('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    void shutdown(1, 'unhandledRejection', error);
  });
}

if (require.main === module) {
  bindSignals();
  void main().catch((error) => void shutdown(1, 'startup-failure', error));
}

module.exports = {
  main,
  shutdown,
  bindSignals,
  _private: {
    getSchedulerSnapshot: () => schedulerOrchestrator?.snapshot() || null,
    resetForTests() {
      heartbeat = null;
      schedulerOrchestrator = null;
      shutdownPromise = null;
    }
  }
};
