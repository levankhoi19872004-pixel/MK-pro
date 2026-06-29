'use strict';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function stableClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function canonical(value) {
  if (value === undefined) return '__UNDEFINED__';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(canonical(item))));
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = value[key];
  return JSON.stringify(out);
}

function getByPath(source, path) {
  if (!path) return source;
  return String(path).split('.').reduce((current, key) => current == null ? undefined : current[key], source);
}

function setByPath(target, path, value) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return target;
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!isPlainObject(cursor[key]) && !Array.isArray(cursor[key])) cursor[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
  return target;
}

function unsetByPath(target, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return target;
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cursor = cursor?.[parts[i]];
    if (cursor == null) return target;
  }
  delete cursor[parts[parts.length - 1]];
  return target;
}

function flatten(value, prefix = '', out = {}) {
  if (Array.isArray(value)) {
    out[prefix] = stableClone(value);
    return out;
  }
  if (!isPlainObject(value)) {
    if (prefix) out[prefix] = stableClone(value);
    return out;
  }
  const keys = Object.keys(value);
  if (!keys.length && prefix) out[prefix] = {};
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const child = value[key];
    if (isPlainObject(child)) flatten(child, path, out);
    else out[path] = stableClone(child);
  }
  return out;
}

function buildObjectDiff(before = {}, after = {}) {
  const left = flatten(before || {});
  const right = flatten(after || {});
  const paths = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
  return paths
    .filter((path) => canonical(left[path]) !== canonical(right[path]))
    .map((path) => ({ path, before: left[path], after: right[path] }));
}

function applyPatch(source = {}, patch = {}) {
  const target = stableClone(source || {}) || {};
  for (const [path, value] of Object.entries(patch || {})) {
    if (!path || path.startsWith('$') || path.includes('..')) continue;
    if (value === undefined || value === null && String(path).startsWith('-')) unsetByPath(target, path.replace(/^-/, ''));
    else setByPath(target, path, stableClone(value));
  }
  return target;
}

function pickPatchFromDiff(diff = [], side = 'after') {
  return (Array.isArray(diff) ? diff : []).reduce((patch, row) => {
    if (row?.path) patch[row.path] = stableClone(row[side]);
    return patch;
  }, {});
}

module.exports = {
  buildObjectDiff,
  applyPatch,
  getByPath,
  setByPath,
  pickPatchFromDiff,
  stableClone
};
