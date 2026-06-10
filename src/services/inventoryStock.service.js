'use strict';

const StockTransaction = require('../models/StockTransaction');
const Product = require('../models/Product');
const dateUtil = require('../utils/date.util');
const { toNumber } = require('../utils/common.util');
const { STOCK_WAREHOUSE_CODE, STOCK_WAREHOUSE_NAME } = require('../constants/business.constants');

function normalizeProductCode(value = '') {
  return String(value || '').trim().toUpperCase();
}

function stockWarehouseCode() {
  return STOCK_WAREHOUSE_CODE || 'MAIN';
}

function stockWarehouseName() {
  return STOCK_WAREHOUSE_NAME || 'Kho chính';
}

function quantityOf(row = {}) {
  return toNumber(row.quantity ?? row.qty ?? row.balanceQty ?? 0);
}

function activeLedgerFilter(extra = {}) {
  return {
    ...extra,
    status: { $nin: ['void', 'cancelled', 'canceled', 'deleted'] }
  };
}

function productCodeOf(row = {}) {
  return normalizeProductCode(row.productCode || row.code || row.sku || row.productId || row.id || row._id);
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
  const rows = await StockTransaction.find(activeLedgerFilter({
    $or: [
      { productCode: { $in: aliases } },
      { productId: { $in: aliases } }
    ]
  })).select('productCode productId quantity qty').lean().catch(() => []);

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

async function getInventorySummary(query = {}) {
  const q = normalizeProductCode(query.q || query.search || query.keyword || '');
  const [inventoryRows, products] = await Promise.all([
    StockTransaction.find(activeLedgerFilter({})).sort({ productCode: 1, date: 1, createdAt: 1 }).lean(),
    Product.find({}).select('id code productCode sku name productName unit baseUnit minStock maxStock').lean()
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
    const quantity = quantityOf(row);
    if (!grouped.has(productCode)) {
      grouped.set(productCode, {
        id: row.productCode || row.productId || String(row._id || ''),
        productId: row.productId || product.id || String(product._id || ''),
        productCode,
        productName: row.productName || product.name || product.productName || '',
        warehouseId: stockWarehouseCode(),
        warehouseCode: stockWarehouseCode(),
        warehouseName: stockWarehouseName(),
        unit: row.unit || product.unit || product.baseUnit || '',
        quantity: 0,
        qty: 0,
        onHand: 0,
        reservedQty: 0,
        availableQty: 0,
        minStock: toNumber(product.minStock),
        maxStock: toNumber(product.maxStock),
        updatedAt: row.updatedAt || row.createdAt || ''
      });
    }
    const acc = grouped.get(productCode);
    acc.quantity += quantity;
    acc.qty += quantity;
    acc.onHand += quantity;
    acc.availableQty += quantity;
    const updatedAt = row.updatedAt || row.createdAt || '';
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

  return { source: 'inventoryStock.service', stock, summary, inventorySource: 'stockTransactions', negativeStockCount: negativeStockRows.length, negativeStockRows, generatedAt: dateUtil.nowIso() };
}

module.exports = {
  normalizeProductCode,
  quantityOf,
  getAvailableStock,
  getAvailableStocks,
  getInventorySummary,
  stockWarehouseCode,
  stockWarehouseName
};
