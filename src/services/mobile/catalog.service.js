'use strict';

const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const inventoryStockService = require('../inventoryStock.service');
const { toNumber, stripMongoFields, formatCaseLooseQty } = require('../../utils/common.util');
const { normalizeText } = require('../../utils/search.util');

function regexFilter(q, fields = []) {
  const keyword = String(q || '').trim();
  if (!keyword) return { isActive: { $ne: false } };
  return {
    isActive: { $ne: false },
    $or: fields.map((field) => ({ [field]: { $regex: keyword, $options: 'i' } }))
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
  async function customers({ query = {} } = {}) {
    const q = String(query.q || query.search || '').trim();
    const limit = Math.min(Math.max(toNumber(query.limit || (q ? 200 : 500)), 1), 1000);
    const rows = await Customer.find(regexFilter(q, ['code', 'customerCode', 'name', 'customerName', 'phone', 'address', 'area', 'route']))
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
    const filter = regexFilter(q, ['code', 'productCode', 'sku', 'name', 'productName', 'barcode', 'brand', 'category', 'groupName', 'productGroup']);
    let rows = await Product.find(filter).sort({ code: 1 }).limit(limit).lean();
    if (group) {
      rows = rows.filter((row) => [row.category, row.categoryName, row.group, row.groupName, row.productGroup, row.productGroupName]
        .some((value) => normalizeText(value).includes(group)));
    }

    let products = await enrichProductsWithInventory(rows);
    if (truthyFlag(query.inStockOnly || query.onlyInStock)) {
      products = products.filter((product) => toNumber(product.availableQty) > 0);
    }

    return {
      body: {
        ok: true,
        success: true,
        source: 'mobile-catalog-route',
        inventorySource: 'inventories',
        products,
        items: products,
        total: products.length
      }
    };
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
