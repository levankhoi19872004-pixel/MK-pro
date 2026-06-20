'use strict';

require('dotenv').config();
const { validateRuntimeConfig, getRuntimeConfig } = require('../config/app.config');
const connectDB = require('../config/db');
const BackgroundJobService = require('../services/background-jobs/BackgroundJobService');
const BackgroundJobHandlers = require('../services/background-jobs/BackgroundJobHandlers');
const { createLogger } = require('../observability/logger');
const { runWithRequestContext } = require('../observability/requestContext');
const { safeError } = require('../observability/redaction');
const { closeMongoForShutdown } = require('../operations/mongoShutdown');

const logger = createLogger({ service: 'mk-pro-background-executor' });
let shuttingDown = false;

function send(message) {
  if (!process.send || !process.connected) return Promise.resolve(false);
  return new Promise((resolve) => {
    try { process.send(message, (error) => resolve(!error)); } catch (_) { resolve(false); }
  });
}

async function close() {
  await closeMongoForShutdown(getRuntimeConfig().operations.workerShutdownTimeoutMs, logger);
}

async function failAndExit(error) {
  if (shuttingDown) return;
  shuttingDown = true;
  const serialized = safeError(error) || {};
  logger.error({ err: error, jobId: process.argv[2] || '' }, 'Background executor failed');
  await send({
    type: 'failed',
    error: {
      code: serialized.code || 'BACKGROUND_JOB_EXECUTOR_FAILED',
      message: serialized.message || 'Worker thất bại',
      stack: serialized.stack || '',
      retryable: error?.retryable !== false,
      details: serialized.details || null
    }
  });
  await close();
  process.exit(1);
}

async function main() {
  validateRuntimeConfig(process.env, { profile: 'worker' });
  const jobId = String(process.argv[2] || '').trim();
  if (!jobId) throw new Error('Thiếu background job ID');

  return runWithRequestContext({
    requestId: process.env.PARENT_REQUEST_ID,
    jobId
  }, async () => {
    await connectDB();
    const job = await BackgroundJobService.getRawById(jobId);
    if (!job || !['running', 'cancel_requested'].includes(job.status)) {
      const error = new Error('Job không tồn tại hoặc không còn ở trạng thái chạy');
      error.code = 'BACKGROUND_JOB_NOT_RUNNABLE';
      error.retryable = false;
      throw error;
    }
    logger.info({ jobId, jobType: job.type, attemptCount: job.attemptCount }, 'Background executor started');
    const output = await BackgroundJobHandlers.execute(job);
    await send({ type: 'completed', result: output?.result || {}, artifact: output?.artifact || null });
    logger.info({ jobId, jobType: job.type }, 'Background executor completed');
    await close();
    process.exit(0);
  });
}

process.once('uncaughtException', (error) => void failAndExit(error));
process.once('unhandledRejection', (reason) => void failAndExit(reason instanceof Error ? reason : new Error(String(reason))));
process.once('SIGTERM', async () => {
  shuttingDown = true;
  logger.warn({ jobId: process.argv[2] || '' }, 'Background executor received SIGTERM');
  await close();
  process.exit(143);
});
process.once('SIGINT', async () => {
  shuttingDown = true;
  logger.warn({ jobId: process.argv[2] || '' }, 'Background executor received SIGINT');
  await close();
  process.exit(130);
});

void main().catch(failAndExit);
