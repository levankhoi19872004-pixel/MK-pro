'use strict';

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const AppDataRepository = require('../repositories/appData.repository');
const collectionRepository = require('../repositories/mongoCollection.repository');
const settingRepository = require('../repositories/settingRepository');
const { APP_COLLECTION_KEYS } = require('../constants/collectionKeys');

const repository = new AppDataRepository(APP_COLLECTION_KEYS);
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');

const RESET_CONFIRM_TEXT = 'XÁC NHẬN RESET';
const LEGACY_RESET_CONFIRM_TEXT = 'RESET_MONGO_DATA';

// Reset theo nhóm để tránh bấm nhầm làm mất danh mục sản phẩm/khách hàng/nhân viên.
const RESET_PROFILES = {
  operational: {
    label: 'Reset nghiệp vụ',
    description: 'Xóa chứng từ phát sinh: đơn bán, đơn tổng, phiếu nhập, công nợ, trả hàng, quỹ tiền, log import/mobile/audit. Giữ danh mục.',
    collections: [
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
      'stock',
      'importLogs',
      'mobileLogs',
      'auditLogs'
    ]
  },
  inventory: {
    label: 'Reset tồn kho',
    description: 'Chỉ xóa sổ tồn kho/snapshot tồn kho. Không xóa danh mục và chứng từ bán hàng.',
    collections: ['stock']
  },
  debt: {
    label: 'Reset công nợ',
    description: 'Xóa chứng từ giảm công nợ, trả hàng và sổ tiền. Không xóa đơn bán gốc.',
    collections: ['payments', 'receipts', 'returnOrders', 'masterReturnOrders', 'cashbooks', 'bankbooks', 'cashbook']
  },
  full: {
    label: 'Reset toàn bộ',
    description: 'Xóa toàn bộ dữ liệu trong các collection của phần mềm. Chỉ dùng khi muốn làm lại từ đầu.',
    collections: APP_COLLECTION_KEYS
  }
};

function uniqExistingCollections(keys = []) {
  return [...new Set(keys)].filter((key) => APP_COLLECTION_KEYS.includes(key));
}

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
    resetProfiles: Object.fromEntries(Object.entries(RESET_PROFILES).map(([key, profile]) => [key, {
      label: profile.label,
      description: profile.description,
      collections: uniqExistingCollections(profile.collections)
    }])),
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

function assertResetAllowed(confirm) {
  if (process.env.ALLOW_SYSTEM_RESET !== 'true') {
    const err = new Error('Reset hệ thống đang bị khóa. Chỉ bật bằng ALLOW_SYSTEM_RESET=true khi thật sự cần.');
    err.status = 403;
    throw err;
  }
  if (![RESET_CONFIRM_TEXT, LEGACY_RESET_CONFIRM_TEXT].includes(String(confirm || '').trim())) {
    const err = new Error(`Thiếu mã xác nhận reset: ${RESET_CONFIRM_TEXT}`);
    err.status = 400;
    throw err;
  }
}

async function resetOperationalData({ confirm, mode = 'operational', backupBeforeReset = true } = {}) {
  assertResetAllowed(confirm);

  const normalizedMode = String(mode || 'operational').trim();
  const profile = RESET_PROFILES[normalizedMode];
  if (!profile) {
    const err = new Error('Chế độ reset không hợp lệ. Chọn: operational, inventory, debt hoặc full.');
    err.status = 400;
    throw err;
  }

  const clearedCollections = uniqExistingCollections(profile.collections);
  const beforeCounts = {};
  for (const key of clearedCollections) beforeCounts[key] = await collectionRepository.count(key);

  const backup = backupBeforeReset === false ? null : await createBackup();
  const results = [];
  for (const key of clearedCollections) {
    results.push(await collectionRepository.deleteMany(key, {}));
  }

  const afterCounts = {};
  for (const key of clearedCollections) afterCounts[key] = await collectionRepository.count(key);

  return {
    ok: true,
    success: true,
    mode: normalizedMode,
    label: profile.label,
    message: `${profile.label} thành công`,
    backup,
    beforeCounts,
    afterCounts,
    clearedCollections,
    results
  };
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
