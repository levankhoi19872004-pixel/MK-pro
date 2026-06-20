'use strict';

const fs = require('fs/promises');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { validateRuntimeConfig } = require('../src/config/app.config');
const operationsService = require('../src/services/operationsService');

const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

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

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathname, timeout: 1000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (_) { parsed = body; }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.once('timeout', () => req.destroy(new Error('request timeout')));
    req.once('error', reject);
  });
}

async function waitForHttp(port, pathname, timeoutMs = 7000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { return await request(port, pathname); } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError || new Error('HTTP endpoint did not become available');
}

function waitForExit(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Process did not exit in time'));
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function simulateGracefulShutdownDuringDependencyFailure() {
  const port = await reservePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      BIND_HOST: '127.0.0.1',
      MONGO_URI: 'mongodb://127.0.0.1:27099/mkpro-failure-simulation',
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
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  const started = Date.now();
  const live = await waitForHttp(port, '/api/health/live');
  const ready = await request(port, '/api/health/ready');
  const business = await request(port, '/api/products');
  child.kill('SIGTERM');
  const exited = await waitForExit(child);
  const durationMs = Date.now() - started;
  return {
    ok: live.statusCode === 200 && ready.statusCode === 503 && business.statusCode === 503 && exited.code === 0,
    liveStatus: live.statusCode,
    readinessStatus: ready.statusCode,
    businessStatusWhileStarting: business.statusCode,
    exit: exited,
    durationMs,
    gracefulStartLogged: logs.includes('Graceful shutdown started'),
    gracefulCompleteLogged: logs.includes('Graceful shutdown completed'),
    mongoCredentialLeaked: /mongodb:\/\/[^\s"']+:[^\s"']+@/.test(logs)
  };
}

async function simulateWorkerShutdownDuringDependencyFailure() {
  const child = spawn(process.execPath, ['scripts/background-job-worker.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://127.0.0.1:27099/mkpro-worker-failure-simulation',
      MONGO_SERVER_SELECTION_TIMEOUT_MS: '30000',
      WORKER_SHUTDOWN_TIMEOUT_MS: '5000',
      BACKGROUND_JOB_CONCURRENCY: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  const deadline = Date.now() + 7000;
  while (!logs.includes('Background worker bootstrap started') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!logs.includes('Background worker bootstrap started')) {
    child.kill('SIGKILL');
    throw new Error('Worker bootstrap log was not observed');
  }
  const started = Date.now();
  child.kill('SIGTERM');
  const exited = await waitForExit(child);
  const durationMs = Date.now() - started;
  return {
    ok: exited.code === 0 && durationMs < 5000 && logs.includes('Background worker shutdown completed'),
    exit: exited,
    durationMs,
    shutdownCompleteLogged: logs.includes('Background worker shutdown completed'),
    mongoCredentialLeaked: /mongodb:\/\/[^\s"']+:[^\s"']+@/.test(logs)
  };
}

function simulateInvalidConfiguration() {
  let error = null;
  try {
    validateRuntimeConfig({ NODE_ENV: 'production', PORT: '-1', CORS_ORIGIN: '*' }, { profile: 'server' });
  } catch (caught) {
    error = caught;
  }
  return {
    ok: Boolean(error),
    errorName: error?.name || '',
    issueVariables: Array.isArray(error?.issues) ? error.issues.map((item) => item.variable) : []
  };
}

async function simulateUnavailableTempStorage() {
  const previous = process.env.IMPORT_TMP_DIR;
  process.env.IMPORT_TMP_DIR = '/dev/null/mkpro-unwritable';
  try {
    const result = await operationsService._private.checkTempStorage();
    return { ok: result.ok === false, detectedWritable: result.ok };
  } finally {
    if (previous === undefined) delete process.env.IMPORT_TMP_DIR;
    else process.env.IMPORT_TMP_DIR = previous;
  }
}

async function main() {
  const startedAt = new Date();
  const results = {
    mongodbUnavailableAndSigterm: await simulateGracefulShutdownDuringDependencyFailure(),
    workerMongoUnavailableAndSigterm: await simulateWorkerShutdownDuringDependencyFailure(),
    invalidEnvironment: simulateInvalidConfiguration(),
    tempStorageUnavailable: await simulateUnavailableTempStorage()
  };
  const output = {
    ok: Object.values(results).every((item) => item.ok),
    mode: 'local-isolated-failure-simulation',
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    productionTouched: false,
    results
  };
  const outputPath = path.resolve(arg('output', 'FAILURE_SIMULATION_RESULT.json'));
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
