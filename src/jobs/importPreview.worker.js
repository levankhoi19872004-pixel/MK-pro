'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { runImportPreviewJob } = require('./importExcelJob');
const { cleanupImportFiles } = require('../utils/importTempFileStore');
const importSessionService = require('../services/importSessionService');

function decodePayload(value = '') {
  return JSON.parse(Buffer.from(String(value || ''), 'base64').toString('utf8'));
}

async function closeMongo() {
  await mongoose.connection.close().catch(() => {});
}

async function main() {
  const payload = decodePayload(process.argv[2] || '');

  try {
    await connectDB();

    await runImportPreviewJob({
      sessionId: payload.sessionId,
      type: payload.type,
      files: payload.files || [],
      userName: payload.userName || '',
      importMode: payload.importMode || 'create'
    });

    await cleanupImportFiles(payload.files || []);
    await closeMongo();
    process.exit(0);
  } catch (err) {
    await importSessionService.markFailed(
      payload.sessionId,
      err && err.message ? err.message : String(err)
    ).catch(() => {});

    await cleanupImportFiles(payload.files || []).catch(() => {});
    await closeMongo();
    process.exit(1);
  }
}

main();
