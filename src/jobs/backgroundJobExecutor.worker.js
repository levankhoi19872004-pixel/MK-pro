'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const BackgroundJobService = require('../services/background-jobs/BackgroundJobService');
const BackgroundJobHandlers = require('../services/background-jobs/BackgroundJobHandlers');

let shuttingDown = false;
function send(message) {
  if (!process.send || !process.connected) return Promise.resolve(false);
  return new Promise((resolve) => {
    try { process.send(message, (error) => resolve(!error)); } catch (_) { resolve(false); }
  });
}
async function close() { if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {}); }
async function failAndExit(error) {
  if (shuttingDown) return;
  shuttingDown = true;
  await send({
    type: 'failed',
    error: {
      code: error?.code || 'BACKGROUND_JOB_EXECUTOR_FAILED',
      message: error?.message || String(error || 'Worker thất bại'),
      stack: error?.stack || '',
      retryable: error?.retryable !== false,
      details: error?.details || null
    }
  });
  await close();
  process.exit(1);
}
async function main() {
  const jobId = String(process.argv[2] || '').trim();
  if (!jobId) throw new Error('Thiếu background job ID');
  await connectDB();
  const job = await BackgroundJobService.getRawById(jobId);
  if (!job || !['running', 'cancel_requested'].includes(job.status)) {
    const error = new Error('Job không tồn tại hoặc không còn ở trạng thái chạy');
    error.code = 'BACKGROUND_JOB_NOT_RUNNABLE';
    error.retryable = false;
    throw error;
  }
  const output = await BackgroundJobHandlers.execute(job);
  await send({ type: 'completed', result: output?.result || {}, artifact: output?.artifact || null });
  await close();
  process.exit(0);
}
process.on('uncaughtException', failAndExit);
process.on('unhandledRejection', (reason) => failAndExit(reason instanceof Error ? reason : new Error(String(reason))));
process.on('SIGTERM', async () => { shuttingDown = true; await close(); process.exit(143); });
void main().catch(failAndExit);
