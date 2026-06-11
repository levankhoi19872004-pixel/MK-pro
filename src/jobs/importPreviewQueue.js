'use strict';

const path = require('path');
const { fork } = require('child_process');

const IMPORT_JOB_TIMEOUT_MS = Number(process.env.IMPORT_JOB_TIMEOUT_MS || 120000);
const IMPORT_JOB_MAX_OLD_SPACE_MB = Number(process.env.IMPORT_JOB_MAX_OLD_SPACE_MB || 256);

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload || {}), 'utf8').toString('base64');
}

function enqueueImportPreviewJob(payload = {}) {
  const workerPath = path.join(__dirname, 'importPreview.worker.js');

  const child = fork(workerPath, [encodePayload(payload)], {
    detached: false,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    execArgv: [`--max-old-space-size=${IMPORT_JOB_MAX_OLD_SPACE_MB}`]
  });

  const timer = setTimeout(() => {
    child.kill('SIGKILL');
  }, IMPORT_JOB_TIMEOUT_MS);

  child.on('exit', () => {
    clearTimeout(timer);
  });

  child.on('error', () => {
    clearTimeout(timer);
  });

  if (child.channel && typeof child.channel.unref === 'function') {
    child.channel.unref();
  }

  child.unref();

  return {
    queued: true,
    pid: child.pid
  };
}

module.exports = {
  enqueueImportPreviewJob
};
