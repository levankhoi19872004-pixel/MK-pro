'use strict';

const { normalizeText } = require('../../utils/common.util');

const IMPORT_MODE_CREATE = 'create';
const IMPORT_MODE_UPDATE = 'update';
const SELECTIVE_UPDATE_TYPES = new Set(['products', 'customers', 'users']);

function normalizeImportMode(value, type = '') {
  const requested = String(value || '').trim().toLowerCase();
  if (requested === IMPORT_MODE_UPDATE && SELECTIVE_UPDATE_TYPES.has(String(type || '').trim())) {
    return IMPORT_MODE_UPDATE;
  }
  return IMPORT_MODE_CREATE;
}

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function getProvidedField(row = {}, aliases = []) {
  if (!row || typeof row !== 'object') return { present: false, hasValue: false, value: undefined, key: '' };
  const keys = Object.keys(row);
  const normalizedAliases = new Set(aliases.map(normalizeHeader).filter(Boolean));
  const key = keys.find((candidate) => normalizedAliases.has(normalizeHeader(candidate)));
  if (!key) return { present: false, hasValue: false, value: undefined, key: '' };
  const value = row[key];
  const hasValue = value !== null && value !== undefined && String(value).trim() !== '';
  return { present: true, hasValue, value, key };
}

function parseImportBoolean(value, defaultValue = true) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = normalizeText(String(value ?? ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!normalized) return defaultValue;
  if (['0', 'false', 'no', 'n', 'inactive', 'ngung', 'ngung hoat dong', 'khoa', 'lock', 'locked', 'khong', 'khong hoat dong'].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'y', 'active', 'hoat dong', 'co', 'mo'].includes(normalized)) return true;
  return defaultValue;
}

function comparable(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value) || typeof value === 'object') {
    try { return JSON.stringify(value); } catch (_) { return String(value); }
  }
  return String(value).trim();
}

function valuesEqual(left, right) {
  return comparable(left) === comparable(right);
}

function buildChanges(current = {}, patch = {}, labels = {}, hiddenFields = new Set()) {
  const changes = [];
  for (const [field, newValue] of Object.entries(patch || {})) {
    if (['searchText', 'updatedAt', 'units', 'warehouseName', 'printGroup', 'printGroupName', 'name', 'code', 'legacyStaffCode', 'legacyStaffName', 'isSalesman', 'isDelivery'].includes(field) && !labels[field]) continue;
    const oldValue = current ? current[field] : undefined;
    if (valuesEqual(oldValue, newValue)) continue;
    const hidden = hiddenFields.has(field);
    changes.push({
      field,
      label: labels[field] || field,
      oldValue: hidden ? 'Đã thiết lập' : oldValue,
      newValue: hidden ? 'Sẽ cập nhật' : newValue
    });
  }
  return changes;
}

function omitUnchanged(current = {}, patch = {}) {
  return Object.fromEntries(
    Object.entries(patch || {}).filter(([field, value]) => !valuesEqual(current ? current[field] : undefined, value))
  );
}

module.exports = {
  IMPORT_MODE_CREATE,
  IMPORT_MODE_UPDATE,
  SELECTIVE_UPDATE_TYPES,
  normalizeImportMode,
  getProvidedField,
  parseImportBoolean,
  valuesEqual,
  buildChanges,
  omitUnchanged
};
