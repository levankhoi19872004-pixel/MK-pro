'use strict';

const { normalizeSearchText } = require('../utils/search.util');

const productRepository = require('../repositories/productRepository');
const queryGuard = require('../utils/queryGuard.util');
const searchService = require('./searchService');
const inventoryStockService = require('./inventoryStock.service');


const { toNumber, normalizePacking, formatCaseLooseQty } = require('../utils/common.util');


function normalizeWarehouseCode(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (raw === 'KHO_PC' || raw === 'PC') return 'KHO_PC';
  if (raw === 'KHO_HC' || raw === 'HC') return 'KHO_HC';
  return 'KHO_HC';
}

function warehouseNameFromCode(code) {
  return normalizeWarehouseCode(code) === 'KHO_PC' ? 'KHO PC' : 'KHO HC';
}

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
    // HC/PC là nhóm in/gộp đơn, không phải kho tồn.
    warehouseCode: normalizeWarehouseCode(body.warehouseCode || body.warehouse || body.kho || body.printGroup),
    warehouseName: warehouseNameFromCode(body.warehouseCode || body.warehouse || body.kho || body.printGroup),
    printGroup: normalizeWarehouseCode(body.printGroup || body.warehouseCode || body.warehouse || body.kho),
    printGroupName: warehouseNameFromCode(body.printGroup || body.warehouseCode || body.warehouse || body.kho),
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
  const quantity = toNumber(snapshot.onHand ?? snapshot.availableQty ?? snapshot.availableStock ?? snapshot.stockQuantity ?? snapshot.quantity ?? snapshot.qty);
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
  // Products chỉ là danh mục. Tồn hiển thị luôn lấy từ inventories qua inventoryStock.service.
  // Nếu chưa có inventories thì hiển thị 0, không fallback về field tồn legacy trên products.
  const stockSource = snapshot || {};
  const stock = stockFromSnapshot({ ...stockSource, conversionRate: raw.conversionRate || 1 });
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
  const codes = [];

  for (const product of products || []) {
    const code = String(
      product.code ||
      product.productCode ||
      product.sku ||
      product.id ||
      product._id ||
      ''
    ).trim();

    if (code && !codes.includes(code)) codes.push(code);
  }

  if (!codes.length) return new Map();

  const stockMap = await inventoryStockService.getAvailableStocks(codes);
  const map = new Map();

  for (const product of products || []) {
    const normalizedCode = inventoryStockService.normalizeProductCode(
      product.code || product.productCode || product.sku || product.id || product._id
    );

    const qty = toNumber(stockMap[normalizedCode]);
    const row = {
      availableQty: qty,
      availableStock: qty,
      stockQuantity: qty,
      openSaleQty: qty,
      stock: qty,
      quantity: qty,
      qty
    };

    for (const key of [
      product.code,
      product.productCode,
      product.sku,
      product.id,
      product._id,
      product._id ? String(product._id) : ''
    ]) {
      const clean = String(key || '').trim();
      if (clean) map.set(clean, row);
    }
  }

  return map;
}

async function listProducts(query = {}) {
  const guardedQuery = { ...(query || {}), page: query?.page || 1, limit: queryGuard.clampLimit(query?.limit) };
  const q = String(guardedQuery.q || guardedQuery.search || '').trim();
  const allowUnfiltered = String(guardedQuery.allowAll || '') === '1';
  if (!allowUnfiltered && q.length < 2 && !guardedQuery.code && !guardedQuery.productCode && !guardedQuery.warehouseCode) {
    return { products: [], meta: { page: 1, limit: guardedQuery.limit, total: 0, message: 'Nhập ít nhất 2 ký tự để tải sản phẩm' } };
  }
  const result = await productRepository.findAll(guardedQuery);
  const rows = result && Array.isArray(result.rows) ? result.rows : (result || []);
  const snapshots = await snapshotMapForProducts(rows);
  const products = rows.map((row) => {
    const code = String(row.code || row.sku || row.productCode || row.id || row._id || '').trim();
    const snapshot = snapshots.get(code) || snapshots.get(String(row._id || '').trim()) || null;
    return toClient(row, snapshot);
  });
  return { products, meta: result && Array.isArray(result.rows) ? result.meta : null };
}

async function searchProducts(query = {}) {
  const checked = queryGuard.ensureSearchKeyword(query, 2);
  if (!checked.ok) return [];
  return searchService.searchProducts({ ...(query || {}), limit: queryGuard.clampLimit(query?.limit, 20, 50) });
}

async function createProduct(body) {
  const payload = pickProductPayload(body);
  payload.searchText = normalizeSearchText([payload.code, payload.name, payload.barcode, payload.category, payload.brand, payload.warehouseCode, payload.warehouseName, payload.printGroup, payload.printGroupName, payload.packing, payload.unit, payload.baseUnit].filter(Boolean).join(' '));
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
  payload.searchText = normalizeSearchText([payload.code, payload.name, payload.barcode, payload.category, payload.brand, payload.warehouseCode, payload.warehouseName, payload.printGroup, payload.printGroupName, payload.packing, payload.unit, payload.baseUnit].filter(Boolean).join(' '));
  const error = validateProduct(payload);
  if (error) return { error, status: 400 };
  if (await productRepository.findDuplicateCode(payload.code, current._id)) return { error: 'Mã sản phẩm đã tồn tại trong MongoDB', status: 409 };
  if (payload.barcode && await productRepository.findDuplicateBarcode(payload.barcode, current._id)) return { error: 'Mã vạch đã tồn tại trong MongoDB', status: 409 };
  payload.searchText = normalizeSearchText([payload.code, payload.name, payload.barcode, payload.category, payload.brand, payload.warehouseCode, payload.warehouseName, payload.printGroup, payload.printGroupName, payload.packing, payload.unit, payload.baseUnit].filter(Boolean).join(' '));
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
