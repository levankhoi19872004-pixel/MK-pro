const { createProduct, normalizeCode, normalizeText } = require('../models/productModel');
const { searchCollection, suggestCollection } = require('../utils/searchEngine');

const PRODUCT_SEARCH_FIELDS = [
  { path: 'code', weight: 5 },
  { path: 'barcode', weight: 5 },
  { path: 'name', weight: 4 },
  { path: 'category', weight: 2 },
  { path: 'brand', weight: 2 },
  { path: 'warehouseCode', weight: 1 },
  { path: 'warehouseName', weight: 1 }
];

function ensureDataShape(data) {
  if (!data.products) data.products = [];
  return data;
}

function buildProductFilters(query = {}) {
  const filters = {};

  if (query.warehouseCode) filters.warehouseCode = query.warehouseCode;
  if (query.category) filters.category = query.category;
  if (query.brand) filters.brand = query.brand;

  return filters;
}

function listProducts(data, query = {}) {
  ensureDataShape(data);

  return searchCollection({
    items: data.products,
    keyword: query.keyword || query.q || '',
    fields: PRODUCT_SEARCH_FIELDS,
    filters: buildProductFilters(query),
    activeOnly: query.activeOnly === 'true' || query.activeOnly === true,
    limit: query.limit || 500
  });
}

function getProductByCode(data, code) {
  ensureDataShape(data);
  const productCode = normalizeCode(code);

  return data.products.find(product => normalizeCode(product.code) === productCode) || null;
}

function addProduct(data, input) {
  ensureDataShape(data);

  const product = createProduct(input);

  const existed = getProductByCode(data, product.code);
  if (existed) {
    throw new Error(`Mã sản phẩm ${product.code} đã tồn tại`);
  }

  data.products.push(product);
  return product;
}

function updateProduct(data, code, input) {
  ensureDataShape(data);

  const productCode = normalizeCode(code);
  const index = data.products.findIndex(product => normalizeCode(product.code) === productCode);

  if (index === -1) {
    throw new Error(`Không tìm thấy sản phẩm ${productCode}`);
  }

  const oldProduct = data.products[index];

  const updatedProduct = {
    ...oldProduct,
    ...input,
    code: oldProduct.code,
    id: oldProduct.id,
    createdAt: oldProduct.createdAt,
    updatedAt: new Date().toISOString()
  };

  data.products[index] = createProduct(updatedProduct);

  return data.products[index];
}

function deactivateProduct(data, code) {
  ensureDataShape(data);

  const product = getProductByCode(data, code);
  if (!product) {
    throw new Error(`Không tìm thấy sản phẩm ${code}`);
  }

  product.isActive = false;
  product.updatedAt = new Date().toISOString();

  return product;
}

function suggestProducts(data, keyword = '', query = {}) {
  ensureDataShape(data);

  return suggestCollection({
    items: data.products,
    keyword,
    fields: PRODUCT_SEARCH_FIELDS,
    filters: buildProductFilters(query),
    activeOnly: true,
    limit: query.limit || 20,
    suggestionConfig: {
      codeField: 'code',
      nameField: 'name',
      subTextFields: ['warehouseName', 'unit']
    }
  }).map(suggestion => ({
    code: suggestion.raw.code,
    name: suggestion.raw.name,
    unit: suggestion.raw.unit,
    barcode: suggestion.raw.barcode,
    warehouseCode: suggestion.raw.warehouseCode,
    warehouseName: suggestion.raw.warehouseName,
    salePrice: suggestion.raw.salePrice,
    text: suggestion.text
  }));
}

module.exports = {
  PRODUCT_SEARCH_FIELDS,
  listProducts,
  getProductByCode,
  addProduct,
  updateProduct,
  deactivateProduct,
  suggestProducts
};
