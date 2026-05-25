const { searchCollection, suggestCollection } = require('../utils/searchEngine');
const { PRODUCT_SEARCH_FIELDS } = require('./productService');

function ensureDataShape(data) {
  if (!data.products) data.products = [];
  if (!data.customers) data.customers = [];
  if (!data.staff) data.staff = [];
  if (!data.warehouses) data.warehouses = [];
  return data;
}

const SEARCH_REGISTRY = {
  products: {
    collection: 'products',
    fields: PRODUCT_SEARCH_FIELDS,
    suggestionConfig: {
      codeField: 'code',
      nameField: 'name',
      subTextFields: ['warehouseName', 'unit']
    },
    filters: ['warehouseCode', 'category', 'brand']
  },
  customers: {
    collection: 'customers',
    fields: [
      { path: 'code', weight: 5 },
      { path: 'customerCode', weight: 5 },
      { path: 'name', weight: 4 },
      { path: 'customerName', weight: 4 },
      { path: 'phone', weight: 3 },
      { path: 'address', weight: 2 }
    ],
    suggestionConfig: {
      codeField: item => item.code || item.customerCode,
      nameField: item => item.name || item.customerName,
      subTextFields: ['address', 'phone']
    },
    filters: ['routeCode', 'staffCode', 'area']
  },
  staff: {
    collection: 'staff',
    fields: [
      { path: 'code', weight: 5 },
      { path: 'staffCode', weight: 5 },
      { path: 'name', weight: 4 },
      { path: 'staffName', weight: 4 },
      { path: 'phone', weight: 3 },
      { path: 'role', weight: 2 }
    ],
    suggestionConfig: {
      codeField: item => item.code || item.staffCode,
      nameField: item => item.name || item.staffName,
      subTextFields: ['phone', 'role']
    },
    filters: ['role', 'department']
  },
  warehouses: {
    collection: 'warehouses',
    fields: [
      { path: 'code', weight: 5 },
      { path: 'warehouseCode', weight: 5 },
      { path: 'name', weight: 4 },
      { path: 'warehouseName', weight: 4 },
      { path: 'address', weight: 2 }
    ],
    suggestionConfig: {
      codeField: item => item.code || item.warehouseCode,
      nameField: item => item.name || item.warehouseName,
      subTextFields: ['address']
    },
    filters: []
  }
};

function getSearchConfig(entity) {
  const key = String(entity || '').trim();
  const config = SEARCH_REGISTRY[key];

  if (!config) {
    throw new Error(`Search entity không hợp lệ: ${entity}`);
  }

  return config;
}

function buildFilters(query = {}, allowedFilters = []) {
  return allowedFilters.reduce((filters, field) => {
    if (query[field] !== undefined && query[field] !== '') {
      filters[field] = query[field];
    }
    return filters;
  }, {});
}

function searchByEntity(data, entity, query = {}) {
  ensureDataShape(data);

  const config = getSearchConfig(entity);

  return searchCollection({
    items: data[config.collection] || [],
    keyword: query.keyword || query.q || '',
    fields: config.fields,
    filters: buildFilters(query, config.filters),
    activeOnly: query.activeOnly === 'true' || query.activeOnly === true,
    limit: query.limit || 50
  });
}

function suggestByEntity(data, entity, query = {}) {
  ensureDataShape(data);

  const config = getSearchConfig(entity);

  return suggestCollection({
    items: data[config.collection] || [],
    keyword: query.keyword || query.q || '',
    fields: config.fields,
    filters: buildFilters(query, config.filters),
    activeOnly: query.activeOnly !== 'false',
    limit: query.limit || 20,
    suggestionConfig: config.suggestionConfig
  });
}

module.exports = {
  SEARCH_REGISTRY,
  searchByEntity,
  suggestByEntity
};
