#!/usr/bin/env node
/*
 * Final JSON -> MongoDB migration for V45.
 *
 * Usage:
 *   node scripts/migrate-json-to-mongo-final.js
 *   npm run migrate:json
 *
 * Safe default: UPSERT by business identity, does not delete existing Mongo data.
 * Full replace mode: node scripts/migrate-json-to-mongo-final.js --replace
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MongoStore = require('../src/models');
const { isBcryptHash, hashPasswordSync } = require('../src/security/passwordPolicy');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_FILE = process.env.JSON_DATA_FILE || path.join(ROOT_DIR, 'data', 'kho-data.json');
const REPLACE_MODE = process.argv.includes('--replace');
const DRY_RUN = process.argv.includes('--dry-run');

const ROLE_LABELS = {
  admin: 'Quản trị',
  manager: 'Quản lý',
  accountant: 'Kế toán',
  sales: 'Bán hàng',
  warehouse: 'Kho',
  delivery: 'Giao hàng'
};

const COLLECTIONS = [
  { key: 'products', model: 'products', identity: ['code', 'id'] },
  { key: 'customers', model: 'customers', identity: ['code', 'phone', 'id'] },
  { key: 'staffs', model: 'staffs', identity: ['username', 'code', 'id'] },
  { key: 'roles', model: 'roles', identity: ['code', 'id'] },
  { key: 'permissions', model: 'permissions', identity: ['roleCode+module', 'id'] },
  { key: 'warehouses', model: 'warehouses', identity: ['code', 'id'] },
  { key: 'suppliers', model: 'suppliers', identity: ['code', 'phone', 'id'] },
  { key: 'stock', model: 'stock', identity: ['productCode+warehouseCode', 'productId+warehouseId', 'id'] },
  { key: 'importOrders', model: 'importOrders', identity: ['code', 'id'] },
  { key: 'salesOrders', model: 'salesOrders', identity: ['code', 'id'] },
  { key: 'masterOrders', model: 'masterOrders', identity: ['code', 'id'] },
  { key: 'payments', model: 'payments', identity: ['code', 'id'] },
  { key: 'receipts', model: 'receipts', identity: ['code', 'id'] },
  { key: 'returnOrders', model: 'returnOrders', identity: ['code', 'id'] },
  { key: 'masterReturnOrders', model: 'masterReturnOrders', identity: ['code', 'id'] },
  { key: 'cashbooks', model: 'cashbooks', identity: ['code', 'id'] },
  { key: 'bankbooks', model: 'bankbooks', identity: ['code', 'id'] },
  { key: 'importLogs', model: 'importLogs', identity: ['id', 'fileName+type'] },
  { key: 'mobileLogs', model: 'mobileLogs', identity: ['id'] },
  { key: 'auditLogs', model: 'auditLogs', identity: ['id'] },
  { key: 'promotions', model: 'promotions', identity: ['code', 'id'] },
  { key: 'importTemplates', model: 'importTemplates', identity: ['name+type', 'id'] }
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hashPassword(value) {
  return hashPasswordSync(value);
}

function createDefaultRoles() {
  return [
    { id: 'admin', code: 'admin', name: 'Admin - toàn quyền', description: 'Quản trị toàn bộ hệ thống', isActive: true },
    { id: 'accountant', code: 'accountant', name: 'Kế toán', description: 'Quản lý công nợ, phiếu thu, quỹ tiền và báo cáo', isActive: true },
    { id: 'sales', code: 'sales', name: 'Bán hàng', description: 'Tạo/sửa đơn bán và chăm sóc khách hàng được phân công', isActive: true },
    { id: 'delivery', code: 'delivery', name: 'Giao hàng', description: 'Xem đơn giao, xác nhận giao hàng, thu tiền và trả hàng trên mobile', isActive: true }
  ];
}

function createDefaultPermissions() {
  const modules = ['dashboard', 'products', 'customers', 'orders', 'imports', 'masterOrders', 'delivery', 'debts', 'cashbook', 'reports', 'users', 'promotions'];
  const matrix = {
    admin: { view: true, create: true, edit: true, delete: true, approve: true, export: true },
    accountant: { view: true, create: true, edit: true, delete: false, approve: true, export: true },
    sales: { view: true, create: true, edit: true, delete: false, approve: false, export: false },
    delivery: { view: true, create: true, edit: true, delete: false, approve: false, export: false }
  };
  const limited = {
    sales: new Set(['dashboard', 'products', 'customers', 'orders', 'delivery']),
    delivery: new Set(['dashboard', 'customers', 'delivery'])
  };

  return Object.entries(matrix).flatMap(([roleCode, base]) => modules.map((module) => {
    const allowed = !limited[roleCode] || limited[roleCode].has(module);
    return {
      id: `${roleCode}_${module}`,
      roleCode,
      module,
      ...Object.fromEntries(Object.keys(base).map((key) => [key, allowed ? base[key] : false]))
    };
  }));
}

function createDefaultStaffs() {
  // SECURITY: không tự seed tài khoản/mật khẩu mặc định.
  // Tài khoản khởi tạo phải được cung cấp qua data migration với password hợp lệ.
  return [];
}


function cleanMongoFields(row) {
  const { _id, __v, ...clean } = row || {};
  return clean;
}

function normalizeProduct(row) {
  const clean = cleanMongoFields(row);
  clean.id = clean.id || clean.code || clean.productCode || undefined;
  clean.code = String(clean.code || clean.productCode || clean.sku || '').trim();
  clean.name = String(clean.name || clean.productName || '').trim();
  clean.unit = String(clean.unit || 'Thùng').trim();
  clean.baseUnit = String(clean.baseUnit || '').trim();
  clean.conversionRate = Math.max(1, toNumber(clean.conversionRate || clean.boxSize || clean.ratio, 1));
  clean.costPrice = toNumber(clean.costPrice || clean.importPrice, 0);
  clean.salePrice = toNumber(clean.salePrice || clean.price, 0);
  clean.minStock = toNumber(clean.minStock, 0);
  clean.maxStock = toNumber(clean.maxStock, 0);
  clean.openingStock = toNumber(clean.openingStock, 0);
  clean.availableStock = toNumber(clean.availableStock, 0);
  clean.isActive = clean.isActive !== false;
  return clean;
}

function normalizeCustomer(row) {
  const clean = cleanMongoFields(row);
  clean.id = clean.id || clean.code || undefined;
  clean.code = String(clean.code || clean.customerCode || '').trim();
  clean.name = String(clean.name || clean.customerName || '').trim();
  clean.phone = String(clean.phone || '').trim();
  clean.openingDebt = toNumber(clean.openingDebt || clean.debt, 0);
  clean.debtLimit = toNumber(clean.debtLimit, 0);
  clean.isActive = clean.isActive !== false;
  return clean;
}

function normalizeStaff(row) {
  const clean = cleanMongoFields(row);
  const role = String(clean.role || 'sales').trim();
  clean.code = String(clean.code || clean.staffCode || clean.username || clean.id || '').trim();
  clean.username = String(clean.username || clean.code || '').trim();
  clean.id = String(clean.id || clean.code || clean.username || '').trim();
  clean.name = String(clean.name || clean.fullName || clean.username || clean.code || '').trim();
  clean.fullName = String(clean.fullName || clean.name || '').trim();
  clean.password = hashPassword(clean.password);
  clean.role = role;
  clean.roleLabel = clean.roleLabel || ROLE_LABELS[role] || role;
  clean.isSalesman = clean.isSalesman === true || role === 'sales';
  clean.isDelivery = clean.isDelivery === true || role === 'delivery';
  clean.isActive = clean.isActive !== false;
  return clean;
}

function normalizeGeneric(row) {
  const clean = cleanMongoFields(row);
  if (!clean.id && clean.code) clean.id = clean.code;
  return clean;
}

function normalizeByKey(key, row) {
  if (key === 'products') return normalizeProduct(row);
  if (key === 'customers') return normalizeCustomer(row);
  if (key === 'staffs') return normalizeStaff(row);
  if (key === 'roles') return { ...normalizeGeneric(row), id: row.id || row.code, isActive: row.isActive !== false };
  if (key === 'permissions') return { ...normalizeGeneric(row), id: row.id || `${row.roleCode}_${row.module}` };
  return normalizeGeneric(row);
}

function buildIdentityValue(row, pattern) {
  if (pattern.includes('+')) {
    const parts = pattern.split('+');
    const values = parts.map((field) => String(row[field] || '').trim());
    return values.every(Boolean) ? values.join('__') : '';
  }
  return String(row[pattern] || '').trim();
}

function buildMongoFilter(row, identityPatterns) {
  for (const pattern of identityPatterns) {
    if (pattern.includes('+')) {
      const parts = pattern.split('+');
      const filter = {};
      let ok = true;
      for (const field of parts) {
        if (!row[field]) ok = false;
        filter[field] = row[field];
      }
      if (ok) return filter;
      continue;
    }
    if (row[pattern]) return { [pattern]: row[pattern] };
  }
  return null;
}

function dedupeRows(key, rows, identityPatterns) {
  const result = [];
  const seen = new Set();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = normalizeByKey(key, raw || {});
    const dedupeKey = identityPatterns.map((pattern) => buildIdentityValue(row, pattern)).find(Boolean) || JSON.stringify(row);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(row);
  }
  return result;
}

function mergeAccessDefaults(data) {
  data.staffs = dedupeRows('staffs', [...(data.staffs || []), ...createDefaultStaffs()], ['username', 'code', 'id']);
  data.roles = dedupeRows('roles', [...(data.roles || []), ...createDefaultRoles()], ['code', 'id']);
  data.permissions = dedupeRows('permissions', [...(data.permissions || []), ...createDefaultPermissions()], ['roleCode+module', 'id']);
  return data;
}

function loadJsonData() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Không tìm thấy file JSON: ${DATA_FILE}`);
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const data = raw ? JSON.parse(raw) : {};

  // Chuẩn hóa alias cũ: cashbook -> cashbooks.
  if (!Array.isArray(data.cashbooks) && Array.isArray(data.cashbook)) data.cashbooks = data.cashbook;
  if (!Array.isArray(data.bankbooks)) data.bankbooks = [];
  if (!Array.isArray(data.receipts)) data.receipts = [];
  if (!Array.isArray(data.returnOrders)) data.returnOrders = [];
  if (!Array.isArray(data.masterOrders)) data.masterOrders = [];
  if (!Array.isArray(data.suppliers)) data.suppliers = [];
  if (!Array.isArray(data.mobileLogs)) data.mobileLogs = [];
  if (!Array.isArray(data.auditLogs)) data.auditLogs = [];
  if (!Array.isArray(data.promotions)) data.promotions = [];
  if (!Array.isArray(data.importTemplates)) data.importTemplates = [];

  return mergeAccessDefaults(data);
}

async function connectMongo() {
  if (!process.env.MONGO_URI) throw new Error('Thiếu MONGO_URI trong .env hoặc environment variables');
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
}

async function migrateCollection(config, data) {
  const Model = MongoStore[config.model];
  if (!Model) return { key: config.key, skipped: true, reason: `Thiếu model ${config.model}` };

  const rows = dedupeRows(config.key, data[config.key] || [], config.identity);
  if (DRY_RUN) {
    return { key: config.key, collection: Model.collection.name, mode: 'dry-run', input: rows.length, inserted: 0, updated: 0, skipped: 0 };
  }

  if (REPLACE_MODE) {
    await Model.deleteMany({});
    if (rows.length) await Model.insertMany(rows, { ordered: false });
    return { key: config.key, collection: Model.collection.name, mode: 'replace', input: rows.length, inserted: rows.length, updated: 0, skipped: 0 };
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const filter = buildMongoFilter(row, config.identity);
    if (!filter) {
      skipped += 1;
      continue;
    }
    const before = await Model.exists(filter);
    await Model.findOneAndUpdate(filter, { $set: row }, { upsert: true, new: true, setDefaultsOnInsert: true });
    if (before) updated += 1;
    else inserted += 1;
  }

  return { key: config.key, collection: Model.collection.name, mode: 'upsert', input: rows.length, inserted, updated, skipped };
}

async function writeMigrationSetting(results) {
  if (DRY_RUN || !MongoStore.settings) return;
  const counters = Object.fromEntries(results.map((item) => [item.key, item.input || 0]));
  await MongoStore.settings.findOneAndUpdate(
    { key: 'final_json_migration' },
    {
      $set: {
        key: 'final_json_migration',
        primaryDataSource: 'mongodb',
        jsonUsage: 'migrated/backup-only',
        mode: REPLACE_MODE ? 'replace' : 'upsert',
        sourceFile: DATA_FILE,
        counters,
        updatedAt: nowIso()
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function main() {
  console.log('🚚 FINAL MIGRATION: kho-data.json -> MongoDB');
  console.log(`📄 Source JSON: ${DATA_FILE}`);
  console.log(`🧭 Mode: ${DRY_RUN ? 'DRY RUN' : REPLACE_MODE ? 'REPLACE Mongo collections' : 'SAFE UPSERT'}`);

  const data = loadJsonData();
  await connectMongo();
  console.log('✅ MongoDB connected');

  const results = [];
  for (const config of COLLECTIONS) {
    const result = await migrateCollection(config, data);
    results.push(result);
    if (result.skipped && result.reason) {
      console.log(`⚠️  ${result.key}: ${result.reason}`);
    } else {
      console.log(`✅ ${result.key} -> ${result.collection}: input=${result.input}, inserted=${result.inserted}, updated=${result.updated}, skipped=${result.skipped}`);
    }
  }

  await writeMigrationSetting(results);
  console.log('🎉 Migration hoàn tất. JSON giờ chỉ nên dùng làm backup/legacy reference.');
}

main()
  .catch((error) => {
    console.error('❌ Migration failed:', error && error.stack ? error.stack : error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
