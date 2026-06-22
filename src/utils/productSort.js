'use strict';

function normalizeSortText(value) {
  return String(value ?? '').trim();
}

function getProductSortName(item = {}) {
  return normalizeSortText(
    item.productName
      || item.name
      || item.itemName
      || item.product_name
      || item.productTitle
      || item.tenHang
      || item.description
  );
}

function getProductSortCode(item = {}) {
  return normalizeSortText(
    item.productCode
      || item.code
      || item.sku
      || item.maHang
      || item.productId
  );
}

function compareProductNameAsc(a = {}, b = {}) {
  const byName = getProductSortName(a).localeCompare(getProductSortName(b), 'vi', {
    sensitivity: 'base',
    numeric: true
  });
  if (byName !== 0) return byName;

  return getProductSortCode(a).localeCompare(getProductSortCode(b), 'vi', {
    sensitivity: 'base',
    numeric: true
  });
}

function zoneRank(item = {}) {
  const raw = normalizeSortText(item.pickingZone || item.warehouseCode || item.groupCode || item.zone).toUpperCase();
  if (raw === 'HC' || raw === 'KHO_HC') return 0;
  if (raw === 'PC' || raw === 'KHO_PC') return 1;
  if (raw === 'UNASSIGNED') return 2;
  return 99;
}

function comparePickingZoneThenProductNameAsc(a = {}, b = {}) {
  const byZone = zoneRank(a) - zoneRank(b);
  if (byZone !== 0) return byZone;
  return compareProductNameAsc(a, b);
}

function sortProductsByNameAsc(items) {
  if (!Array.isArray(items)) return [];
  return [...items].sort(compareProductNameAsc);
}

function sortProductsByPickingZoneThenNameAsc(items) {
  if (!Array.isArray(items)) return [];
  return [...items].sort(comparePickingZoneThenProductNameAsc);
}

module.exports = {
  normalizeSortText,
  getProductSortName,
  getProductSortCode,
  compareProductNameAsc,
  comparePickingZoneThenProductNameAsc,
  sortProductsByNameAsc,
  sortProductsByPickingZoneThenNameAsc
};
