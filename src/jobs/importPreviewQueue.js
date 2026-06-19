'use strict';

const path = require('path');
const { fork } = require('child_process');
const importSessionService = require('../services/importSessionService');
const { cleanupImportFiles } = require('../utils/importTempFileStore');

const IMPORT_JOB_TIMEOUT_MS = Number(process.env.IMPORT_JOB_TIMEOUT_MS || 120000);
const IMPORT_JOB_MAX_OLD_SPACE_MB = Number(process.env.IMPORT_JOB_MAX_OLD_SPACE_MB || 256);
const IMPORT_PREVIEW_MAX_CONCURRENCY = Math.max(1, Number(process.env.IMPORT_PREVIEW_MAX_CONCURRENCY || 2));
const IMPORT_PREVIEW_MAX_QUEUE = Math.max(1, Number(process.env.IMPORT_PREVIEW_MAX_QUEUE || 50));
const IMPORT_WORKER_STDERR_LIMIT = Math.max(1024, Number(process.env.IMPORT_WORKER_STDERR_LIMIT || 16384));
const IMPORT_WORKER_EXIT_GRACE_MS = Math.max(1000, Number(process.env.IMPORT_WORKER_EXIT_GRACE_MS || 5000));

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload || {}), 'utf8').toString('base64');
}

function appendLimited(current, chunk, maxLength) {
  const next = `${current || ''}${String(chunk || '')}`;
  return next.length <= maxLength ? next : next.slice(next.length - maxLength);
}

function buildDiagnosticId(sessionId, pid) {
  return `${String(sessionId || 'import')}-${Date.now().toString(36)}-${String(pid || 'na')}`;
}

function createImportPreviewQueue(options = {}) {
  const forkProcess = options.forkProcess || fork;
  const sessionService = options.importSessionService || importSessionService;
  const cleanupFiles = options.cleanupImportFiles || cleanupImportFiles;
  const workerPath = options.workerPath || path.join(__dirname, 'importPreview.worker.js');
  const timeoutMs = Number(options.timeoutMs || IMPORT_JOB_TIMEOUT_MS);
  const maxOldSpaceMb = Number(options.maxOldSpaceMb || IMPORT_JOB_MAX_OLD_SPACE_MB);
  const maxConcurrency = Math.max(1, Number(options.maxConcurrency || IMPORT_PREVIEW_MAX_CONCURRENCY));
  const maxQueue = Math.max(1, Number(options.maxQueue || IMPORT_PREVIEW_MAX_QUEUE));
  const stderrLimit = Math.max(1024, Number(options.stderrLimit || IMPORT_WORKER_STDERR_LIMIT));
  const exitGraceMs = Math.max(100, Number(options.exitGraceMs || IMPORT_WORKER_EXIT_GRACE_MS));

  let activeJobs = 0;
  let sequence = 0;
  const pendingJobs = [];

  function pumpQueue() {
    while (activeJobs < maxConcurrency && pendingJobs.length) {
      const job = pendingJobs.shift();
      startJob(job);
    }
  }

  function startJob(job) {
    activeJobs += 1;

    let child;
    try {
      child = forkProcess(workerPath, [encodePayload(job.payload)], {
        detached: false,
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        execArgv: [`--max-old-space-size=${maxOldSpaceMb}`]
      });
    } catch (err) {
      activeJobs = Math.max(0, activeJobs - 1);
      setImmediate(pumpQueue);
      throw err;
    }

    job.pid = child.pid;
    const startedAt = Date.now();
    const diagnosticId = buildDiagnosticId(job.payload.sessionId, child.pid);
    let currentStage = 'starting';
    let stderrTail = '';
    let timedOut = false;
    let finalized = false;
    let terminalKind = '';
    let terminalPromise = null;
    let exitGraceTimer = null;

    const markStartedPromise = sessionService.markWorkerStarted?.(job.payload.sessionId, {
      workerPid: child.pid,
      diagnosticId,
      startedAt: new Date(startedAt)
    });
    if (markStartedPromise && typeof markStartedPromise.catch === 'function') {
      void markStartedPromise.catch(() => {});
    }

    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderrTail = appendLimited(stderrTail, chunk, stderrLimit);
      });
    }

    const finalize = () => {
      if (finalized) return;
      finalized = true;
      clearTimeout(timer);
      clearTimeout(exitGraceTimer);
      activeJobs = Math.max(0, activeJobs - 1);
      setImmediate(pumpQueue);
    };

    const recordFailure = async (message, details = {}) => {
      if (terminalKind === 'completed') return;
      terminalKind = 'failed';
      const durationMs = Date.now() - startedAt;
      const failureDetails = {
        stage: details.stage || currentStage || 'unknown',
        code: details.code || 'IMPORT_WORKER_FAILED',
        workerPid: child.pid,
        exitCode: details.exitCode,
        signal: details.signal || '',
        diagnosticId,
        durationMs
      };

      console.error('[IMPORT_PREVIEW_WORKER_FAILED]', {
        sessionId: job.payload.sessionId,
        message,
        ...failureDetails,
        stderr: stderrTail || undefined,
        stack: details.stack || undefined
      });

      await sessionService.markFailed(job.payload.sessionId, message, failureDetails).catch((err) => {
        console.error('[IMPORT_PREVIEW_MARK_FAILED_ERROR]', {
          sessionId: job.payload.sessionId,
          diagnosticId,
          error: err && (err.stack || err.message || err)
        });
      });
      await cleanupFiles(job.payload.files || []).catch(() => {});
    };

    const recordSuccess = async (message = {}) => {
      if (terminalKind === 'failed') return;
      terminalKind = 'completed';
      const durationMs = Date.now() - startedAt;

      try {
        const finalizedSession = await sessionService.finalizePreview(job.payload.sessionId, {
          workerPid: child.pid,
          diagnosticId,
          durationMs,
          summary: message.summary || {}
        });

        if (!finalizedSession) {
          throw new Error('Không thể chốt trạng thái preview sau khi worker hoàn tất');
        }
      } catch (err) {
        terminalKind = '';
        await recordFailure(err.message || 'Không thể chốt trạng thái import', {
          stage: 'finalizing',
          code: 'IMPORT_FINALIZE_FAILED',
          stack: err.stack
        });
      }
    };

    const beginTerminalAction = (kind, action) => {
      if (terminalPromise) return;
      terminalKind = kind;
      terminalPromise = Promise.resolve().then(action);
      clearTimeout(timer);
      exitGraceTimer = setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, exitGraceMs);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      beginTerminalAction('failed', () => recordFailure(
        `Import vượt quá thời gian xử lý ${timeoutMs}ms`,
        { stage: currentStage, code: 'IMPORT_WORKER_TIMEOUT', signal: 'SIGKILL' }
      ));
      if (!child.killed) child.kill('SIGKILL');
    }, timeoutMs);

    child.on('message', (message = {}) => {
      if (!message || typeof message !== 'object') return;

      if (message.sessionId && String(message.sessionId) !== String(job.payload.sessionId || '')) {
        console.warn('[IMPORT_PREVIEW_WORKER_SESSION_MISMATCH]', {
          expectedSessionId: job.payload.sessionId,
          receivedSessionId: message.sessionId,
          diagnosticId
        });
        return;
      }

      if (message.type === 'IMPORT_PROGRESS') {
        currentStage = String(message.stage || currentStage || 'processing');
        return;
      }

      if (message.type === 'IMPORT_COMPLETED') {
        currentStage = 'completed';
        beginTerminalAction('completed', () => recordSuccess(message));
        return;
      }

      if (message.type === 'IMPORT_FAILED') {
        currentStage = String(message.stage || currentStage || 'unknown');
        beginTerminalAction('failed', () => recordFailure(
          message.message || 'Import worker xử lý thất bại',
          {
            stage: currentStage,
            code: message.code || 'IMPORT_WORKER_FAILED',
            stack: message.stack
          }
        ));
      }
    });

    child.once('exit', async (code, signal) => {
      try {
        if (terminalPromise) await terminalPromise;

        if (!terminalKind) {
          if (!timedOut && code === 0 && !signal) {
            await recordFailure('Import worker kết thúc nhưng không gửi kết quả hoàn tất', {
              stage: currentStage,
              code: 'IMPORT_WORKER_MISSING_TERMINAL_MESSAGE',
              exitCode: code,
              signal
            });
          } else if (!timedOut) {
            await recordFailure(`Import worker kết thúc bất thường (${signal || code || 'unknown'})`, {
              stage: currentStage,
              code: 'IMPORT_WORKER_ABNORMAL_EXIT',
              exitCode: code,
              signal
            });
          }
        } else if (terminalKind === 'completed' && (code !== 0 || signal)) {
          console.warn('[IMPORT_PREVIEW_WORKER_EXIT_AFTER_COMPLETION]', {
            sessionId: job.payload.sessionId,
            diagnosticId,
            code,
            signal,
            stderr: stderrTail || undefined
          });
        }
      } finally {
        finalize();
      }
    });

    child.once('error', async (err) => {
      try {
        if (!terminalPromise) {
          terminalPromise = recordFailure(
            err && err.message ? err.message : 'Không khởi động được import worker',
            {
              stage: currentStage,
              code: 'IMPORT_WORKER_START_ERROR',
              stack: err && err.stack
            }
          );
        }
        await terminalPromise;
      } finally {
        finalize();
      }
    });

    if (child.channel && typeof child.channel.unref === 'function') child.channel.unref();
    child.unref();
  }

  function enqueueImportPreviewJob(payload = {}) {
    if (pendingJobs.length >= maxQueue) {
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
      maxConcurrency
    };
  }

  function getImportPreviewQueueStats() {
    return {
      activeJobs,
      queuedJobs: pendingJobs.length,
      maxConcurrency,
      maxQueue
    };
  }

  return {
    enqueueImportPreviewJob,
    getImportPreviewQueueStats
  };
}

const defaultQueue = createImportPreviewQueue();

module.exports = {
  enqueueImportPreviewJob: defaultQueue.enqueueImportPreviewJob,
  getImportPreviewQueueStats: defaultQueue.getImportPreviewQueueStats,
  createImportPreviewQueue
};
