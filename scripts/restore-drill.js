'use strict';

require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { validateRuntimeConfig } = require('../src/config/app.config');
const systemService = require('../src/services/systemService');
const { ensureMongoIndexes } = require('../src/services/mongoIndexService');
const ReconciliationService = require('../src/domain/reconciliation/ReconciliationService');
const { compareBackupIntegrity, buildBackupIntegrity } = require('../src/operations/backupIntegrity');
const { createLogger } = require('../src/observability/logger');

const logger = createLogger({ service: 'mk-pro-restore-drill' });

function argument(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

function databaseNameFromUri(uri) {
  try {
    return decodeURIComponent(new URL(uri).pathname.replace(/^\//, '').split('?')[0]);
  } catch (_) {
    return '';
  }
}

function assertIsolatedTarget(uri) {
  const target = String(uri || '').trim();
  const productionUri = String(process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();
  const databaseName = databaseNameFromUri(target);
  if (!target) throw new Error('Thiếu RESTORE_DRILL_MONGODB_URI');
  if (target === productionUri) throw new Error('RESTORE_DRILL_MONGODB_URI không được trùng MONGO_URI/MONGODB_URI');
  if (!/(restore|drill|staging|test|sandbox)/i.test(databaseName)) {
    throw new Error('Tên database restore phải chứa restore, drill, staging, test hoặc sandbox');
  }
  if (process.env.RESTORE_DRILL_CONFIRM !== 'ISOLATED_NON_PRODUCTION_DB') {
    throw new Error('Thiếu RESTORE_DRILL_CONFIRM=ISOLATED_NON_PRODUCTION_DB');
  }
  return databaseName;
}

async function targetDocumentCount(db) {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  let total = 0;
  for (const row of collections) total += await db.collection(row.name).estimatedDocumentCount();
  return { collectionCount: collections.length, documentCount: total };
}

async function readSmoke() {
  const MongoStore = require('../src/models');
  const checks = {};
  for (const key of ['products', 'customers', 'users', 'salesOrders', 'returnOrders', 'inventories', 'arLedgers', 'fundLedgers']) {
    checks[key] = await MongoStore[key].countDocuments({});
  }
  return checks;
}

async function main() {
  const startedAt = new Date();
  const startedMs = Date.now();
  const targetUri = String(process.env.RESTORE_DRILL_MONGODB_URI || '').trim();
  const databaseName = assertIsolatedTarget(targetUri);
  const backupFile = argument('backup') || process.env.RESTORE_DRILL_BACKUP_FILE;
  if (!backupFile) throw new Error('Thiếu --backup=<backup-file.json.gz> hoặc RESTORE_DRILL_BACKUP_FILE');
  const backupDir = argument('backup-dir') || process.env.RESTORE_DRILL_BACKUP_DIR || process.env.BACKUP_DIR;
  const outputPath = path.resolve(argument('output') || process.env.RESTORE_DRILL_OUTPUT || 'RESTORE_DRILL_RESULT.json');

  validateRuntimeConfig({
    ...process.env,
    MONGO_URI: targetUri,
    NODE_ENV: 'staging'
  }, { profile: 'worker' });

  const loaded = await systemService.loadBackupPayload(backupFile, { backupDir });
  await mongoose.connect(targetUri, { serverSelectionTimeoutMS: 10000, autoIndex: false });
  const db = mongoose.connection.db;
  const before = await targetDocumentCount(db);
  if (before.documentCount > 0 && process.env.RESTORE_DRILL_ALLOW_REPLACE !== 'true') {
    throw new Error(`Database restore không rỗng (${before.documentCount} documents). Không ghi đè khi RESTORE_DRILL_ALLOW_REPLACE chưa bật.`);
  }

  const restoreStartedMs = Date.now();
  await systemService.persistDataSnapshot(loaded.payload.data);
  const indexResults = await ensureMongoIndexes({ logger });
  const restoredData = await systemService.getDataSnapshot();
  const integrity = compareBackupIntegrity(
    loaded.payload.integrity || buildBackupIntegrity(loaded.payload.data),
    restoredData
  );
  if (!integrity.ok) {
    const error = new Error(`Restore integrity mismatch: ${integrity.mismatches.join(', ')}`);
    error.code = 'RESTORE_INTEGRITY_MISMATCH';
    throw error;
  }

  const reconciliation = await ReconciliationService.runReconciliation('all', {
    source: 'restore_drill',
    checkedBy: 'restore-drill'
  });
  const after = await targetDocumentCount(db);
  const smoke = await readSmoke();
  const finishedAt = new Date();
  const report = {
    ok: true,
    mode: 'isolated-mongodb-restore',
    targetDatabase: databaseName,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Date.now() - startedMs,
    restoreDurationMs: Date.now() - restoreStartedMs,
    rtoObservedMs: Date.now() - startedMs,
    rpoObservedMs: loaded.payload.createdAt ? Math.max(0, startedAt.getTime() - Date.parse(loaded.payload.createdAt)) : null,
    backup: loaded.verification,
    targetBefore: before,
    targetAfter: after,
    integrity: { ok: integrity.ok, technicalTotals: integrity.actual.technicalTotals },
    indexes: {
      checked: indexResults.length,
      created: indexResults.filter((row) => !row.skipped).length,
      skipped: indexResults.filter((row) => row.skipped).length
    },
    reconciliation: {
      status: reconciliation.status,
      reports: reconciliation.results || reconciliation
    },
    readSmoke: smoke,
    productionTouched: false
  };
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  logger.error({ err: error }, 'Restore drill failed');
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});
