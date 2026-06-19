'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function request(port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method: 'GET',
      timeout: 500
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.once('timeout', () => req.destroy(new Error('request timeout')));
    req.once('error', reject);
    req.end();
  });
}

async function waitForHttp(port, requestPath, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await request(port, requestPath);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError || new Error('HTTP server did not open in time');
}

function waitForExit(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('child process did not exit after startup failure'));
    }, timeoutMs);
    timer.unref?.();
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

test('Render startup opens HTTP port before Mongo bootstrap and gates business APIs', async (t) => {
  let dependenciesAvailable = true;
  try {
    require.resolve('express');
    require.resolve('mongoose');
  } catch (error) {
    dependenciesAvailable = false;
  }
  if (!dependenciesAvailable) return t.skip('production dependencies are not installed');

  const port = await reservePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      BIND_HOST: '0.0.0.0',
      MONGO_URI: 'mongodb://127.0.0.1:27099/mkpro-startup-test',
      MONGO_SERVER_SELECTION_TIMEOUT_MS: '1200',
      STARTUP_DB_TIMEOUT_MS: '4000',
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
  t.after(() => {
    if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
  });

  const health = await waitForHttp(port, '/api/health');
  assert.equal(health.statusCode, 200);

  const businessApi = await request(port, '/api/products');
  assert.equal(businessApi.statusCode, 503);
  assert.equal(JSON.parse(businessApi.body).code, 'APP_STARTING');

  const readiness = await request(port, '/api/health/readiness');
  assert.equal(readiness.statusCode, 503);
  assert.equal(JSON.parse(readiness.body).checks.bootstrap, false);

  const exited = await waitForExit(child);
  assert.equal(exited.code, 1, output);
  assert.match(output, /HTTP server listening on http:\/\/0\.0\.0\.0:/);
  assert.match(output, /MongoDB connection error/);
  assert.ok(
    output.indexOf('HTTP server listening') < output.indexOf('MongoDB connection error'),
    output
  );
});
