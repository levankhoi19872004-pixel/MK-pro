'use strict';

const models = require('../models');

const COLLECTION_KEYS = [
  'products',
  'customers',
  'staffs',
  'warehouses',
  'suppliers',
  'stock',
  'importOrders',
  'salesOrders',
  'masterOrders',
  'payments',
  'receipts',
  'returnOrders',
  'cashbooks',
  'bankbooks',
  'importLogs',
  'mobileLogs',
  'auditLogs',
  'promotions',
  'importTemplates',
  'roles',
  'permissions'
];

function toPlain(row) {
  if (!row) return row;
  const raw = typeof row.toObject === 'function' ? row.toObject() : row;
  if (raw._id) raw._id = String(raw._id);
  return raw;
}

async function getCounts() {
  const entries = await Promise.all(COLLECTION_KEYS.map(async (key) => {
    const Model = models[key];
    if (!Model || typeof Model.countDocuments !== 'function') return [key, 0];
    return [key, await Model.countDocuments({})];
  }));
  return Object.fromEntries(entries);
}

async function getSnapshot(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 5000), 1), 20000);
  const entries = await Promise.all(COLLECTION_KEYS.map(async (key) => {
    const Model = models[key];
    if (!Model || typeof Model.find !== 'function') return [key, []];
    const rows = await Model.find({}).limit(limit).lean();
    return [key, rows.map(toPlain)];
  }));
  return Object.fromEntries(entries);
}

async function getDataSourceStatus() {
  const mongoCounts = await getCounts();
  return {
    primaryDataSource: 'mongodb',
    jsonUsage: 'backup-migration-only',
    routeLayer: 'route/controller/service/repository',
    mongoCounts
  };
}

module.exports = {
  COLLECTION_KEYS,
  getCounts,
  getSnapshot,
  getDataSourceStatus
};
