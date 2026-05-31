'use strict';

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const AppDataRepository = require('../repositories/appData.repository');
const settingRepository = require('../repositories/settingRepository');
const { APP_COLLECTION_KEYS } = require('../constants/collectionKeys');

const repository = new AppDataRepository(APP_COLLECTION_KEYS);
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');

function mongoState() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return {
    ok: mongoose.connection.readyState === 1,
    state: states[mongoose.connection.readyState] || 'unknown',
    readyState: mongoose.connection.readyState
  };
}

async function getDataSnapshot() {
  return repository.loadAll();
}

async function persistDataSnapshot(data = {}) {
  const normalized = {};
  APP_COLLECTION_KEYS.forEach((key) => {
    normalized[key] = Array.isArray(data[key]) ? data[key] : [];
  });
  await repository.replaceAll(normalized);
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
  const [dataSource, settings] = await Promise.all([
    getDataSourceStatus(),
    settingRepository.findAll()
  ]);
  return {
    ok: true,
    app: 'KHO Minh Khai Pro V45',
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    env: process.env.NODE_ENV || 'development',
    legacyJsonEnabled: process.env.ENABLE_LEGACY_JSON === 'true',
    resetEnabled: process.env.ALLOW_SYSTEM_RESET === 'true',
    dataSource,
    settingCount: settings.length
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
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);
  await fs.writeFile(filePath, JSON.stringify({ createdAt: new Date().toISOString(), source: 'mongodb', counts, data }, null, 2), 'utf8');
  return { fileName, filePath, counts };
}

const RESET_SCOPES = {
  operational: [
    'stock',
    'importOrders',
    'salesOrders',
    'masterOrders',
    'payments',
    'receipts',
    'returnOrders',
    'masterReturnOrders',
    'cashbooks',
    'bankbooks',
    'cashbook',
    'importLogs',
    'mobileLogs',
    'auditLogs'
  ],
  catalog: ['products', 'customers', 'staffs', 'warehouses', 'promotions', 'importTemplates'],
  all: APP_COLLECTION_KEYS
};

async function resetOperationalData({ confirm, scope = 'operational' } = {}) {
  if (process.env.ALLOW_SYSTEM_RESET !== 'true') {
    const err = new Error('Reset hệ thống đang bị khóa. Bật ALLOW_SYSTEM_RESET=true trên Render/.env rồi deploy lại trước khi reset.');
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
  const currentData = await getDataSnapshot();
  const nextData = { ...currentData };
  clearedCollections.forEach((key) => { nextData[key] = []; });
  await repository.replaceAll(nextData);
  return { ok: true, scope: resetScope, backup, clearedCollections };
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
  resetOperationalData
};
