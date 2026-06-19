'use strict';

const path = require('path');
const { fork } = require('child_process');
const importSessionService = require('../services/importSessionService');
const { cleanupImportFiles } = require('../utils/importTempFileStore');

const IMPORT_JOB_TIMEOUT_MS = Number(process.env.IMPORT_JOB_TIMEOUT_MS || 120000);
const IMPORT_JOB_MAX_OLD_SPACE_MB = Number(process.env.IMPORT_JOB_MAX_OLD_SPACE_MB || 256);
const IMPORT_PREVIEW_MAX_CONCURRENCY = Math.max(1, Number(process.env.IMPORT_PREVIEW_MAX_CONCURRENCY || 2));
const IMPORT_PREVIEW_MAX_QUEUE = Math.max(1, Number(process.env.IMPORT_PREVIEW_MAX_QUEUE || 50));
const IMPORT_WORKER_LOG_LIMIT = Math.max(500, Number(process.env.IMPORT_WORKER_LOG_LIMIT || 4000));

let activeJobs = 0;
let sequence = 0;
const pendingJobs = [];

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload || {}), 'utf8').toString('base64');
}

function compactWorkerLog(chunk) {
  return String(chunk || '').replace(/\0/g, '').slice(0, IMPORT_WORKER_LOG_LIMIT);
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

  console.info('[IMPORT_PREVIEW_WORKER_START]', {
    sessionId: job.payload.sessionId,
    type: job.payload.type,
    scriptPath: workerPath,
    cwd: process.cwd(),
    files: (job.payload.files || []).map((file) => ({
      fileName: file.fileName,
      path: file.path,
      size: file.size
    }))
  });

  let child;
  try {
    child = fork(workerPath, [encodePayload(job.payload)], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      execArgv: [`--max-old-space-size=${IMPORT_JOB_MAX_OLD_SPACE_MB}`]
    });
  } catch (err) {
    activeJobs = Math.max(0, activeJobs - 1);
    setImmediate(pumpQueue);
    throw err;
  }

  job.pid = child.pid;

  let timedOut = false;
  let completionReceived = false;
  let disconnected = false;
  let finalized = false;
  let terminalScheduled = false;
  let terminalInfo = { code: null, signal: '', source: '' };
  let failurePromise = null;
  let timeoutTimer = null;
  let terminalTimer = null;
  let killGraceTimer = null;

  const recordFailure = (failure) => {
    if (failurePromise) return failurePromise;

    failurePromise = (async () => {
      await importSessionService.markFailed(job.payload.sessionId, failure, { preserveExistingDetails: true }).catch(() => {});
      await cleanupImportFiles(job.payload.files || []).catch(() => {});
    })();

    return failurePromise;
  };

  const removeListeners = () => {
    child.removeListener('message', onMessage);
    child.removeListener('error', onError);
    child.removeListener('disconnect', onDisconnect);
    child.removeListener('exit', onExit);
    child.removeListener('close', onClose);
    child.stdout?.removeListener('data', onStdout);
    child.stderr?.removeListener('data', onStderr);
  };

  const finalizeOnce = () => {
    if (finalized) return false;
    finalized = true;
    clearTimeout(timeoutTimer);
    clearTimeout(terminalTimer);
    clearTimeout(killGraceTimer);
    removeListeners();
    activeJobs = Math.max(0, activeJobs - 1);
    setImmediate(pumpQueue);
    return true;
  };

  const settleTerminal = async () => {
    if (finalized) return;

    const code = terminalInfo.code;
    const signal = terminalInfo.signal;
    const succeeded = completionReceived && code === 0 && !signal && !failurePromise && !timedOut;

    if (!succeeded) {
      await recordFailure({
        code: timedOut
          ? 'IMPORT_WORKER_TIMEOUT'
          : (signal ? 'IMPORT_WORKER_SIGNAL' : 'IMPORT_WORKER_ABNORMAL_EXIT'),
        kind: 'system',
        message: timedOut
          ? `Import vượt quá thời gian xử lý ${IMPORT_JOB_TIMEOUT_MS}ms`
          : `Import worker kết thúc bất thường (${signal || (code ?? 'unknown')})`,
        stack: '',
        source: 'parent',
        exitCode: Number.isInteger(code) ? code : null,
        signal: signal || ''
      });
    }

    finalizeOnce();
  };

  const scheduleTerminal = (source, code, signal) => {
    if (Number.isInteger(code) || code === 0) terminalInfo.code = code;
    if (signal) terminalInfo.signal = signal;
    terminalInfo.source = source;
    if (terminalScheduled) return;
    terminalScheduled = true;
    terminalTimer = setTimeout(() => {
      void settleTerminal();
    }, 25);
  };

  function onStdout(chunk) {
    const value = compactWorkerLog(chunk);
    if (value) console.info('[IMPORT_PREVIEW_WORKER_STDOUT]', value);
  }

  function onStderr(chunk) {
    const value = compactWorkerLog(chunk);
    if (value) console.error('[IMPORT_PREVIEW_WORKER_STDERR]', value);
  }

  function onMessage(message = {}) {
    console.info('[IMPORT_PREVIEW_WORKER_MESSAGE]', {
      sessionId: job.payload.sessionId,
      type: message.type || ''
    });

    if (message.type === 'failed') {
      completionReceived = false;
      void recordFailure(message.failure || {
        code: 'IMPORT_WORKER_SYSTEM_ERROR',
        kind: 'system',
        message: message.message || 'Import worker thất bại',
        stack: '',
        source: 'parent'
      });
      return;
    }

    if (message.type === 'completed' && !failurePromise) completionReceived = true;
  }

  function onError(err) {
    console.error('[IMPORT_PREVIEW_WORKER_PROCESS_ERROR]', {
      sessionId: job.payload.sessionId,
      message: err && err.message ? err.message : String(err)
    });

    void recordFailure({
      code: err?.code || 'IMPORT_WORKER_START_ERROR',
      kind: 'system',
      message: err && err.message ? err.message : 'Không khởi động được import worker',
      stack: err?.stack || '',
      source: 'parent'
    });
    scheduleTerminal('error', null, '');
  }

  function onDisconnect() {
    disconnected = true;
    console.warn('[IMPORT_PREVIEW_WORKER_DISCONNECT]', {
      sessionId: job.payload.sessionId,
      pid: child.pid
    });
  }

  function onExit(code, signal) {
    console.info('[IMPORT_PREVIEW_WORKER_EXIT]', {
      sessionId: job.payload.sessionId,
      pid: child.pid,
      exitCode: code,
      signal,
      disconnected
    });
    scheduleTerminal('exit', code, signal || '');
  }

  function onClose(code, signal) {
    console.info('[IMPORT_PREVIEW_WORKER_CLOSE]', {
      sessionId: job.payload.sessionId,
      exitCode: code,
      signal
    });
    scheduleTerminal('close', code, signal || '');
  }

  child.stdout?.on('data', onStdout);
  child.stderr?.on('data', onStderr);
  child.on('message', onMessage);
  child.once('error', onError);
  child.once('disconnect', onDisconnect);
  child.once('exit', onExit);
  child.once('close', onClose);

  timeoutTimer = setTimeout(() => {
    timedOut = true;
    void recordFailure({
      code: 'IMPORT_WORKER_TIMEOUT',
      kind: 'system',
      message: `Import vượt quá thời gian xử lý ${IMPORT_JOB_TIMEOUT_MS}ms`,
      stack: '',
      source: 'parent',
      exitCode: null,
      signal: 'SIGKILL'
    });
    child.kill('SIGKILL');
    killGraceTimer = setTimeout(() => finalizeOnce(), 1000);
  }, IMPORT_JOB_TIMEOUT_MS);

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
