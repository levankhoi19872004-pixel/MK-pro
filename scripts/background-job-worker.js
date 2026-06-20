'use strict';

require('dotenv').config();
const { validateRuntimeConfig, getRuntimeConfig } = require('../src/config/app.config');
const connectDB = require('../src/config/db');
const { runLoop, stop, configureRuntime, getWorkerState } = require('../src/jobs/backgroundJobWorker');
const { createLogger } = require('../src/observability/logger');
const { createHeartbeat } = require('../src/operations/heartbeatService');
const { internalReleaseSummary } = require('../src/operations/releaseMetadata');
const { closeMongoForShutdown } = require('../src/operations/mongoShutdown');

const logger = createLogger({ service: 'mk-pro-background-worker' });
let heartbeat = null;
let shutdownPromise = null;

async function shutdown(code = 0, signal = 'completed', error = null) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    logger[code ? 'fatal' : 'info']({ signal, err: error || undefined, worker: getWorkerState() }, 'Background worker shutdown started');
    await stop({ timeoutMs: getRuntimeConfig().operations.workerShutdownTimeoutMs });
    await heartbeat?.stop(code ? 'failed' : 'stopped');
    await closeMongoForShutdown(getRuntimeConfig().operations.workerShutdownTimeoutMs, logger);
    logger.info({ signal, code }, 'Background worker shutdown completed');
    process.exit(code);
  })();
  return shutdownPromise;
}

async function main() {
  validateRuntimeConfig(process.env, { profile: 'worker' });
  logger.info({ release: internalReleaseSummary() }, 'Background worker bootstrap started');
  await connectDB();
  heartbeat = createHeartbeat({
    service: 'mk-pro-background-worker',
    role: 'worker',
    initialStatus: 'starting',
    logger,
    metadata: { concurrency: getWorkerState().concurrency }
  });
  await heartbeat.start();
  configureRuntime({ logger, heartbeat });
  await heartbeat.beat({ status: 'ready' });
  logger.info({ worker: getWorkerState(), release: internalReleaseSummary() }, 'Background worker ready');
  await runLoop({ once: process.argv.includes('--once') });
  await shutdown(0, process.argv.includes('--once') ? 'once-completed' : 'loop-stopped');
}

process.once('SIGINT', () => void shutdown(0, 'SIGINT'));
process.once('SIGTERM', () => void shutdown(0, 'SIGTERM'));
process.once('uncaughtException', (error) => void shutdown(1, 'uncaughtException', error));
process.once('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  void shutdown(1, 'unhandledRejection', error);
});

void main().catch((error) => void shutdown(1, 'startup-failure', error));
