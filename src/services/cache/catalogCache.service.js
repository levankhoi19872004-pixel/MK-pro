'use strict';

const memoryCache = require('../../core/cache/memoryCache');
const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const User = require('../../models/User');
const Staff = require('../../models/Staff');
const Promotion = require('../../models/Promotion');
const Warehouse = require('../../models/Warehouse');

const TTL = {
  products: 5 * 60 * 1000,
  customers: 5 * 60 * 1000,
  staffs: 10 * 60 * 1000,
  promotions: 3 * 60 * 1000,
  warehouses: 30 * 60 * 1000
};

async function cached(key, ttl, loader) {
  const cachedValue = memoryCache.get(`catalog:${key}`);
  if (cachedValue !== undefined) return cachedValue;
  const value = await loader();
  return memoryCache.set(`catalog:${key}`, value, ttl);
}

function leanFind(Model, filter = {}) {
  return Model.find(filter).lean();
}

function getProductCatalog() {
  return cached('products', TTL.products, () => leanFind(Product, { isActive: { $ne: false } }));
}

function getCustomerCatalog() {
  return cached('customers', TTL.customers, () => leanFind(Customer, { isActive: { $ne: false } }));
}

async function getStaffCatalog() {
  return cached('staffs', TTL.staffs, async () => {
    const [users, staffs] = await Promise.all([
      leanFind(User, { isActive: { $ne: false } }).catch(() => []),
      leanFind(Staff, { isActive: { $ne: false } }).catch(() => [])
    ]);
    return [...(users || []), ...(staffs || [])];
  });
}

function getPromotionCatalog() {
  return cached('promotions', TTL.promotions, () => leanFind(Promotion, { isActive: { $ne: false } }));
}

function getWarehouseCatalog() {
  return cached('warehouses', TTL.warehouses, () => leanFind(Warehouse, {}));
}

function invalidateCatalog(type = '') {
  const clean = String(type || '').trim();
  if (!clean || clean === 'all') return memoryCache.clearByPrefix('catalog:');
  return memoryCache.clearByPrefix(`catalog:${clean}`);
}

module.exports = {
  TTL,
  getProductCatalog,
  getCustomerCatalog,
  getStaffCatalog,
  getPromotionCatalog,
  getWarehouseCatalog,
  invalidateCatalog
};
