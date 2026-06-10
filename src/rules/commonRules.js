'use strict';

const { normalizeSearchText } = require('../utils/search.util');

function normalizeCode(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const numeric = raw.replace(/,/g, '.');
  if (/^\d+\.0+$/.test(numeric)) return numeric.replace(/\.0+$/, '').toUpperCase();
  return raw.toUpperCase();
}

function normalizeRuleText(value) {
  return String(value ?? '').trim();
}


function normalizeMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '0').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = Number(text || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeQuantity(value) {
  return normalizeMoney(value);
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const utc = Math.round((value - 25569) * 86400 * 1000);
    return new Date(utc).toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  let m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return text;
}

function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '');
}

module.exports = { normalizeCode, normalizeText: normalizeRuleText, normalizeSearchText, normalizeMoney, normalizeQuantity, normalizeDate, normalizePhone };
