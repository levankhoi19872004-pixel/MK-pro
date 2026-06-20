'use strict';

const os = require('os');
const path = require('path');
const { fork } = require('child_process');
const BackgroundJobService = require('../services/background-jobs/BackgroundJobService');
const ArtifactStore = require('../services/background-jobs/GridFsArtifactStore');

const CONCURRENCY = Math.max(1, Number(process.env.BACKGROUND_JOB_CONCURRENCY || 2));
const POLL_MS = Math.max(250, Number(process.env.BACKGROUND_JOB_POLL_MS || 1000));
const MEMORY_MB = Math.max(128, Number(process.env.BACKGROUND_JOB_MAX_OLD_SPACE_MB || 512));
const WORKER_ID = String(process.env.BACKGROUND_WORKER_ID || `${os.hostname()}:${process.pid}`);
const active = new Map();
let stopped = false;
let cleanupAt = 0;

function executorPath() { return path.join(__dirname, 'backgroundJobExecutor.worker.js'); }

async function runClaimed(job) {
  const child = fork(executorPath(), [job.id], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    execArgv: [`--max-old-space-size=${MEMORY_MB}`],
    env: { ...process.env, BACKGROUND_EXECUTOR_JOB_ID: job.id }
  });
  const state = { job, child, settled: false, timedOut: false, cancelWatch: null, heartbeat: null, timeout: null };
  active.set(job.id, state);

  const settle = async (kind, payload = {}) => {
    if (state.settled) return;
    state.settled = true;
    clearInterval(state.heartbeat);
    clearInterval(state.cancelWatch);
    clearTimeout(state.timeout);
    active.delete(job.id);
    if (kind === 'completed') {
      await BackgroundJobService.complete(job.id, WORKER_ID, payload.result || {}, payload.artifact || null);
    } else if (kind === 'cancelled') {
      await BackgroundJobService.markCancelled(job.id, WORKER_ID, payload.message || 'Job đã hủy an toàn');
    } else {
      await BackgroundJobService.fail(job.id, WORKER_ID, payload.error || {
        code: state.timedOut ? 'BACKGROUND_JOB_TIMEOUT' : 'BACKGROUND_JOB_WORKER_EXIT',
        message: state.timedOut ? `Job vượt timeout ${job.timeoutMs}ms` : 'Executor kết thúc bất thường',
        retryable: true
      });
    }
  };

  child.stdout?.on('data', (chunk) => console.info('[BACKGROUND_EXECUTOR]', job.id, String(chunk).slice(0, 2000)));
  child.stderr?.on('data', (chunk) => console.error('[BACKGROUND_EXECUTOR_ERROR]', job.id, String(chunk).slice(0, 4000)));
  child.on('message', (message = {}) => {
    if (message.type === 'completed') void settle('completed', message);
    if (message.type === 'failed') void settle('failed', message);
  });
  child.once('error', (error) => void settle('failed', { error }));
  child.once('exit', (code, signal) => {
    if (!state.settled) void settle('failed', { error: { code: 'BACKGROUND_JOB_EXECUTOR_EXIT', message: `Executor exit ${code ?? 'null'} ${signal || ''}`, retryable: true } });
  });

  state.heartbeat = setInterval(() => {
    BackgroundJobService.heartbeat(job.id, WORKER_ID).catch((error) => console.error('[BACKGROUND_JOB_HEARTBEAT]', error));
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
    void settle('failed', { error: { code: 'BACKGROUND_JOB_TIMEOUT', message: `Job vượt timeout ${job.timeoutMs}ms`, retryable: true } });
  }, Math.max(1000, Number(job.timeoutMs || 300000)));
  state.timeout.unref?.();
}

async function tick() {
  while (!stopped && active.size < CONCURRENCY) {
    const job = await BackgroundJobService.claimNext(WORKER_ID);
    if (!job) break;
    void runClaimed(job);
  }
  if (Date.now() > cleanupAt) {
    cleanupAt = Date.now() + 60_000;
    await BackgroundJobService.deadLetterExpiredLeases(50).catch((error) => console.error('[BACKGROUND_LEASE_CLEANUP]', error));
    await BackgroundJobService.cleanupExpiredArtifacts(50).catch((error) => console.error('[BACKGROUND_ARTIFACT_CLEANUP]', error));
    await ArtifactStore.cleanupExpired(100).catch((error) => console.error('[BACKGROUND_GRIDFS_CLEANUP]', error));
  }
}

async function runLoop(options = {}) {
  const once = Boolean(options.once);
  do {
    await tick();
    if (once) {
      while (active.size) await new Promise((resolve) => setTimeout(resolve, 100));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  } while (!stopped);
}

async function stop() {
  stopped = true;
  for (const state of active.values()) state.child.kill('SIGTERM');
}

module.exports = { runLoop, stop, tick, WORKER_ID, CONCURRENCY, _private: { runClaimed } };
