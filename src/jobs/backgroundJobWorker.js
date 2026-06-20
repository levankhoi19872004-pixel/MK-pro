'use strict';

const os = require('os');
const path = require('path');
const { fork } = require('child_process');
const BackgroundJobService = require('../services/background-jobs/BackgroundJobService');
const ArtifactStore = require('../services/background-jobs/GridFsArtifactStore');
const { getRuntimeConfig } = require('../config/app.config');
const { redactText } = require('../observability/redaction');

const WORKER_CONFIG = getRuntimeConfig().worker;
const BACKGROUND_JOB_CONCURRENCY = WORKER_CONFIG.backgroundConcurrency;
const CONCURRENCY = BACKGROUND_JOB_CONCURRENCY;
const POLL_MS = WORKER_CONFIG.backgroundPollMs;
const MEMORY_MB = WORKER_CONFIG.backgroundMaxOldSpaceMb;
const WORKER_ID = WORKER_CONFIG.backgroundWorkerId || `${os.hostname()}:${process.pid}`;
const active = new Map();
let stopped = false;
let cleanupAt = 0;
let runtimeLogger = console;
let runtimeHeartbeat = null;
const counters = { completedJobs: 0, failedJobs: 0 };

function executorPath() { return path.join(__dirname, 'backgroundJobExecutor.worker.js'); }
function log(level, payload, message) {
  const method = runtimeLogger?.[level] || runtimeLogger?.info || console.log;
  method.call(runtimeLogger, payload, message);
}
function configureRuntime(options = {}) {
  runtimeLogger = options.logger || runtimeLogger;
  runtimeHeartbeat = options.heartbeat || runtimeHeartbeat;
}
async function heartbeat(patch = {}) {
  if (!runtimeHeartbeat?.beat) return;
  await runtimeHeartbeat.beat({
    status: active.size ? 'busy' : (stopped ? 'stopping' : 'ready'),
    currentJobs: active.size,
    completedJobs: counters.completedJobs,
    failedJobs: counters.failedJobs,
    ...patch
  }).catch((error) => log('warn', { err: error }, 'Background worker heartbeat failed'));
}

async function runClaimed(job) {
  const child = fork(executorPath(), [job.id], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    execArgv: [`--max-old-space-size=${MEMORY_MB}`],
    env: {
      ...process.env,
      BACKGROUND_EXECUTOR_JOB_ID: job.id,
      PARENT_REQUEST_ID: job.requestId || ''
    }
  });
  let resolveSettled;
  const settledPromise = new Promise((resolve) => { resolveSettled = resolve; });
  const state = {
    job,
    child,
    settled: false,
    timedOut: false,
    cancelWatch: null,
    heartbeat: null,
    timeout: null,
    settledPromise
  };
  active.set(job.id, state);
  await heartbeat({ status: 'busy', lastJobAt: new Date() });

  const settle = async (kind, payload = {}) => {
    if (state.settled) return state.settledPromise;
    state.settled = true;
    clearInterval(state.heartbeat);
    clearInterval(state.cancelWatch);
    clearTimeout(state.timeout);
    active.delete(job.id);
    try {
      if (kind === 'completed') {
        await BackgroundJobService.complete(job.id, WORKER_ID, payload.result || {}, payload.artifact || null);
        counters.completedJobs += 1;
        await heartbeat({ lastSuccessAt: new Date() });
      } else if (kind === 'cancelled') {
        await BackgroundJobService.markCancelled(job.id, WORKER_ID, payload.message || 'Job đã hủy an toàn');
        await heartbeat();
      } else {
        await BackgroundJobService.fail(job.id, WORKER_ID, payload.error || {
          code: state.timedOut ? 'BACKGROUND_JOB_TIMEOUT' : 'BACKGROUND_JOB_WORKER_EXIT',
          message: state.timedOut ? `Job vượt timeout ${job.timeoutMs}ms` : 'Executor kết thúc bất thường',
          retryable: true
        });
        counters.failedJobs += 1;
        await heartbeat({ lastFailureAt: new Date() });
      }
    } catch (error) {
      counters.failedJobs += 1;
      log('error', { err: error, jobId: job.id, jobType: job.type }, 'Background job settlement failed');
      await heartbeat({ lastFailureAt: new Date() });
    } finally {
      resolveSettled({ kind, jobId: job.id });
    }
    return state.settledPromise;
  };

  child.stdout?.on('data', (chunk) => log('info', {
    jobId: job.id,
    stream: 'stdout',
    output: redactText(String(chunk)).slice(0, 2000)
  }, 'Background executor output'));
  child.stderr?.on('data', (chunk) => log('warn', {
    jobId: job.id,
    stream: 'stderr',
    output: redactText(String(chunk)).slice(0, 4000)
  }, 'Background executor error output'));
  child.on('message', (message = {}) => {
    if (message.type === 'completed') void settle('completed', message);
    if (message.type === 'failed') void settle('failed', message);
  });
  child.once('error', (error) => void settle('failed', { error }));
  child.once('exit', (code, signal) => {
    if (!state.settled) {
      void settle('failed', {
        error: {
          code: 'BACKGROUND_JOB_EXECUTOR_EXIT',
          message: `Executor exit ${code ?? 'null'} ${signal || ''}`,
          retryable: true
        }
      });
    }
  });

  state.heartbeat = setInterval(() => {
    BackgroundJobService.heartbeat(job.id, WORKER_ID)
      .catch((error) => log('warn', { err: error, jobId: job.id }, 'Background job lease heartbeat failed'));
  }, Math.max(3000, Math.floor(BackgroundJobService.DEFAULT_LEASE_MS / 3)));
  state.heartbeat.unref?.();

  state.cancelWatch = setInterval(async () => {
    const current = await BackgroundJobService.getRawById(job.id).catch(() => null);
    if (current?.status === 'cancel_requested' && BackgroundJobService.CANCELLABLE_WHILE_RUNNING.has(job.type)) {
      child.kill('SIGTERM');
      await settle('cancelled', { message: 'Đã dừng executor trước khi ghi kết quả cuối' });
    }
  }, 1000);
  state.cancelWatch.unref?.();

  state.timeout = setTimeout(() => {
    state.timedOut = true;
    child.kill('SIGKILL');
    void settle('failed', {
      error: {
        code: 'BACKGROUND_JOB_TIMEOUT',
        message: `Job vượt timeout ${job.timeoutMs}ms`,
        retryable: true
      }
    });
  }, Math.max(1000, Number(job.timeoutMs || 300000)));
  state.timeout.unref?.();

  return state;
}

async function tick() {
  while (!stopped && active.size < CONCURRENCY) {
    const job = await BackgroundJobService.claimNext(WORKER_ID);
    if (!job) break;
    void runClaimed(job);
  }
  if (Date.now() > cleanupAt) {
    cleanupAt = Date.now() + 60_000;
    await BackgroundJobService.deadLetterExpiredLeases(50).catch((error) => log('warn', { err: error }, 'Background lease cleanup failed'));
    await BackgroundJobService.cleanupExpiredArtifacts(50).catch((error) => log('warn', { err: error }, 'Background artifact cleanup failed'));
    await ArtifactStore.cleanupExpired(100).catch((error) => log('warn', { err: error }, 'GridFS artifact cleanup failed'));
  }
  await heartbeat();
}

async function runLoop(options = {}) {
  const once = Boolean(options.once);
  stopped = false;
  do {
    await tick();
    if (once) {
      while (active.size) await new Promise((resolve) => setTimeout(resolve, 100));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  } while (!stopped);
}

async function stop(options = {}) {
  stopped = true;
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || getRuntimeConfig().operations.workerShutdownTimeoutMs));
  const deadline = Date.now() + timeoutMs;
  await heartbeat({ status: 'stopping' });

  while (active.size && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (active.size) {
    log('warn', { activeJobs: Array.from(active.keys()), timeoutMs }, 'Worker shutdown timeout; returning active jobs through lease-safe failure');
    for (const state of active.values()) state.child.kill('SIGTERM');
    await Promise.race([
      Promise.all(Array.from(active.values()).map((state) => state.settledPromise)),
      new Promise((resolve) => setTimeout(resolve, 2000))
    ]);
  }

  if (active.size) {
    for (const state of active.values()) state.child.kill('SIGKILL');
    await Promise.allSettled(Array.from(active.values()).map((state) => state.settledPromise));
  }
  await heartbeat({ status: 'stopping', currentJobs: 0 });
}

function getWorkerState() {
  return {
    workerId: WORKER_ID,
    concurrency: CONCURRENCY,
    stopped,
    activeJobs: Array.from(active.keys()),
    ...counters
  };
}

module.exports = {
  runLoop,
  stop,
  tick,
  configureRuntime,
  getWorkerState,
  WORKER_ID,
  CONCURRENCY,
  _private: { runClaimed, heartbeat }
};
