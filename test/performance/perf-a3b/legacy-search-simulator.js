'use strict';
const { normalize } = require('./fixture-factory');

const LEGACY_FIELDS = [
  'id', 'code', 'orderCode', 'salesOrderCode',
  'customerCode', 'customerName', 'phone', 'customerPhone', 'phoneNumber',
  'deliveryStaffCode', 'deliveryStaffName', 'salesStaffCode', 'salesStaffName'
];

function scopeMatches(row, query = {}) {
  const date = String(query.deliveryDate || query.date || '').trim();
  const delivery = normalize(query.deliveryStaffCode || query.delivery || query.nvgh);
  const sales = normalize(query.salesStaffCode || query.salesman || query.nvbh);
  if (date && String(row.deliveryDateKey || row.deliveryDate || '').slice(0, 10) !== date) return false;
  const rowDelivery = normalize(row.deliveryStaffCode || row.deliveryCode || row.nvghCode);
  const rowSales = normalize(row.salesStaffCode || row.salesmanCode || row.nvbhCode);
  if (delivery && !rowDelivery.includes(delivery)) return false;
  if (sales && !rowSales.includes(sales)) return false;
  return true;
}

function legacySearch(orders = [], query = {}, limit = 10) {
  const needle = String(query.q || '').trim().toLowerCase();
  let scanned = 0;
  const candidates = [];
  for (const row of orders) {
    scanned += 1;
    if (!scopeMatches(row, query)) continue;
    if (!needle || LEGACY_FIELDS.some((field) => String(row[field] || '').toLowerCase().includes(needle))) {
      candidates.push(row);
      if (candidates.length >= Math.max(50, limit * 10)) break;
    }
  }
  const dedup = new Set();
  const items = [];
  for (const row of candidates) {
    const key = String(row.customerCode || row.customerName || row.customerPhone || '').toUpperCase();
    if (!key || dedup.has(key)) continue;
    dedup.add(key);
    items.push(row);
    if (items.length >= limit) break;
  }
  return {
    items,
    metrics: {
      regexFieldCount: LEGACY_FIELDS.length,
      regexMode: 'unanchored-substring-case-insensitive',
      scannedRows: scanned,
      candidateRows: candidates.length,
      jsDeduplicatedRows: candidates.length - dedup.size,
      outputRows: items.length
    }
  };
}

module.exports = { legacySearch, LEGACY_FIELDS };
