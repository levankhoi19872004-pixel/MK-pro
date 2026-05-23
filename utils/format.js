'use strict';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(value) {
  return Math.round(num(value));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(value) {
  return String(value || '').slice(0, 10);
}

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function safeId(prefix = 'ID') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

module.exports = { num, money, todayISO, dateOnly, norm, safeId };
