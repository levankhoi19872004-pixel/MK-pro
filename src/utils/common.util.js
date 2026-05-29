'use strict';

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value) {
  const number = Number(String(value ?? 0).replace(/,/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function stripMongoFields(doc) {
  const raw = typeof doc?.toObject === 'function' ? doc.toObject() : { ...(doc || {}) };
  if (raw._id && !raw.id) raw.id = String(raw._id);
  delete raw._id;
  delete raw.__v;
  return raw;
}

function makeId(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function formatCaseLooseQty(quantity, conversionRate = 1) {
  const qty = toNumber(quantity);
  const rate = Math.max(1, toNumber(conversionRate) || 1);
  const cases = Math.floor(qty / rate);
  const loose = qty % rate;
  if (!cases) return `${loose} lẻ`;
  if (!loose) return `${cases} thùng`;
  return `${cases} thùng ${loose} lẻ`;
}

function normalizePacking(body = {}) {
  const unit = String(body.unit || body.caseUnit || 'Thùng').trim() || 'Thùng';
  const baseUnit = String(body.baseUnit || body.looseUnit || body.unitName || '').trim();
  const conversionRate = Math.max(1, toNumber(body.conversionRate || body.packingQty || body.qtyPerCase || 1));
  const packing = String(body.packing || (baseUnit ? `1 ${unit} = ${conversionRate} ${baseUnit}` : '')).trim();
  const units = Array.isArray(body.units) && body.units.length
    ? body.units
    : [
        { name: unit, ratio: conversionRate, isBase: false, isDefaultSale: true },
        ...(baseUnit ? [{ name: baseUnit, ratio: 1, isBase: true, isDefaultSale: false }] : [])
      ];
  return { unit, baseUnit, conversionRate, packing, units };
}

module.exports = {
  normalizeText,
  toNumber,
  stripMongoFields,
  makeId,
  formatCaseLooseQty,
  normalizePacking
};
