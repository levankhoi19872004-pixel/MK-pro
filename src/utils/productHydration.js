'use strict';

const {
  PICKING_ZONES,
  normalizePickingZone,
  pickingZoneFrom,
  pickingZoneLabel,
  legacyPrintGroupCode,
  isAssignedPickingZone
} = require('./pickingZone.util');

function cleanText(value) {
  return String(value ?? '').trim();
}

function productCodeOf(item = {}) {
  return cleanText(
    item.productCode
      || item.code
      || item.sku
      || item.maHang
      || item.productId
      || item.productSnapshot?.productCode
      || item.productSnapshot?.code
      || item.product?.productCode
      || item.product?.code
  );
}

function productAliases(product = {}) {
  return [
    product.code,
    product.productCode,
    product.sku,
    product.barcode,
    product.id,
    product._id
  ].map(cleanText).filter(Boolean);
}

function buildProductMap(products = []) {
  const map = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    for (const alias of productAliases(product)) map.set(alias, product);
  }
  return map;
}

function getProductFromMap(productMap = new Map(), item = {}) {
  const code = productCodeOf(item);
  if (!code || !(productMap instanceof Map)) return null;
  return productMap.get(code) || productMap.get(code.toUpperCase()) || productMap.get(code.toLowerCase()) || null;
}

function catalogPickingZone(product = {}) {
  const zone = normalizePickingZone(pickingZoneFrom(product), PICKING_ZONES.UNASSIGNED);
  return isAssignedPickingZone(zone) ? zone : '';
}

function snapshotPickingZone(item = {}) {
  const zone = normalizePickingZone(pickingZoneFrom(item, item.productSnapshot, item.product), PICKING_ZONES.UNASSIGNED);
  return isAssignedPickingZone(zone) ? zone : '';
}

function getCurrentPickingZone(item = {}, product = {}, fallback = PICKING_ZONES.HC) {
  // Product catalog is the source of truth for HC/PC at print/view/export time.
  const catalogZone = catalogPickingZone(product);
  if (catalogZone) return catalogZone;

  // If catalog is missing, fall back to the historical line snapshot so old
  // documents remain printable instead of failing.
  const lineZone = snapshotPickingZone(item);
  if (lineZone) return lineZone;

  return normalizePickingZone(fallback, PICKING_ZONES.HC);
}

function getCurrentPickingZoneSource(item = {}, product = {}) {
  if (catalogPickingZone(product)) return 'products.currentPickingZone';
  if (snapshotPickingZone(item)) return 'lineSnapshot.fallback';
  return 'default.HC';
}

function applyCurrentProductPickingZone(item = {}, product = {}) {
  const pickingZone = getCurrentPickingZone(item, product, PICKING_ZONES.HC);
  return {
    ...item,
    pickingZone,
    currentPickingZone: pickingZone,
    pickingZoneSource: getCurrentPickingZoneSource(item, product),
    warehouseCode: legacyPrintGroupCode(pickingZone),
    warehouseName: pickingZoneLabel(pickingZone)
  };
}

async function hydrateProductsByCode(items = [], options = {}) {
  const ProductModel = options.ProductModel || require('../models/Product');
  const codes = [...new Set((Array.isArray(items) ? items : [])
    .map(productCodeOf)
    .filter(Boolean))];
  if (!codes.length) {
    return {
      items: Array.isArray(items) ? [...items] : [],
      productMap: new Map(),
      missingProductCodes: []
    };
  }

  const products = await ProductModel.find({
    $or: [
      { code: { $in: codes } },
      { productCode: { $in: codes } },
      { sku: { $in: codes } },
      { barcode: { $in: codes } }
    ]
  }).lean();
  const productMap = buildProductMap(products);
  const missingProductCodes = [];
  const hydratedItems = (Array.isArray(items) ? items : []).map((item) => {
    const product = getProductFromMap(productMap, item);
    if (!product && productCodeOf(item)) missingProductCodes.push(productCodeOf(item));
    return applyCurrentProductPickingZone(item, product || {});
  });

  return {
    items: hydratedItems,
    productMap,
    missingProductCodes: [...new Set(missingProductCodes)]
  };
}

module.exports = {
  cleanText,
  productCodeOf,
  productAliases,
  buildProductMap,
  getProductFromMap,
  catalogPickingZone,
  snapshotPickingZone,
  getCurrentPickingZone,
  getCurrentPickingZoneSource,
  applyCurrentProductPickingZone,
  hydrateProductsByCode
};
