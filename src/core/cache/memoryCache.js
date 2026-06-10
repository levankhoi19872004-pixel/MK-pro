'use strict';

const store = new Map();

function now() { return Date.now(); }
function isExpired(entry) { return entry && entry.expiresAt && entry.expiresAt <= now(); }

function get(key) {
  const entry = store.get(String(key));
  if (!entry) return undefined;
  if (isExpired(entry)) {
    store.delete(String(key));
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs = 300000) {
  const cleanKey = String(key);
  store.set(cleanKey, { value, expiresAt: ttlMs > 0 ? now() + ttlMs : 0 });
  return value;
}

function del(key) { return store.delete(String(key)); }

function clearByPrefix(prefix = '') {
  const cleanPrefix = String(prefix);
  let count = 0;
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(cleanPrefix)) {
      store.delete(key);
      count += 1;
    }
  }
  return count;
}

function clear() { const count = store.size; store.clear(); return count; }
function size() { return store.size; }

module.exports = { get, set, del, clearByPrefix, clear, size };
