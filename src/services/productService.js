'use strict';

const productRepository = require('../repositories/productRepository');
const searchService = require('./searchService');
const Inventory = require('../models/Inventory');

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

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
    // Phase 3.4: products chỉ lưu danh mục, không nhận/lưu số tồn.
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

function stockFromSnapshot(snapshot = {}) {
  const quantity = toNumber(snapshot.onHand ?? snapshot.availableQty ?? snapshot.quantity ?? snapshot.qty);
  return {
    availableQty: quantity,
    availableStock: quantity,
    stockQuantity: quantity,
    openSaleQty: quantity,
    stockDisplay: formatCaseLooseQty(quantity, snapshot.conversionRate || 1)
  };
}

function stripProductStockFields(raw = {}) {
  const { openingStock, availableStock, stockQuantity, availableQty, stock, quantity, qty, tonKho, tonDau, ...clean } = raw;
  return clean;
}

function toClient(product, snapshot = null) {
  const raw = typeof product?.toObject === 'function' ? product.toObject() : (product || {});
  const clean = stripProductStockFields(raw);
  const code = String(raw.code || raw.sku || raw.productCode || raw.id || raw._id || '').trim();
  const stock = stockFromSnapshot({ ...(snapshot || {}), conversionRate: raw.conversionRate || 1 });
  return {
    ...clean,
    code,
    sku: raw.sku || code,
    productCode: raw.productCode || code,
    id: code,
    _id: raw._id ? String(raw._id) : undefined,
    ...stock,
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : raw.createdAt,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : raw.updatedAt
  };
}

async function snapshotMapForProducts(products = []) {
  const keys = [];
  for (const product of products) {
    for (const value of [product.code, product.sku, product.productCode, product.id, product._id, product._id ? String(product._id) : '']) {
      const key = String(value || '').trim();
      if (key && !keys.includes(key)) keys.push(key);
    }
  }
  if (!keys.length) return new Map();

  const filter = {
    $or: [
      { productCode: { $in: keys } },
      { productId: { $in: keys } },
      { code: { $in: keys } },
      { sku: { $in: keys } }
    ]
  };

  // Phase 3.4+ strict: tồn hiển thị CHỈ đọc từ inventorySnapshots.
  // Không đọc collection legacy `inventories` để tránh cộng/hiển thị sai tồn cũ.
  const rows = await Inventory.find(filter).lean();

  const map = new Map();
  for (const row of rows) {
    const onHand = toNumber(row.onHand ?? row.qty ?? row.quantity ?? row.stockQuantity);
    const reserved = toNumber(row.reservedQty ?? row.reserved ?? 0);
    const rowQty = row.availableQty !== undefined && row.availableQty !== null
      ? toNumber(row.availableQty)
      : Math.max(0, onHand - reserved);

    for (const key of [row.productCode, row.productId, row.code, row.sku]) {
      const clean = String(key || '').trim();
      if (!clean) continue;
      const old = map.get(clean) || {};
      const qty = toNumber(old.availableQty ?? old.onHand ?? 0) + rowQty;
      map.set(clean, { ...row, availableQty: qty, onHand: qty });
    }
  }
  return map;
}

async function listProducts(query) {
  const result = await productRepository.findAll(query);
  const rows = result && Array.isArray(result.rows) ? result.rows : (result || []);
  const snapshots = await snapshotMapForProducts(rows);
  const products = rows.map((row) => {
    const code = String(row.code || row.sku || row.productCode || row.id || row._id || '').trim();
    const snapshot = snapshots.get(code) || snapshots.get(String(row._id || '').trim()) || null;
    return toClient(row, snapshot);
  });
  return { products, meta: result && Array.isArray(result.rows) ? result.meta : null };
}

async function searchProducts(query) {
  return searchService.searchProducts(query);
}

async function createProduct(body) {
  const payload = pickProductPayload(body);
  payload.searchText = normalizeSearchText([payload.code, payload.name, payload.barcode, payload.category, payload.brand, payload.packing, payload.unit, payload.baseUnit].filter(Boolean).join(' '));
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
  payload.searchText = normalizeSearchText([payload.code, payload.name, payload.barcode, payload.category, payload.brand, payload.packing, payload.unit, payload.baseUnit].filter(Boolean).join(' '));
  const error = validateProduct(payload);
  if (error) return { error, status: 400 };
  if (await productRepository.findDuplicateCode(payload.code, current._id)) return { error: 'Mã sản phẩm đã tồn tại trong MongoDB', status: 409 };
  if (payload.barcode && await productRepository.findDuplicateBarcode(payload.barcode, current._id)) return { error: 'Mã vạch đã tồn tại trong MongoDB', status: 409 };
  payload.searchText = normalizeSearchText([payload.code, payload.name, payload.barcode, payload.category, payload.brand, payload.packing, payload.unit, payload.baseUnit].filter(Boolean).join(' '));
  Object.assign(current, payload);
  // Xóa các field tồn cũ nếu còn sót trên document vì products chỉ là danh mục.
  for (const field of ['openingStock', 'availableStock', 'stockQuantity', 'availableQty', 'stock', 'quantity', 'qty', 'tonKho', 'tonDau']) {
    current[field] = undefined;
  }
  await productRepository.save(current);
  await current.collection.updateOne({ _id: current._id }, { $unset: { openingStock: 1, availableStock: 1, stockQuantity: 1, availableQty: 1, stock: 1, quantity: 1, qty: 1, tonKho: 1, tonDau: 1 } });
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
