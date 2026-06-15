'use strict';

const SalesOrder = require('../../models/SalesOrder');
const ReturnOrder = require('../../models/ReturnOrder');
const ArLedger = require('../../models/ArLedger');
const MasterOrder = require('../../models/MasterOrder');
const User = require('../../models/User');
const SalesTarget = require('../../models/SalesTarget');

// Mặc định tắt cache để Dashboard luôn đọc Mongo mới nhất. Chỉ bật khi đặt ENV > 0.
const CACHE_TTL_MS = Math.max(0, Number(process.env.HOME_DASHBOARD_CACHE_TTL_MS || 0));
const cache = new Map();

function enabled() {
  return CACHE_TTL_MS > 0;
}

async function latestVersionForModel(model) {
  const row = await model.findOne({})
    .select({ updatedAt: 1, createdAt: 1, _id: 1 })
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .lean();
  return String(row?.updatedAt || row?.createdAt || row?._id || 'empty');
}

async function freshnessVersion() {
  if (!enabled()) return 'cache-disabled';
  const versions = await Promise.all([
    latestVersionForModel(SalesOrder),
    latestVersionForModel(ReturnOrder),
    latestVersionForModel(ArLedger),
    latestVersionForModel(MasterOrder),
    latestVersionForModel(User),
    latestVersionForModel(SalesTarget)
  ]);
  return versions.join('|');
}

function read(key, version) {
  if (!enabled()) return null;
  const current = cache.get(key);
  if (!current || current.expiresAt <= Date.now() || current.version !== version) {
    cache.delete(key);
    return null;
  }
  return current.value;
}

function write(key, version, value) {
  if (!enabled()) return;
  cache.set(key, {
    version,
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

function invalidate(period = '') {
  const normalizedPeriod = String(period || '').trim();
  if (!normalizedPeriod) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${normalizedPeriod}:`)) cache.delete(key);
  }
}

module.exports = {
  CACHE_TTL_MS,
  enabled,
  freshnessVersion,
  read,
  write,
  invalidate
};
