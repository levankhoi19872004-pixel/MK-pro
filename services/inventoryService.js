'use strict';

const { AppError } = require('../utils/http');
const { num, norm } = require('../utils/format');

function getProductSku(product) {
  return String(product.sku || product.code || product.maHang || product.productCode || '').trim();
}

function getLineSku(line) {
  return String(line.sku || line.code || line.productCode || line.maHang || '').trim();
}

function getProductQty(product) {
  return num(product.qty ?? product.quantity ?? product.stock ?? product.tonKho);
}

function setProductQty(product, qty) {
  if (Object.prototype.hasOwnProperty.call(product, 'qty')) product.qty = qty;
  else if (Object.prototype.hasOwnProperty.call(product, 'quantity')) product.quantity = qty;
  else if (Object.prototype.hasOwnProperty.call(product, 'stock')) product.stock = qty;
  else if (Object.prototype.hasOwnProperty.call(product, 'tonKho')) product.tonKho = qty;
  else product.qty = qty;
}

function findProduct(products, sku) {
  const key = norm(sku);
  return (products || []).find(p => norm(getProductSku(p)) === key);
}

function validateOrderStock(data, items) {
  const problems = [];
  for (const item of items || []) {
    const sku = getLineSku(item);
    const qty = num(item.qty ?? item.quantity);
    if (!sku || qty <= 0) continue;
    const product = findProduct(data.products || [], sku);
    if (!product) continue;
    const stock = getProductQty(product);
    if (stock < qty) {
      problems.push({ sku, name: item.name || item.productName || product.name || product.tenHang || '', stock, requested: qty });
    }
  }
  if (problems.length) {
    throw new AppError('Không đủ tồn kho để tạo đơn', 409, 'INSUFFICIENT_STOCK', problems);
  }
}

function decreaseStockForOrder(data, order) {
  data.products = Array.isArray(data.products) ? data.products : [];
  if (order.stockDeducted === true) return { changed: false, reason: 'already_deducted' };

  validateOrderStock(data, order.items || []);

  for (const item of order.items || []) {
    const sku = getLineSku(item);
    const qty = num(item.qty ?? item.quantity);
    if (!sku || qty <= 0) continue;
    const product = findProduct(data.products, sku);
    if (!product) continue;
    setProductQty(product, getProductQty(product) - qty);
  }

  order.stockDeducted = true;
  order.stockDeductedAt = new Date().toISOString();
  return { changed: true };
}

function increaseStockForOrder(data, order) {
  data.products = Array.isArray(data.products) ? data.products : [];
  if (order.stockDeducted !== true) return { changed: false, reason: 'not_deducted' };

  for (const item of order.items || []) {
    const sku = getLineSku(item);
    const qty = num(item.qty ?? item.quantity);
    if (!sku || qty <= 0) continue;
    const product = findProduct(data.products, sku);
    if (!product) continue;
    setProductQty(product, getProductQty(product) + qty);
  }

  order.stockDeducted = false;
  order.stockReturnedAt = new Date().toISOString();
  return { changed: true };
}

module.exports = {
  getProductSku,
  getLineSku,
  getProductQty,
  setProductQty,
  findProduct,
  validateOrderStock,
  decreaseStockForOrder,
  increaseStockForOrder
};
