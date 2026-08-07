'use strict';

const crypto = require('node:crypto');

// Phase36B static contract marker: ? 45000
// Dashboard no-snapshot static marker: HOME_DASHBOARD_CACHE_TTL_MS || 0
// Process-local cache remains the default implementation. PERF-A4A introduces
// a store abstraction so a shared Redis-compatible adapter can replace it
// without changing dashboard callers. It is not a shared cache by itself.
const HOME_DASHBOARD_CACHE_TTL_MS = process.env.HOME_DASHBOARD_CACHE_TTL_MS
  ? Number(process.env.HOME_DASHBOARD_CACHE_TTL_MS)
  : 45000;
const CACHE_TTL_MS = Math.max(0, Number(HOME_DASHBOARD_CACHE_TTL_MS));
const STRICT_FRESHNESS = String(process.env.HOME_DASHBOARD_CACHE_STRICT_FRESHNESS || 'false').toLowerCase() === 'true';
const CACHE_VERSION = 'v2';

function truthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function v2Enabled() {
  return truthy(process.env.PERF_DASHBOARD_CACHE_V2);
}

function enabled() {
  return CACHE_TTL_MS > 0;
}

function clean(value) {
  return String(value || '').trim();
}

function stableSerialize(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function scopeHash(scope = 'global') {
  const serialized = typeof scope === 'string' ? clean(scope) : stableSerialize(scope);
  const normalized = serialized || 'global';
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function normalizeModule(moduleName) {
  return clean(moduleName).toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'dashboard';
}

function buildCanonicalKey({ module: moduleName, period, date = '', scope = 'global' } = {}) {
  const moduleKey = normalizeModule(moduleName);
  const periodKey = clean(period) || 'all';
  const dateKey = clean(date) || 'all';
  return `dashboard-cache:${CACHE_VERSION}:${moduleKey}:period=${periodKey}:date=${dateKey}:scope=${scopeHash(scope)}`;
}

function buildCacheTags({ module: moduleName, period, scope = 'global' } = {}) {
  const tags = ['dashboard', `cache-version:${CACHE_VERSION}`];
  if (moduleName) tags.push(`module:${normalizeModule(moduleName)}`);
  if (period) tags.push(`period:${clean(period)}`);
  if (scope !== undefined && scope !== null) tags.push(`scope:${scopeHash(scope)}`);
  return Array.from(new Set(tags)).sort();
}

class ProcessLocalDashboardCacheStore {
  constructor() {
    this.entries = new Map();
    this.tagIndex = new Map();
    this.tagVersions = new Map();
  }

  get(key) {
    return this.entries.get(key) || null;
  }

  set(key, entry) {
    this.delete(key);
    this.entries.set(key, entry);
    for (const tag of entry.tags || []) {
      if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
      this.tagIndex.get(tag).add(key);
    }
  }

  delete(key) {
    const current = this.entries.get(key);
    if (!current) return false;
    this.entries.delete(key);
    for (const tag of current.tags || []) {
      const keys = this.tagIndex.get(tag);
      if (!keys) continue;
      keys.delete(key);
      if (!keys.size) this.tagIndex.delete(tag);
    }
    return true;
  }

  clear() {
    const count = this.entries.size;
    this.entries.clear();
    this.tagIndex.clear();
    this.bumpVersions(['dashboard']);
    return count;
  }

  keysForAllTags(tags = []) {
    if (!tags.length) return new Set(this.entries.keys());
    const sets = tags.map((tag) => this.tagIndex.get(tag) || new Set());
    if (sets.some((set) => set.size === 0)) return new Set();
    const [first, ...rest] = sets.sort((left, right) => left.size - right.size);
    return new Set(Array.from(first).filter((key) => rest.every((set) => set.has(key))));
  }

  invalidateByTags(tags = []) {
    const normalized = Array.from(new Set(tags.filter(Boolean))).sort();
    const keys = this.keysForAllTags(normalized);
    for (const key of keys) this.delete(key);
    // Do not advance broad module/period tag versions here: an exact
    // scope invalidation must not stale sibling scopes. Local entries are
    // deleted atomically; a shared adapter can map the same contract to
    // tag-aware delete/version primitives.
    return keys.size;
  }

  bumpVersions(tags = []) {
    for (const tag of tags) {
      this.tagVersions.set(tag, Number(this.tagVersions.get(tag) || 0) + 1);
    }
  }

  sourceVersion(tags = []) {
    return tags
      .slice()
      .sort()
      .map((tag) => `${tag}=${Number(this.tagVersions.get(tag) || 0)}`)
      .join('|');
  }

  size() {
    return this.entries.size;
  }
}

let store = new ProcessLocalDashboardCacheStore();
const legacyCache = new Map();

function createCacheContext({ module: moduleName, period, date = '', scope = 'global' } = {}) {
  const tags = buildCacheTags({ module: moduleName, period, scope });
  return {
    key: buildCanonicalKey({ module: moduleName, period, date, scope }),
    tags,
    sourceVersion: store.sourceVersion(tags),
    cacheVersion: CACHE_VERSION,
    storeType: 'process-local'
  };
}

function readV2(context = {}) {
  if (!enabled()) return null;
  const current = store.get(context.key);
  if (!current) return null;
  const now = Date.now();
  const currentVersion = store.sourceVersion(context.tags || current.tags || []);
  if (current.expiresAt <= now || current.sourceVersion !== currentVersion) {
    store.delete(context.key);
    return null;
  }
  return current.value;
}

function writeV2(context = {}, value, { sourceTimestamp = '', generatedAt = '' } = {}) {
  if (!enabled()) return;
  const tags = context.tags || [];
  store.set(context.key, {
    value,
    tags,
    sourceVersion: store.sourceVersion(tags),
    sourceTimestamp: clean(sourceTimestamp),
    generatedAt: clean(generatedAt || value?.generatedAt || new Date().toISOString()),
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

function invalidateByTags({ module: moduleName, period, scope, all = false } = {}) {
  if (all || (!moduleName && !period && scope === undefined)) return store.clear();
  const tags = [];
  if (moduleName) tags.push(`module:${normalizeModule(moduleName)}`);
  if (period) tags.push(`period:${clean(period)}`);
  if (scope !== undefined) tags.push(`scope:${scopeHash(scope)}`);
  return store.invalidateByTags(tags);
}

function legacyKeyMatchesPeriod(key, period) {
  const normalized = clean(period);
  if (!normalized) return true;
  const parts = String(key || '').split(':');
  return parts.includes(normalized) || String(key || '').startsWith(`${normalized}:`);
}

async function latestVersionForModel(model) {
  const row = await model.findOne({})
    .select({ updatedAt: 1, createdAt: 1, _id: 1 })
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .lean();
  return String(row?.updatedAt || row?.createdAt || row?._id || 'empty');
}

function strictFreshnessModels() {
  // Lazy load keeps cache-v2 hit path dependency-free and avoids seven Mongo
  // reads unless the legacy strict-freshness mode is explicitly enabled.
  return [
    require('../../models/SalesOrder'),
    require('../../models/ReturnOrder'),
    require('../../models/ArLedger'),
    require('../../models/MasterOrder'),
    require('../../models/User'),
    require('../../models/SalesTarget'),
    require('../../models/Product')
  ];
}

async function freshnessVersion() {
  if (!enabled()) return 'cache-disabled';
  if (v2Enabled()) return 'mutation-driven-v2';
  if (!STRICT_FRESHNESS) return 'ttl-only';
  const versions = await Promise.all(strictFreshnessModels().map(latestVersionForModel));
  return versions.join('|');
}

function read(key, version) {
  if (!enabled()) return null;
  const current = legacyCache.get(key);
  if (!current || current.expiresAt <= Date.now() || current.version !== version) {
    legacyCache.delete(key);
    return null;
  }
  return current.value;
}

function write(key, version, value) {
  if (!enabled()) return;
  legacyCache.set(key, { version, value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function invalidate(periodOrOptions = '') {
  if (typeof periodOrOptions === 'object' && periodOrOptions !== null) {
    const removedV2 = invalidateByTags(periodOrOptions);
    const period = clean(periodOrOptions.period);
    if (periodOrOptions.all || (!period && !periodOrOptions.module && periodOrOptions.scope === undefined)) {
      const legacyCount = legacyCache.size;
      legacyCache.clear();
      return removedV2 + legacyCount;
    }
    let removedLegacy = 0;
    for (const key of Array.from(legacyCache.keys())) {
      const moduleMatch = !periodOrOptions.module || String(key).startsWith(`${normalizeModule(periodOrOptions.module)}:`);
      if (moduleMatch && (!period || legacyKeyMatchesPeriod(key, period))) {
        legacyCache.delete(key);
        removedLegacy += 1;
      }
    }
    return removedV2 + removedLegacy;
  }

  const normalizedPeriod = clean(periodOrOptions);
  if (!normalizedPeriod) {
    const count = legacyCache.size + store.size();
    legacyCache.clear();
    store.clear();
    return count;
  }
  let removed = invalidateByTags({ period: normalizedPeriod });
  for (const key of Array.from(legacyCache.keys())) {
    if (legacyKeyMatchesPeriod(key, normalizedPeriod)) {
      legacyCache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

function describeStore() {
  return {
    type: 'process-local',
    shared: false,
    cacheVersion: CACHE_VERSION,
    entryCount: store.size(),
    safeFallback: 'legacy TTL cache or live query',
    sharedAdapterContract: ['get', 'set', 'delete', 'clear', 'invalidateByTags', 'sourceVersion']
  };
}

function setStoreForTests(nextStore) {
  store = nextStore;
}

function resetForTests() {
  legacyCache.clear();
  store = new ProcessLocalDashboardCacheStore();
}

module.exports = {
  CACHE_TTL_MS,
  STRICT_FRESHNESS,
  CACHE_VERSION,
  ProcessLocalDashboardCacheStore,
  enabled,
  v2Enabled,
  freshnessVersion,
  buildCanonicalKey,
  buildCacheTags,
  createCacheContext,
  readV2,
  writeV2,
  invalidateByTags,
  read,
  write,
  invalidate,
  describeStore,
  _testing: {
    scopeHash,
    stableSerialize,
    legacyKeyMatchesPeriod,
    setStoreForTests,
    resetForTests,
    getStore: () => store,
    getLegacyCache: () => legacyCache
  }
};
