'use strict';

const inventoryStockService = require('../services/inventoryStock.service');
const { normalizeCode, normalizeQuantity } = require('./commonRules');

function rowQty(row = {}) {
  const onHand = normalizeQuantity(row.onHand ?? row.qty ?? row.quantity ?? row.stockQuantity);
  const reserved = normalizeQuantity(row.reservedQty ?? row.reserved ?? 0);
  if (row.availableQty !== undefined && row.availableQty !== null) return normalizeQuantity(row.availableQty);
  return Math.max(0, onHand - reserved);
}

async function getAvailableStock(productCode, warehouseCode = '') {
  const code = normalizeCode(productCode);
  if (!code) return 0;
  const stock = await inventoryStockService.getAvailableStock(code);
  return normalizeQuantity(stock.availableQty);
}

async function checkInventoryEnough(items = [], warehouseCode = '') {
  const shortages = [];
  const requiredByProduct = new Map();
  const names = new Map();
  for (const item of items || []) {
    const code = normalizeCode(item.productCode || item.code || item.sku);
    if (!code) continue;
    names.set(code, item.productName || item.name || '');
    requiredByProduct.set(code, (requiredByProduct.get(code) || 0) + normalizeQuantity(item.quantity ?? item.required ?? item.qty));
  }
  for (const [code, required] of requiredByProduct.entries()) {
    const available = await getAvailableStock(code, warehouseCode);
    if (available < required) shortages.push({ productCode: code, productName: names.get(code) || '', required, available, shortage: required - available });
  }
  return { enough: shortages.length === 0, shortages };
}

module.exports = { getAvailableStock, checkInventoryEnough };
