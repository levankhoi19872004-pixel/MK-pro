'use strict';

const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const inventoryStockService = require('../inventoryStock.service');
const { toNumber, stripMongoFields, formatCaseLooseQty } = require('../../utils/common.util');
const { normalizeText } = require('../../utils/search.util');
const { escapeRegex } = require('../../utils/query.util');
const { customerOwnershipFilterForSalesUser, combineFilters } = require('../../domain/staff/customerOwnership');

const MOBILE_CATALOG_PRODUCTS_CACHE_TTL_MS = Math.max(0, Number(process.env.MOBILE_CATALOG_PRODUCTS_CACHE_TTL_MS || 5000));
const MOBILE_CATALOG_PRODUCTS_CACHE_MAX_ENTRIES = Math.max(10, Number(process.env.MOBILE_CATALOG_PRODUCTS_CACHE_MAX_ENTRIES || 200));
const mobileCatalogProductsCache = new Map();

function cacheGet(map, key) {
  const row = map.get(key);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) map.delete(key);
    return null;
  }
  return row.value;
}

function pruneCache(map) {
  const now = Date.now();
  for (const [key, row] of map.entries()) {
    if (!row || row.expiresAt <= now) map.delete(key);
  }
  while (map.size >= MOBILE_CATALOG_PRODUCTS_CACHE_MAX_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

function cacheSet(map, key, value, ttlMs) {
  if (ttlMs > 0) {
    pruneCache(map);
    map.delete(key);
    map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  return value;
}

function regexFilter(q, fields = []) {
  const keyword = String(q || '').trim();
  if (!keyword) return { isActive: { $ne: false } };
  return {
    isActive: { $ne: false },
    $or: fields.map((field) => ({ [field]: { $regex: escapeRegex(keyword), $options: 'i' } }))
  };
}

function truthyFlag(value) {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

function cleanCode(value = '') {
  return String(value || '').trim();
}

function normalizeProductCode(value = '') {
  return inventoryStockService.normalizeProductCode(value);
}

function productCodeOf(product = {}) {
  return cleanCode(product.code || product.productCode || product.sku || product.id || product._id || '');
}

function inferPackingRateFromText(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const match = text.match(/(?:\/|\b)(\d{1,4})\s*(chai|gói|bộ|cây|túi|hộp|dây|cái|bánh|tuýp|lon|thùng|pcs|pc)\b/i);
    if (match) {
      const rate = toNumber(match[1]);
      if (rate > 1) return rate;
    }
  }
  return 1;
}

function packingRateOf(product = {}) {
  const explicit = toNumber(
    product.conversionRate ||
    product.packingQty ||
    product.unitsPerCase ||
    product.packQty ||
    product.qtyPerCase ||
    0
  );
  if (explicit > 1) return explicit;
  return inferPackingRateFromText(
    product.packing,
    product.name,
    product.productName,
    product.unit,
    product.baseUnit
  );
}

async function enrichProductsWithInventory(products = []) {
  const normalizedProducts = (products || []).map(stripMongoFields);
  const codes = normalizedProducts.map(productCodeOf).filter(Boolean);
  const stockMap = await inventoryStockService.getAvailableStocks(codes);

  return normalizedProducts.map((product) => {
    const code = productCodeOf(product);
    const stockKey = normalizeProductCode(code);
    const availableQty = toNumber(stockMap[stockKey] ?? stockMap[code] ?? 0);
    const conversionRate = Math.max(1, packingRateOf(product));
    const stockDisplay = formatCaseLooseQty(availableQty, conversionRate);

    return {
      ...product,
      id: cleanCode(product.id || product._id || code),
      code,
      productCode: cleanCode(product.productCode || code),
      sku: cleanCode(product.sku || code),
      name: cleanCode(product.name || product.productName || ''),
      productName: cleanCode(product.productName || product.name || ''),
      conversionRate,
      packingQty: conversionRate,
      unitsPerCase: conversionRate,
      availableQty,
      availableStock: availableQty,
      stockQuantity: availableQty,
      stock: availableQty,
      _availableQty: availableQty,
      stockDisplay,
      inventorySource: 'inventories',
      stockSource: 'inventoryStock.service'
    };
  });
}

function createMobileCatalogService(ctx = {}) {
  async function customers({ query = {}, mobileUser = {} } = {}) {
    const q = String(query.q || query.search || '').trim();
    const limit = Math.min(Math.max(toNumber(query.limit || (q ? 200 : 500)), 1), 1000);
    const role = String(mobileUser.role || '').trim().toLowerCase();
    const ownershipFilter = role === 'sales' ? customerOwnershipFilterForSalesUser(mobileUser) : {};
    const filter = combineFilters(
      regexFilter(q, ['code', 'customerCode', 'name', 'customerName', 'phone', 'address', 'area', 'route']),
      ownershipFilter
    );
    const rows = await Customer.find(filter)
      .sort({ code: 1 })
      .limit(limit)
      .lean();
    const customers = rows.map(stripMongoFields);
    return { body: { ok: true, success: true, source: 'mobile-catalog-route', customers, items: customers, total: customers.length } };
  }

  async function products({ query = {} } = {}) {
    const q = String(query.q || query.search || '').trim();
    const group = normalizeText(query.group || query.category || query.productGroup || '');
    const limit = Math.min(Math.max(toNumber(query.limit || (q ? 500 : 1000)), 1), 2000);
    const inStockFlag = truthyFlag(query.inStockOnly || query.onlyInStock);
    const cacheKey = JSON.stringify({ q, group, limit, inStockFlag });
    const cached = cacheGet(mobileCatalogProductsCache, cacheKey);
    if (cached) return cached;

    const filter = regexFilter(q, ['code', 'productCode', 'sku', 'name', 'productName', 'barcode', 'brand', 'category', 'groupName', 'productGroup']);
    let rows = await Product.find(filter)
      .select('id code productCode sku barcode name productName unit baseUnit conversionRate packing packingQty unitsPerCase brand category groupName productGroup salePrice price isActive')
      .sort({ code: 1 })
      .limit(limit)
      .lean();
    if (group) {
      rows = rows.filter((row) => [row.category, row.categoryName, row.group, row.groupName, row.productGroup, row.productGroupName]
        .some((value) => normalizeText(value).includes(group)));
    }

    let products = await enrichProductsWithInventory(rows);
    if (inStockFlag) {
      products = products.filter((product) => toNumber(product.availableQty) > 0);
    }

    const response = {
      body: {
        ok: true,
        success: true,
        source: 'mobile-catalog-route',
        inventorySource: 'inventories',
        cacheTtlMs: MOBILE_CATALOG_PRODUCTS_CACHE_TTL_MS,
        cacheMaxEntries: MOBILE_CATALOG_PRODUCTS_CACHE_MAX_ENTRIES,
        products,
        items: products,
        total: products.length
      }
    };
    return cacheSet(mobileCatalogProductsCache, cacheKey, response, MOBILE_CATALOG_PRODUCTS_CACHE_TTL_MS);
  }

  async function stock({ query = {} } = {}) {
    const productCode = String(query.productCode || query.code || query.sku || query.q || query.search || '').trim();
    const stock = productCode
      ? await inventoryStockService.getAvailableStock(productCode)
      : {};
    return { body: { ok: true, success: true, source: 'mobile-catalog-route', inventorySource: 'inventories', stock } };
  }

  return { customers, products, stock };
}

module.exports = { createMobileCatalogService };
