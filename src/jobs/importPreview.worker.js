'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { runImportPreviewJob } = require('./importExcelJob');
const { cleanupImportFiles } = require('../utils/importTempFileStore');

let payload = {};
let currentStage = 'starting';
let shuttingDown = false;

function decodePayload(value = '') {
  return JSON.parse(Buffer.from(String(value || ''), 'base64').toString('utf8'));
}

function normalizeError(reason) {
  if (reason instanceof Error) return reason;
  if (typeof reason === 'string') return new Error(reason);

  try {
    return new Error(JSON.stringify(reason));
  } catch (err) {
    return new Error(String(reason || 'Import worker thất bại'));
  }
}

function truncate(value, maxLength = 4000) {
  const text = String(value || '');
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

function sendMessage(message) {
  return new Promise((resolve) => {
    if (!process.send || !process.connected) return resolve(false);
    process.send(message, (err) => resolve(!err));
  });
}

async function closeMongo() {
  await mongoose.connection.close().catch(() => {});
}

async function cleanupAndClose() {
  await cleanupImportFiles(payload.files || []).catch((err) => {
    console.error('[IMPORT_PREVIEW_WORKER_CLEANUP_ERROR]', err && (err.stack || err.message || err));
  });
  await closeMongo();
}

async function failAndExit(reason) {
  if (shuttingDown) return;
  shuttingDown = true;

  const err = normalizeError(reason);
  const message = err.message || String(err);
  const errorCode = err.code || 'IMPORT_WORKER_FAILED';
  const stage = err.importStage || currentStage || 'unknown';

  console.error('[IMPORT_PREVIEW_WORKER_FATAL]', {
    sessionId: payload.sessionId,
    stage,
    code: errorCode,
    message,
    stack: err.stack
  });

  await sendMessage({
    type: 'IMPORT_FAILED',
    sessionId: payload.sessionId || '',
    stage,
    code: errorCode,
    message,
    stack: truncate(err.stack)
  });

  await cleanupAndClose();
  if (process.connected) process.disconnect();
  process.exit(1);
}

async function main() {
  try {
    payload = decodePayload(process.argv[2] || '');
    currentStage = 'connecting_database';
    await sendMessage({ type: 'IMPORT_PROGRESS', sessionId: payload.sessionId || '', stage: currentStage });
    await connectDB();

    const result = await runImportPreviewJob({
      sessionId: payload.sessionId,
      type: payload.type,
      files: payload.files || [],
      userName: payload.userName || '',
      importMode: payload.importMode || 'create',
      deferFinalState: true,
      onStage(stageInfo = {}) {
        currentStage = String(stageInfo.stage || currentStage || 'processing');
        void sendMessage({
          type: 'IMPORT_PROGRESS',
          sessionId: payload.sessionId || '',
          stage: currentStage,
          percent: Number(stageInfo.percent || 0),
          fileName: stageInfo.fileName || ''
        });
      }
    });

    currentStage = 'completed';
    await cleanupAndClose();

    await sendMessage({
      type: 'IMPORT_COMPLETED',
      sessionId: payload.sessionId || '',
      stage: currentStage,
      summary: {
        total: Number(result?.total || result?.rows?.length || 0),
        valid: Number(result?.valid || 0),
        invalid: Number(result?.invalid || 0),
        totalFiles: Number(result?.totalFiles || payload.files?.length || 0)
      }
    });

    shuttingDown = true;
    if (process.connected) process.disconnect();
    process.exit(0);
  } catch (err) {
    await failAndExit(err);
  }
}

process.on('uncaughtException', (err) => {
  void failAndExit(err);
});

process.on('unhandledRejection', (reason) => {
  void failAndExit(reason);
});

void main();
