'use strict';

function valueAt(row = {}, field = '') {
  if (!field) return undefined;
  return String(field).split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), row);
}

function normalizeKey(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value._id) return String(value._id).trim();
  return String(value).trim();
}

function collectUnique(items = [], fieldOrPicker) {
  const picker = typeof fieldOrPicker === 'function' ? fieldOrPicker : (row) => valueAt(row, fieldOrPicker);
  return Array.from(new Set((items || []).map(picker).map(normalizeKey).filter(Boolean)));
}

function collectUniqueIds(items = [], field = '_id') {
  return collectUnique(items, field);
}

function collectUniqueCodes(items = [], field = 'code') {
  return collectUnique(items, field);
}

function makeMap(rows = [], key = '_id') {
  const picker = typeof key === 'function' ? key : (row) => valueAt(row, key);
  const map = new Map();
  for (const row of rows || []) {
    const cleanKey = normalizeKey(picker(row));
    if (cleanKey) map.set(cleanKey, row);
  }
  return map;
}

module.exports = { collectUnique, collectUniqueIds, collectUniqueCodes, makeMap, normalizeKey };
