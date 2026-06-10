'use strict';

const Product = require('../models/Product');
const { normalizeCode } = require('./commonRules');
const { makeBusinessError } = require('../utils/businessError.util');

async function resolveProductByCode(productCode) {
  const code = normalizeCode(productCode);
  if (!code) return null;
  return Product.findOne({ isActive: { $ne: false }, $or: [{ code }, { productCode: code }, { sku: code }, { barcode: code }, { id: code }] }).lean();
}

async function validateProductCode(productCode, context = {}) {
  const code = normalizeCode(productCode);
  if (!code) return { valid: false, product: null, error: makeBusinessError({ code: 'MISSING_PRODUCT_CODE', message: 'Thiếu mã sản phẩm', orderCode: context.orderCode || '', field: 'productCode' }) };
  const product = await resolveProductByCode(code);
  if (!product) return { valid: false, product: null, error: makeBusinessError({ code: 'INVALID_PRODUCT_CODE', message: `Mã sản phẩm ${code} không tồn tại trong danh mục sản phẩm`, orderCode: context.orderCode || '', field: 'productCode' }) };
  return { valid: true, product: { ...product, code: product.code || product.productCode || product.sku || code, name: product.name || product.productName || '' }, error: null };
}

module.exports = { resolveProductByCode, validateProductCode };
