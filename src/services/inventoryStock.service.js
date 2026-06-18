'use strict';

const InventoryCurrent = require('../models/InventoryLegacy');
const Product = require('../models/Product');
const dateUtil = require('../utils/date.util');
const { toNumber } = require('../utils/common.util');
const { STOCK_WAREHOUSE_CODE, STOCK_WAREHOUSE_NAME } = require('../constants/business.constants');

const INVENTORY_SUMMARY_CACHE_TTL_MS = Math.max(0, Number(process.env.INVENTORY_SUMMARY_CACHE_TTL_MS || 5000));
let inventorySummaryCache = { key: '', expiresAt: 0, value: null };

function invalidateInventorySummaryCache() {
  inventorySummaryCache = { key: '', expiresAt: 0, value: null };
}

function normalizeProductCode(value = '') {
  return String(value || '').trim().toUpperCase();
}

function stockWarehouseCode() {
  return STOCK_WAREHOUSE_CODE || 'MAIN';
}

function stockWarehouseName() {
  return STOCK_WAREHOUSE_NAME || 'Kho chính';
}

function onHandOf(row = {}) {
  if (row.onHand !== undefined && row.onHand !== null) return toNumber(row.onHand);
  if (row.quantity !== undefined && row.quantity !== null) return toNumber(row.quantity);
  if (row.qty !== undefined && row.qty !== null) return toNumber(row.qty);
  if (row.stockQuantity !== undefined && row.stockQuantity !== null) return toNumber(row.stockQuantity);
  if (row.availableQty !== undefined && row.availableQty !== null) {
    return toNumber(row.availableQty) + toNumber(row.reservedQty ?? row.reserved ?? 0);
  }
  return 0;
}

function availableQuantityOf(row = {}) {
  if (row.availableQty !== undefined && row.availableQty !== null) return toNumber(row.availableQty);
  return onHandOf(row) - toNumber(row.reservedQty ?? row.reserved ?? 0);
}

// Giữ API quantityOf cho các luồng kiểm tra khả dụng. quantityOf luôn là số
// có thể bán; báo cáo tồn vật lý phải dùng onHandOf.
function quantityOf(row = {}) {
  return availableQuantityOf(row);
}

function productCodeOf(row = {}) {
  return normalizeProductCode(row.productCode || row.code || row.sku || row.productId || row.id || row._id);
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

function packingRateOf(product = {}, row = {}) {
  const explicit = toNumber(
    product.conversionRate ||
    product.packingQty ||
    product.unitsPerCase ||
    row.conversionRate ||
    row.packingQty ||
    row.unitsPerCase ||
    0
  );
  if (explicit > 1) return explicit;
  return inferPackingRateFromText(
    product.packing,
    row.packing,
    product.name,
    product.productName,
    row.productName,
    row.name
  );
}

function buildAliases(product = {}) {
  return [product.code, product.productCode, product.sku, product.id, product._id, product._id ? String(product._id) : '']
    .map(normalizeProductCode)
    .filter(Boolean);
}

async function getAvailableStocks(productCodes = []) {
  const canonicalCodes = Array.from(new Set((productCodes || []).map(normalizeProductCode).filter(Boolean)));
  const result = {};
  for (const code of canonicalCodes) result[code] = 0;
  if (!canonicalCodes.length) return result;

  const products = await Product.find({
    $or: [
      { code: { $in: canonicalCodes } },
      { productCode: { $in: canonicalCodes } },
      { sku: { $in: canonicalCodes } },
      { id: { $in: canonicalCodes } }
    ]
  }).select('id code productCode sku').lean().catch(() => []);

  const aliasToCanonical = new Map();
  for (const code of canonicalCodes) aliasToCanonical.set(code, code);
  for (const product of products || []) {
    const canonical = normalizeProductCode(product.code || product.productCode || product.sku || product.id || product._id);
    if (!canonical) continue;
    if (result[canonical] === undefined) result[canonical] = 0;
    for (const alias of buildAliases(product)) aliasToCanonical.set(alias, canonical);
  }

  const aliases = Array.from(aliasToCanonical.keys());
  const rows = await InventoryCurrent.find({
    $or: [
      { productCode: { $in: aliases } },
      { code: { $in: aliases } },
      { sku: { $in: aliases } },
      { productId: { $in: aliases } }
    ]
  }).lean().catch(() => []);

  for (const row of rows || []) {
    const alias = productCodeOf(row);
    const canonical = aliasToCanonical.get(alias) || alias;
    if (!canonical) continue;
    if (result[canonical] === undefined) result[canonical] = 0;
    result[canonical] += quantityOf(row);
  }
  return result;
}

async function getAvailableStock(productCode) {
  const code = normalizeProductCode(productCode);
  if (!code) return { productCode: '', availableQty: 0 };
  const stocks = await getAvailableStocks([code]);
  return { productCode: code, availableQty: toNumber(stocks[code]) };
}

async function getInventorySummary(query = {}, options = {}) {
  const q = normalizeProductCode(query.q || query.search || query.keyword || '');
  const session = options.session || null;
  const forceRefresh = options.forceRefresh === true;
  const cacheKey = JSON.stringify({ q });
  const nowMs = Date.now();
  if (!session && !forceRefresh && INVENTORY_SUMMARY_CACHE_TTL_MS > 0 && inventorySummaryCache.key === cacheKey && inventorySummaryCache.value && inventorySummaryCache.expiresAt > nowMs) {
    return inventorySummaryCache.value;
  }

  let inventoryQuery = InventoryCurrent.find({}).sort({ productCode: 1 });
  let productQuery = Product.find({})
    .select('id code productCode sku name productName unit baseUnit conversionRate packing packingQty unitsPerCase minStock maxStock');
  if (session) {
    inventoryQuery = inventoryQuery.session(session);
    productQuery = productQuery.session(session);
  }
  const [inventoryRows, products] = await Promise.all([
    inventoryQuery.lean(),
    productQuery.lean()
  ]);

  const productMap = new Map();
  for (const product of products || []) {
    const canonical = normalizeProductCode(product.code || product.productCode || product.sku || product.id || product._id);
    if (canonical) productMap.set(canonical, product);
    for (const alias of buildAliases(product)) if (!productMap.has(alias)) productMap.set(alias, product);
  }

  const grouped = new Map();
  for (const row of inventoryRows || []) {
    const rowCode = productCodeOf(row);
    if (!rowCode) continue;
    const product = productMap.get(rowCode) || {};
    const productCode = normalizeProductCode(product.code || product.productCode || row.productCode || row.code || row.sku || row.productId);
    if (!productCode) continue;
    const onHand = onHandOf(row);
    const reservedQty = toNumber(row.reservedQty ?? row.reserved ?? 0);
    const availableQty = availableQuantityOf(row);
    if (!grouped.has(productCode)) {
      const packingRate = Math.max(1, packingRateOf(product, row));

      grouped.set(productCode, {
        id: row.id || String(row._id || ''),
        productId: row.productId || product.id || String(product._id || ''),
        productCode,
        productName: row.productName || product.name || product.productName || '',
        warehouseId: stockWarehouseCode(),
        warehouseCode: stockWarehouseCode(),
        warehouseName: stockWarehouseName(),
        unit: row.unit || product.unit || product.baseUnit || '',
        baseUnit: product.baseUnit || row.baseUnit || '',
        conversionRate: packingRate,
        packingQty: packingRate,
        unitsPerCase: packingRate,
        packing: product.packing || row.packing || '',
        quantity: 0,
        qty: 0,
        onHand: 0,
        reservedQty: 0,
        availableQty: 0,
        minStock: toNumber(product.minStock),
        maxStock: toNumber(product.maxStock),
        updatedAt: row.updatedAt || row.createdAt || row.lastTransactionAt || ''
      });
    }
    const acc = grouped.get(productCode);
    acc.quantity += onHand;
    acc.qty += onHand;
    acc.onHand += onHand;
    acc.availableQty += availableQty;
    acc.reservedQty += reservedQty;
    const updatedAt = row.updatedAt || row.createdAt || row.lastTransactionAt || '';
    if (updatedAt > (acc.updatedAt || '')) acc.updatedAt = updatedAt;
  }

  let stock = Array.from(grouped.values());
  if (q) stock = stock.filter((row) => [row.productCode, row.productName].some((value) => normalizeProductCode(value).includes(q)));
  const negativeStockRows = stock.filter((row) => toNumber(row.availableQty) < 0);
  const summary = stock.reduce((acc, row) => {
    acc.totalRows += 1;
    acc.totalQuantity += toNumber(row.availableQty);
    if (toNumber(row.availableQty) <= 0) acc.outOfStock += 1;
    if (toNumber(row.availableQty) < 0) acc.negativeStockCount += 1;
    if (toNumber(row.minStock) > 0 && toNumber(row.availableQty) <= toNumber(row.minStock)) acc.lowStock += 1;
    return acc;
  }, { totalRows: 0, totalQuantity: 0, outOfStock: 0, lowStock: 0, negativeStockCount: 0 });

  const result = { source: 'inventoryStock.service', stock, summary, inventorySource: 'inventories', negativeStockCount: negativeStockRows.length, negativeStockRows, generatedAt: dateUtil.nowIso(), cacheTtlMs: INVENTORY_SUMMARY_CACHE_TTL_MS };
  if (!session && INVENTORY_SUMMARY_CACHE_TTL_MS > 0) {
    inventorySummaryCache = { key: cacheKey, expiresAt: Date.now() + INVENTORY_SUMMARY_CACHE_TTL_MS, value: result };
  }
  return result;
}

async function checkAvailableForItems(items = []) {
  const requiredByProduct = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const productCode = normalizeProductCode(
      item.productCode || item.code || item.sku || item.productId
    );

    const quantity = Math.abs(toNumber(
      item.stockQuantity ??
      item.deliveredQuantity ??
      item.quantity ??
      item.qty ??
      item.totalQty ??
      0
    ));

    if (!productCode || quantity <= 0) continue;

    requiredByProduct.set(
      productCode,
      toNumber(requiredByProduct.get(productCode)) + quantity
    );
  }

  const productCodes = Array.from(requiredByProduct.keys());
  const stockMap = await getAvailableStocks(productCodes);

  const rows = productCodes.map((productCode) => {
    const availableQty = toNumber(stockMap[productCode]);
    const requiredQty = toNumber(requiredByProduct.get(productCode));

    return {
      productCode,
      availableQty,
      requiredQty,
      shortageQty: Math.max(0, requiredQty - availableQty),
      enough: availableQty >= requiredQty
    };
  });

  const shortages = rows.filter((row) => !row.enough);

  return {
    enough: shortages.length === 0,
    rows,
    shortages
  };
}

module.exports = {
  normalizeProductCode,
  quantityOf,
  onHandOf,
  availableQuantityOf,
  getAvailableStock,
  getAvailableStocks,
  getInventorySummary,
  checkAvailableForItems,
  invalidateInventorySummaryCache,
  stockWarehouseCode,
  stockWarehouseName
};
