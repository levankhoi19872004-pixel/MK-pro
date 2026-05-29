'use strict';

const productRepository = require('../repositories/productRepository');
const { toNumber, normalizePacking, formatCaseLooseQty } = require('../utils/common.util');

function pickProductPayload(body = {}) {
  return {
    code: String(body.code || body.sku || body.productCode || '').trim(),
    name: String(body.name || body.productName || '').trim(),
    ...normalizePacking(body),
    barcode: String(body.barcode || '').trim(),
    category: String(body.category || '').trim(),
    brand: String(body.brand || '').trim(),
    costPrice: toNumber(body.costPrice),
    salePrice: toNumber(body.salePrice),
    minStock: toNumber(body.minStock),
    maxStock: toNumber(body.maxStock),
    openingStock: toNumber(body.openingStock),
    availableStock: toNumber(body.availableStock ?? body.stockQuantity ?? body.openingStock),
    isActive: body.isActive !== false
  };
}

function validateProduct(payload) {
  if (!payload.code) return 'Thiếu mã sản phẩm';
  if (!payload.name) return 'Thiếu tên sản phẩm';
  if (payload.conversionRate < 1) return 'Quy đổi phải lớn hơn hoặc bằng 1';
  if (payload.costPrice < 0 || payload.salePrice < 0) return 'Giá nhập / giá bán không được âm';
  if (payload.minStock < 0 || payload.maxStock < 0) return 'Tồn tối thiểu / tối đa không được âm';
  if (payload.maxStock > 0 && payload.minStock > payload.maxStock) return 'Tồn tối thiểu không được lớn hơn tồn tối đa';
  return '';
}

function toClient(product) {
  const raw = typeof product?.toObject === 'function' ? product.toObject() : (product || {});
  const code = String(raw.code || raw.sku || raw.productCode || raw.id || raw._id || '').trim();
  const stockQuantity = toNumber(raw.availableStock ?? raw.stockQuantity ?? raw.availableQty ?? raw.openingStock ?? 0);
  return {
    ...raw,
    code,
    sku: raw.sku || code,
    productCode: raw.productCode || code,
    id: code,
    _id: raw._id ? String(raw._id) : undefined,
    stockQuantity,
    availableQty: stockQuantity,
    stockDisplay: formatCaseLooseQty(stockQuantity, raw.conversionRate || 1),
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : raw.createdAt,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : raw.updatedAt
  };
}

async function listProducts(query) {
  const result = await productRepository.findAll(query);
  if (result && Array.isArray(result.rows)) {
    return { products: result.rows.map(toClient), meta: result.meta };
  }
  return { products: (result || []).map(toClient), meta: null };
}

async function searchProducts(query) {
  const products = await productRepository.search(query);
  return products.map(toClient);
}

async function createProduct(body) {
  const payload = pickProductPayload(body);
  const error = validateProduct(payload);
  if (error) return { error, status: 400 };
  if (await productRepository.findDuplicateCode(payload.code)) return { error: 'Mã sản phẩm đã tồn tại trong MongoDB', status: 409 };
  if (payload.barcode && await productRepository.findDuplicateBarcode(payload.barcode)) return { error: 'Mã vạch đã tồn tại trong MongoDB', status: 409 };
  const product = await productRepository.create(payload);
  return { product: toClient(product) };
}

async function updateProduct(id, body) {
  const current = await productRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy sản phẩm trong MongoDB', status: 404 };
  const payload = pickProductPayload(body);
  const error = validateProduct(payload);
  if (error) return { error, status: 400 };
  if (await productRepository.findDuplicateCode(payload.code, current._id)) return { error: 'Mã sản phẩm đã tồn tại trong MongoDB', status: 409 };
  if (payload.barcode && await productRepository.findDuplicateBarcode(payload.barcode, current._id)) return { error: 'Mã vạch đã tồn tại trong MongoDB', status: 409 };
  Object.assign(current, payload);
  await productRepository.save(current);
  return { product: toClient(current) };
}

async function setProductStatus(id, isActive) {
  const product = await productRepository.findByIdOrCode(id);
  if (!product) return { error: 'Không tìm thấy sản phẩm trong MongoDB', status: 404 };
  product.isActive = isActive !== false;
  await productRepository.save(product);
  return { product: toClient(product) };
}

module.exports = {
  listProducts,
  searchProducts,
  createProduct,
  updateProduct,
  setProductStatus,
  toClient
};
