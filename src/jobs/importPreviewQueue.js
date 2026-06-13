'use strict';

const path = require('path');
const { fork } = require('child_process');
const importSessionService = require('../services/importSessionService');
const { cleanupImportFiles } = require('../utils/importTempFileStore');

const IMPORT_JOB_TIMEOUT_MS = Number(process.env.IMPORT_JOB_TIMEOUT_MS || 120000);
const IMPORT_JOB_MAX_OLD_SPACE_MB = Number(process.env.IMPORT_JOB_MAX_OLD_SPACE_MB || 256);
const IMPORT_PREVIEW_MAX_CONCURRENCY = Math.max(1, Number(process.env.IMPORT_PREVIEW_MAX_CONCURRENCY || 2));
const IMPORT_PREVIEW_MAX_QUEUE = Math.max(1, Number(process.env.IMPORT_PREVIEW_MAX_QUEUE || 50));

let activeJobs = 0;
let sequence = 0;
const pendingJobs = [];

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload || {}), 'utf8').toString('base64');
}

function pumpQueue() {
  while (activeJobs < IMPORT_PREVIEW_MAX_CONCURRENCY && pendingJobs.length) {
    const job = pendingJobs.shift();
    startJob(job);
  }
}

function startJob(job) {
  const workerPath = path.join(__dirname, 'importPreview.worker.js');
  activeJobs += 1;

  let child;
  try {
    child = fork(workerPath, [encodePayload(job.payload)], {
      detached: false,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [`--max-old-space-size=${IMPORT_JOB_MAX_OLD_SPACE_MB}`]
    });
  } catch (err) {
    activeJobs = Math.max(0, activeJobs - 1);
    setImmediate(pumpQueue);
    throw err;
  }

  job.pid = child.pid;
  let timedOut = false;
  let failureRecorded = false;

  const recordFailure = async (message) => {
    if (failureRecorded) return;
    failureRecorded = true;
    await importSessionService.markFailed(job.payload.sessionId, message).catch(() => {});
    await cleanupImportFiles(job.payload.files || []).catch(() => {});
  };

  const timer = setTimeout(() => {
    timedOut = true;
    void recordFailure(`Import vượt quá thời gian xử lý ${IMPORT_JOB_TIMEOUT_MS}ms`);
    child.kill('SIGKILL');
  }, IMPORT_JOB_TIMEOUT_MS);
  let finalized = false;
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    clearTimeout(timer);
    activeJobs = Math.max(0, activeJobs - 1);
    setImmediate(pumpQueue);
  };

  child.once('exit', (code, signal) => {
    if (!timedOut && (code !== 0 || signal)) {
      void recordFailure(`Import worker kết thúc bất thường (${signal || code || 'unknown'})`);
    }
    finalize();
  });
  child.once('error', (err) => {
    void recordFailure(err && err.message ? err.message : 'Không khởi động được import worker');
    finalize();
  });

  if (child.channel && typeof child.channel.unref === 'function') child.channel.unref();
  child.unref();
}

function enqueueImportPreviewJob(payload = {}) {
  if (pendingJobs.length >= IMPORT_PREVIEW_MAX_QUEUE) {
    const err = new Error('Hàng đợi import đang đầy. Vui lòng thử lại sau.');
    err.code = 'IMPORT_PREVIEW_QUEUE_FULL';
    err.statusCode = 503;
    throw err;
  }

  const job = { id: ++sequence, payload, pid: null, queuedAt: Date.now() };
  pendingJobs.push(job);
  pumpQueue();

  return {
    queued: true,
    jobId: job.id,
    pid: job.pid,
    queuePosition: job.pid ? 0 : pendingJobs.findIndex((item) => item.id === job.id) + 1,
    activeJobs,
    maxConcurrency: IMPORT_PREVIEW_MAX_CONCURRENCY
  };
}

function getImportPreviewQueueStats() {
  return {
    activeJobs,
    queuedJobs: pendingJobs.length,
    maxConcurrency: IMPORT_PREVIEW_MAX_CONCURRENCY,
    maxQueue: IMPORT_PREVIEW_MAX_QUEUE
  };
}

module.exports = {
  enqueueImportPreviewJob,
  getImportPreviewQueueStats
};
