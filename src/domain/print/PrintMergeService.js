'use strict';

const { toNumber } = require('../../utils/common.util');
const { cleanText, uniqueText } = require('./PrintContract');
const { warehouseNameFromCode } = require('./PrintLineNormalizer');

function normalizedPrice(value) {
  return Math.round(toNumber(value));
}

function lineMergeKey(line = {}, options = {}) {
  const priceField = options.priceField || 'finalPrice';
  return [
    cleanText(line.warehouseCode).toUpperCase(),
    cleanText(line.lineType).toUpperCase(),
    cleanText(line.productCode).toUpperCase(),
    normalizedPrice(line[priceField])
  ].join('|');
}

function mergeLines(lines = [], options = {}) {
  const priceField = options.priceField || 'finalPrice';
  const map = new Map();

  for (const source of Array.isArray(lines) ? lines : []) {
    if (!source || toNumber(source.quantity) <= 0 || !cleanText(source.productCode)) continue;
    const key = lineMergeKey(source, { priceField });
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...source,
        quantity: toNumber(source.quantity),
        lineAmount: toNumber(source.lineAmount),
        sourceOrderCodes: uniqueText(source.sourceOrderCodes),
        promotionRows: Array.isArray(source.promotionRows) ? [...source.promotionRows] : []
      });
      continue;
    }

    existing.quantity += toNumber(source.quantity);
    existing.lineAmount += toNumber(source.lineAmount);
    existing.sourceOrderCodes = uniqueText([
      ...(existing.sourceOrderCodes || []),
      ...(source.sourceOrderCodes || [])
    ]);
    existing.promotionRows = [
      ...(existing.promotionRows || []),
      ...(Array.isArray(source.promotionRows) ? source.promotionRows : [])
    ];
  }

  return Array.from(map.values()).sort((a, b) => {
    const warehouseCompare = cleanText(a.warehouseCode).localeCompare(cleanText(b.warehouseCode), 'vi');
    if (warehouseCompare) return warehouseCompare;
    const typeCompare = cleanText(a.lineType).localeCompare(cleanText(b.lineType), 'vi');
    if (typeCompare) return typeCompare;
    const codeCompare = cleanText(a.productCode).localeCompare(cleanText(b.productCode), 'vi', { numeric: true });
    if (codeCompare) return codeCompare;
    return normalizedPrice(a[priceField]) - normalizedPrice(b[priceField]);
  });
}

function groupLinesByWarehouse(lines = []) {
  const groups = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    const code = cleanText(line.warehouseCode) || 'KHO_HC';
    if (!groups.has(code)) {
      groups.set(code, {
        code,
        name: cleanText(line.warehouseName) || warehouseNameFromCode(code),
        items: [],
        saleItems: [],
        promoItems: [],
        returnItems: [],
        importItems: [],
        totalQty: 0,
        totalAmount: 0
      });
    }
    const group = groups.get(code);
    group.items.push(line);
    if (line.lineType === 'PROMO') group.promoItems.push(line);
    else if (line.lineType === 'RETURN') group.returnItems.push(line);
    else if (line.lineType === 'IMPORT') group.importItems.push(line);
    else group.saleItems.push(line);
    group.totalQty += toNumber(line.quantity);
    group.totalAmount += toNumber(line.lineAmount);
  }

  const preferred = ['KHO_HC', 'KHO_PC'];
  return Array.from(groups.values()).sort((a, b) => {
    const ai = preferred.indexOf(a.code);
    const bi = preferred.indexOf(b.code);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.name.localeCompare(b.name, 'vi');
  });
}

module.exports = {
  lineMergeKey,
  mergeLines,
  groupLinesByWarehouse
};
