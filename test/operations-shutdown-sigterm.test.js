'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const POSIX_SIGNAL_TEST_OPTIONS = process.platform === 'win32'
  ? { skip: 'Windows child.kill(SIGTERM) force-terminates the process; run this integration test on Linux/Render staging.' }
  : {};

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForLive(port, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/api/health/live', timeout: 500 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        setTimeout(poll, 50);
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => {
        if (Date.now() >= deadline) reject(new Error('liveness did not open'));
        else setTimeout(poll, 50);
      });
    };
    poll();
  });
}

function waitForOutput(getOutput, pattern, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      const output = getOutput();
      if (pattern.test(output)) return resolve(output);
      if (Date.now() >= deadline) return reject(new Error(`log pattern not observed: ${pattern}`));
      setTimeout(poll, 25);
    };
    poll();
  });
}

function waitForExit(child, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('server did not exit after SIGTERM'));
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
    child.once('error', reject);
  });
}

test('SIGTERM during Mongo connection exits cleanly without waiting for server-selection timeout', POSIX_SIGNAL_TEST_OPTIONS, async (t) => {
  const port = await reservePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      BIND_HOST: '127.0.0.1',
      MONGO_URI: 'mongodb://127.0.0.1:27099/mkpro-shutdown-test',
      JWT_SECRET: 'a'.repeat(64),
      JWT_REFRESH_SECRET: 'b'.repeat(64),
      APP_URL: 'https://erp.example.com',
      CORS_ORIGIN: 'https://erp.example.com',
      CORS_ALLOW_ALL: 'false',
      MONGO_SERVER_SELECTION_TIMEOUT_MS: '30000',
      STARTUP_DB_TIMEOUT_MS: '30000',
      GRACEFUL_SHUTDOWN_TIMEOUT_MS: '5000',
      AUTO_ENSURE_MONGO_INDEXES: 'false',
      AUTO_RECOVER_STALE_IMPORTS: 'false',
      ENABLE_RECONCILIATION_JOB: 'false',
      ENABLE_OUTBOX_WORKER: 'false',
      ENABLE_INTEGRATION_WORKER: 'false',
      ENABLE_REPORTING_PROJECTION_JOB: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });

  await waitForLive(port);
  const started = Date.now();
  child.kill('SIGTERM');
  const exited = await waitForExit(child);
  assert.equal(exited.code, 0, output);
  assert.ok(Date.now() - started < 5000, output);
  assert.match(output, /Graceful shutdown completed/);
});


test('background worker SIGTERM during Mongo connection exits cleanly', POSIX_SIGNAL_TEST_OPTIONS, async (t) => {
  const child = spawn(process.execPath, ['scripts/background-job-worker.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://127.0.0.1:27099/mkpro-worker-shutdown-test',
      MONGO_SERVER_SELECTION_TIMEOUT_MS: '30000',
      WORKER_SHUTDOWN_TIMEOUT_MS: '5000',
      BACKGROUND_JOB_CONCURRENCY: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });

  await waitForOutput(() => output, /Background worker bootstrap started/);
  const started = Date.now();
  child.kill('SIGTERM');
  const exited = await waitForExit(child);
  assert.equal(exited.code, 0, output);
  assert.ok(Date.now() - started < 5000, output);
  assert.match(output, /Background worker shutdown completed/);
});
