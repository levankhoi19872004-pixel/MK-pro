'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const mongoose = require('mongoose');
const AppDataRepository = require('../repositories/appData.repository');
const settingRepository = require('../repositories/settingRepository');
const { APP_COLLECTION_KEYS } = require('../constants/collectionKeys');
const { getApiMonitorReport, resetApiMonitor } = require('../middlewares/apiMonitor.middleware');
const { withMongoTransaction } = require('../utils/transaction.util');
const { getReconciliationJobState } = require('../jobs/reconciliationJob');

const repository = new AppDataRepository(APP_COLLECTION_KEYS);
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups'));

function mongoState() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return {
    ok: mongoose.connection.readyState === 1,
    state: states[mongoose.connection.readyState] || 'unknown',
    readyState: mongoose.connection.readyState
  };
}

async function getDataSnapshot(options = {}) {
  return repository.loadAll(options);
}

async function persistDataSnapshot(data = {}, options = {}) {
  const normalized = {};
  APP_COLLECTION_KEYS.forEach((key) => {
    normalized[key] = Array.isArray(data[key]) ? data[key] : [];
  });
  await repository.replaceAll(normalized, options);
  return normalized;
}

async function getDataSourceStatus() {
  const mongoCounts = await repository.counts();
  return {
    primaryDataSource: 'mongodb',
    jsonUsage: 'backup-only',
    mongoCounts,
    mongoReadyState: mongoose.connection.readyState,
    mongoState: mongoState().state
  };
}

async function status() {
  // V45 API performance rule:
  // /api/system/status is a lightweight health/status endpoint.
  // It must not count collections or load settings, because that made this API
  // run 26+ Mongo queries every time the System screen opened.
  const mongo = mongoState();
  return {
    ok: true,
    app: 'KHO Minh Khai Pro V45',
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    env: process.env.NODE_ENV || 'development',
    legacyJsonEnabled: process.env.ENABLE_LEGACY_JSON === 'true',
    resetEnabled: process.env.ALLOW_SYSTEM_RESET === 'true',
    mongoReadyState: mongoose.connection.readyState,
    mongoState: mongo.state,
    mongoOk: mongo.ok,
    primaryDataSource: 'mongodb',
    reconciliation: getReconciliationJobState()
  };
}

function health() {
  return {
    ok: true,
    message: 'KHO Minh Khai Pro V45 server is running',
    time: new Date().toISOString()
  };
}

function dbHealth() {
  return mongoState();
}

async function getSettings() {
  return settingRepository.findAll();
}

async function getSetting(key) {
  if (!key) throw new Error('Thiếu key cấu hình');
  return settingRepository.findByKey(String(key));
}

async function saveSetting(key, value) {
  if (!key) throw new Error('Thiếu key cấu hình');
  return settingRepository.upsert(String(key), value || {});
}

async function createBackup() {
  const data = await getDataSnapshot();
  const counts = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, Array.isArray(rows) ? rows.length : 0]));
  const createdAt = new Date().toISOString();
  const payload = Buffer.from(JSON.stringify({
    format: 'mk-pro-backup-v2',
    createdAt,
    source: 'mongodb',
    counts,
    data
  }), 'utf8');
  const compressed = await gzip(payload, { level: zlib.constants.Z_BEST_SPEED });
  const sha256 = crypto.createHash('sha256').update(compressed).digest('hex');

  await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const fileName = `backup-${createdAt.replace(/[:.]/g, '-')}.json.gz`;
  const filePath = path.join(BACKUP_DIR, fileName);
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, compressed, { mode: 0o600 });
  await fs.rename(tempPath, filePath);
  await fs.writeFile(`${filePath}.sha256`, `${sha256}  ${fileName}\n`, { mode: 0o600 });

  return {
    fileName,
    ...(process.env.NODE_ENV === 'production' ? {} : { filePath }),
    counts,
    sha256,
    sizeBytes: compressed.length,
    compressed: true,
    warning: 'Cần sao chép backup sang kho lưu trữ ngoài máy chủ và kiểm thử restore định kỳ.'
  };
}

function backupDirectory(options = {}) {
  return path.resolve(options.backupDir || BACKUP_DIR);
}

function safeBackupFileName(fileName = '') {
  const value = String(fileName || '').trim();
  if (!value || path.basename(value) !== value || !/^backup-[a-zA-Z0-9T-]+\.json\.gz$/.test(value)) {
    const err = new Error('Tên file backup không hợp lệ');
    err.status = 400;
    throw err;
  }
  return value;
}

async function listBackups(options = {}) {
  const dir = backupDirectory(options);
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const files = [];
  for (const name of names.filter((item) => /^backup-[a-zA-Z0-9T-]+\.json\.gz$/.test(item))) {
    const stat = await fs.stat(path.join(dir, name));
    files.push({
      fileName: name,
      sizeBytes: stat.size,
      createdAt: stat.birthtime?.toISOString?.() || stat.mtime.toISOString(),
      modifiedAt: stat.mtime.toISOString(),
      checksumFilePresent: names.includes(`${name}.sha256`)
    });
  }
  return files.sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
}

async function verifyBackup(fileName, options = {}) {
  const safeName = safeBackupFileName(fileName);
  const dir = backupDirectory(options);
  const filePath = path.join(dir, safeName);
  const compressed = await fs.readFile(filePath);
  const actualSha256 = crypto.createHash('sha256').update(compressed).digest('hex');

  let expectedSha256 = '';
  try {
    const checksumText = await fs.readFile(`${filePath}.sha256`, 'utf8');
    expectedSha256 = String(checksumText).trim().split(/\s+/)[0] || '';
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (expectedSha256 && expectedSha256 !== actualSha256) {
    const err = new Error('Checksum backup không khớp; file có thể đã hỏng hoặc bị thay đổi');
    err.status = 422;
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse((await gunzip(compressed)).toString('utf8'));
  } catch (_) {
    const err = new Error('Backup không giải nén/đọc JSON được');
    err.status = 422;
    throw err;
  }
  if (parsed?.format !== 'mk-pro-backup-v2' || !parsed.data || typeof parsed.data !== 'object') {
    const err = new Error('Backup không đúng định dạng mk-pro-backup-v2');
    err.status = 422;
    throw err;
  }

  const missingCollections = APP_COLLECTION_KEYS.filter((key) => !Array.isArray(parsed.data[key]));
  const countMismatches = [];
  for (const key of APP_COLLECTION_KEYS) {
    if (!Array.isArray(parsed.data[key])) continue;
    const expected = Number(parsed.counts?.[key]);
    if (Number.isFinite(expected) && expected !== parsed.data[key].length) {
      countMismatches.push({ key, expected, actual: parsed.data[key].length });
    }
  }
  if (missingCollections.length || countMismatches.length) {
    const err = new Error('Backup thiếu collection hoặc count không khớp');
    err.status = 422;
    err.details = { missingCollections, countMismatches };
    throw err;
  }

  return {
    ok: true,
    fileName: safeName,
    format: parsed.format,
    createdAt: parsed.createdAt || '',
    source: parsed.source || '',
    sizeBytes: compressed.length,
    sha256: actualSha256,
    checksumVerified: Boolean(expectedSha256),
    collectionCount: APP_COLLECTION_KEYS.length,
    counts: parsed.counts || {}
  };
}

const RESET_SCOPES = {
  operational: [
    'inventories',
    'stockTransactions',
    'importOrders',
    'salesOrders',
    'masterOrders',
    'returnOrders',
    'masterReturnOrders',
    'arLedgers',
    'receipts',
    'journals',
    'fundLedgers',
    'cashbooks',
    'bankbooks',
    'debtCollections',
    'externalDebtOrders',
    'deliveryCashSubmissions',
    'expenseVouchers',
    'fundTransfers',
    'importLogs',
    'importSessions',
    'importSessionRows',
    'mobileLogs',
    'auditLogs',
    'reconciliationReports',
    'idempotencyRequests'
  ],
  catalog: [
    'products',
    'customers',
    'staffs',
    'users',
    'warehouses',
    'suppliers',
    'promotions',
    'promotionProductRules',
    'promotionGroupItems',
    'promotionGroupRules',
    'importTemplates',
    'roles',
    'permissions',
    'settings'
  ],
  all: APP_COLLECTION_KEYS
};

async function resetOperationalData({ confirm, scope = 'operational' } = {}) {
  if (process.env.ALLOW_SYSTEM_RESET !== 'true' || process.env.SYSTEM_MAINTENANCE_MODE !== 'true') {
    const err = new Error('Reset hệ thống đang bị khóa. Chỉ bật ALLOW_SYSTEM_RESET=true và SYSTEM_MAINTENANCE_MODE=true trong cửa sổ bảo trì đã sao lưu.');
    err.status = 403;
    throw err;
  }
  if (confirm !== 'RESET_MONGO_DATA') {
    const err = new Error('Thiếu mã xác nhận reset: RESET_MONGO_DATA');
    err.status = 400;
    throw err;
  }
  const resetScope = RESET_SCOPES[scope] ? scope : 'operational';
  const clearedCollections = RESET_SCOPES[resetScope].filter((key) => APP_COLLECTION_KEYS.includes(key));
  const backup = await createBackup();
  await withMongoTransaction(async (session) => {
    const currentData = await getDataSnapshot({ session });
    const nextData = { ...currentData };
    clearedCollections.forEach((key) => { nextData[key] = []; });
    await repository.replaceAll(nextData, { session });
  });
  return { ok: true, scope: resetScope, backup, clearedCollections };
}

async function getApiMonitor(options = {}) {
  return getApiMonitorReport(options);
}

async function clearApiMonitor() {
  return resetApiMonitor();
}

module.exports = {
  health,
  dbHealth,
  status,
  getDataSnapshot,
  persistDataSnapshot,
  getDataSourceStatus,
  getSettings,
  getSetting,
  saveSetting,
  createBackup,
  listBackups,
  verifyBackup,
  resetOperationalData,
  getApiMonitor,
  clearApiMonitor
};
