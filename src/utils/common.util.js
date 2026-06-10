'use strict';

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  let raw = String(value).trim();
  if (!raw) return 0;

  // Hỗ trợ số âm dạng "(1.000)" hoặc "-1.000".
  let sign = 1;
  if (/^\(.*\)$/.test(raw)) {
    sign = -1;
    raw = raw.slice(1, -1).trim();
  }
  if (raw.startsWith('-')) {
    sign = -1;
    raw = raw.slice(1).trim();
  }

  // Bỏ ký hiệu tiền và khoảng trắng, chỉ giữ số và dấu phân tách.
  raw = raw.replace(/\s+/g, '').replace(/[^0-9.,]/g, '');
  if (!raw) return 0;

  // Tiền Việt Nam: "200.000.000" => 200000000.
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    const n = Number(raw.replace(/\./g, ''));
    return Number.isFinite(n) ? sign * n : 0;
  }

  // Dạng quốc tế: "200,000,000" => 200000000.
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) {
    const n = Number(raw.replace(/,/g, ''));
    return Number.isFinite(n) ? sign * n : 0;
  }

  // Dạng thập phân Việt Nam: "1234,56" => 1234.56.
  if (/^\d+,\d+$/.test(raw) && !raw.includes('.')) {
    const n = Number(raw.replace(',', '.'));
    return Number.isFinite(n) ? sign * n : 0;
  }

  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? sign * n : 0;
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

function calculateCartonUnit(quantity, packing = 1) {
  const qty = Math.max(0, toNumber(quantity));
  const rate = Math.max(1, toNumber(packing) || 1);
  const cartons = Math.floor(qty / rate);
  const units = qty % rate;
  return { cartons, units, packing: rate, display: `${cartons}/${units}` };
}

function formatCaseLooseQty(quantity, conversionRate = 1) {
  return calculateCartonUnit(quantity, conversionRate).display;
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
  calculateCartonUnit,
  formatCaseLooseQty,
  normalizePacking
};
