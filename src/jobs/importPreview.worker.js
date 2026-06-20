'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { runImportPreviewJob } = require('./importExcelJob');
const { cleanupImportFiles } = require('../utils/importTempFileStore');
const importSessionService = require('../services/importSessionService');

let activePayload = {};
let terminationPromise = null;

function decodePayload(value = '') {
  return JSON.parse(Buffer.from(String(value || ''), 'base64').toString('utf8'));
}

async function closeMongo() {
  await mongoose.connection.close().catch(() => {});
}

function classifyImportFailure(err, defaults = {}) {
  const statusCode = Number(err?.statusCode || err?.status || defaults.statusCode || 0);
  const message = err && err.message ? err.message : String(err || defaults.message || 'Import worker thất bại');
  const explicitKind = err?.importKind || defaults.kind;
  const dataMessage = /(file excel|workbook|sheet|header|dữ liệu|du lieu|dòng|dong|cột|cot|loại import|loai import)/i.test(message);
  const systemErrorName = ['ReferenceError', 'TypeError', 'SyntaxError', 'RangeError'].includes(err?.name);
  const kind = explicitKind === 'data' || (!systemErrorName && statusCode >= 400 && statusCode < 500) || (!systemErrorName && dataMessage)
    ? 'data'
    : 'system';

  return importSessionService.normalizeImportFailure({
    code: err?.code || defaults.code || (kind === 'data' ? 'IMPORT_EXCEL_DATA_ERROR' : 'IMPORT_WORKER_SYSTEM_ERROR'),
    kind,
    message,
    stack: err?.stack || defaults.stack || '',
    source: 'worker',
    exitCode: 1,
    signal: ''
  });
}

function sendParentMessage(message) {
  if (!process.send || !process.connected) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (sent) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(sent);
    };
    const timer = setTimeout(() => finish(false), 1000);

    try {
      process.send(message, (err) => finish(!err));
    } catch (_) {
      finish(false);
    }
  });
}

async function terminateWithFailure(err, defaults = {}) {
  if (terminationPromise) return terminationPromise;

  terminationPromise = (async () => {
    const failure = classifyImportFailure(err, defaults);

    if (activePayload.sessionId) {
      await importSessionService.markFailed(activePayload.sessionId, failure).catch(() => {});
    }

    await sendParentMessage({
      type: 'failed',
      sessionId: activePayload.sessionId || '',
      failure
    }).catch(() => false);

    await cleanupImportFiles(activePayload.files || []).catch(() => {});
    await closeMongo();
    process.exit(1);
  })();

  return terminationPromise;
}

async function main() {
  const payload = decodePayload(process.argv[2] || '');
  activePayload = payload;
  await connectDB();

  const result = await runImportPreviewJob({
    sessionId: payload.sessionId,
    type: payload.type,
    files: payload.files || [],
    userName: payload.userName || '',
    importMode: payload.importMode || 'create'
  });

  if (result && result.error) {
    const error = new Error(result.error);
    error.code = 'IMPORT_EXCEL_DATA_ERROR';
    error.importKind = 'data';
    error.statusCode = Number(result.status || 422);
    throw error;
  }

  await cleanupImportFiles(activePayload.files || []);
  await sendParentMessage({
    type: 'completed',
    sessionId: activePayload.sessionId || ''
  });
  await closeMongo();
  process.exit(0);
}

process.on('uncaughtException', (err) => {
  void terminateWithFailure(err);
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason || 'Unhandled rejection'));
  void terminateWithFailure(err);
});

void main().catch((err) => terminateWithFailure(err));
