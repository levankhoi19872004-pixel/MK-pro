'use strict';

const productRepository = require('../../repositories/productRepository');
const ProductCatalogExportPolicy = require('../../domain/catalog/ProductCatalogExportPolicy');

const PRODUCT_CODE_KEYS = Object.freeze([
  'productCode', 'sku', 'barcode', 'productId',
  'MaSP', 'MaSanPham', 'Mã SP', 'Mã sản phẩm'
]);

function cleanText(value) {
  return String(value ?? '').trim();
}

function toNumberOrBlank(value) {
  if (value === '' || value === null || value === undefined) return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

function normalizeKey(value) {
  return cleanText(value).toUpperCase();
}

function productCodeOf(row = {}, keys = PRODUCT_CODE_KEYS) {
  for (const key of keys) {
    const value = cleanText(row?.[key]);
    if (value) return value;
  }
  return '';
}

function productAliases(product = {}) {
  return [
    product.code,
    product.productCode,
    product.sku,
    product.barcode,
    product.id,
    product._id
  ].map(normalizeKey).filter(Boolean);
}

function catalogPackingQty(product = {}) {
  return ProductCatalogExportPolicy.packingQty(product);
}

function catalogSalePrice(product = {}) {
  return ProductCatalogExportPolicy.salePrice(product);
}

function buildProductMap(products = []) {
  const map = new Map();
  for (const product of products || []) {
    for (const alias of productAliases(product)) map.set(alias, product);
  }
  return map;
}

function productFromMap(productMap = new Map(), code = '') {
  return productMap.get(normalizeKey(code)) || null;
}

function catalogMeta(productMap = new Map(), row = {}, options = {}) {
  const code = productCodeOf(row, options.productCodeKeys || PRODUCT_CODE_KEYS);
  const product = productFromMap(productMap, code);
  if (!product) {
    return {
      productCode: code,
      product: null,
      found: false,
      packingQty: '',
      salePrice: ''
    };
  }
  return {
    productCode: code,
    product,
    found: true,
    packingQty: catalogPackingQty(product),
    salePrice: catalogSalePrice(product)
  };
}

function uniqueProductCodes(rows = [], options = {}) {
  const keys = options.productCodeKeys || PRODUCT_CODE_KEYS;
  return [...new Set((rows || []).map((row) => productCodeOf(row, keys)).filter(Boolean))];
}

async function loadProductMap(codes = []) {
  const values = [...new Set((codes || []).map(cleanText).filter(Boolean))];
  if (!values.length) return new Map();
  const products = await productRepository.findByCodes(values);
  return buildProductMap(products);
}

async function loadProductMapForRows(rows = [], options = {}) {
  return loadProductMap(uniqueProductCodes(rows, options));
}

function enrichRowsWithProductCatalog(rows = [], productMap = new Map(), options = {}) {
  const packingKey = options.packingKey || 'catalogPackingQty';
  const salePriceKey = options.salePriceKey || 'catalogSalePrice';
  const warningKey = options.warningKey || '';
  return (rows || []).map((row) => {
    const meta = catalogMeta(productMap, row, options);
    if (!meta.productCode) return { ...row };
    const enriched = {
      ...row,
      [packingKey]: meta.packingQty,
      [salePriceKey]: meta.salePrice
    };
    if (warningKey) enriched[warningKey] = meta.found ? '' : 'Mã sản phẩm không tồn tại trong danh mục';
    return enriched;
  });
}

async function enrichRows(rows = [], options = {}) {
  const productMap = await loadProductMapForRows(rows, options);
  return {
    rows: enrichRowsWithProductCatalog(rows, productMap, options),
    productMap,
    hasProducts: uniqueProductCodes(rows, options).length > 0
  };
}

function documentProductLines(documents = []) {
  const lines = [];
  for (const document of documents || []) {
    const items = Array.isArray(document.items)
      ? document.items
      : (Array.isArray(document.lines) ? document.lines : (Array.isArray(document.details) ? document.details : []));
    const documentCode = cleanText(
      document.code || document.id || document.orderCode || document.documentCode || document.salesOrderCode || document._id
    );
    for (const item of items) lines.push({ ...item, documentCode });
  }
  return lines;
}

module.exports = {
  PRODUCT_CODE_KEYS,
  productCodeOf,
  catalogPackingQty,
  catalogSalePrice,
  buildProductMap,
  productFromMap,
  catalogMeta,
  uniqueProductCodes,
  loadProductMap,
  loadProductMapForRows,
  enrichRowsWithProductCatalog,
  enrichRows,
  documentProductLines
};
