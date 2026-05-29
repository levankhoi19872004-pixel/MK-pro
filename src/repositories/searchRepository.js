'use strict';

const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Staff = require('../models/Staff');
const SalesOrder = require('../models/SalesOrder');
const Inventory = require('../models/Inventory');
const { escapeRegex } = require('../utils/query.util');

function parseLimit(query = {}, fallback = 20, max = 5000) {
  const requested = Number.parseInt(query.limit, 10) || fallback;
  return Math.max(1, Math.min(requested, max));
}

function activeFilter(query = {}) {
  const activeOnly = String(query.activeOnly ?? query.onlyActive ?? '1') !== '0';
  return activeOnly ? { isActive: { $ne: false } } : {};
}

function regexOr(q, fields) {
  const keyword = String(q || '').trim();
  if (!keyword) return [];
  const regex = { $regex: escapeRegex(keyword), $options: 'i' };
  return fields.map((field) => ({ [field]: regex }));
}

async function findProducts(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  const filter = activeFilter(query);
  const ors = regexOr(q, ['code', 'sku', 'productCode', 'name', 'productName', 'barcode', 'category', 'brand', 'packing', 'unit', 'baseUnit']);
  if (ors.length) filter.$or = ors;

  return Product.find(filter)
    .select('code sku productCode name productName unit baseUnit conversionRate packing barcode category brand salePrice price availableStock stockQuantity availableQty openingStock stock qty quantity isActive')
    .sort({ code: 1 })
    .limit(parseLimit(query, q ? 100 : 300, String(query.all) === '1' ? 5000 : 500))
    .lean();
}

async function findInventoriesForProducts(products = []) {
  const ids = [];
  for (const product of products) {
    for (const value of [product.code, product.sku, product.productCode, product.id, product._id]) {
      const key = String(value || '').trim();
      if (key && !ids.includes(key)) ids.push(key);
    }
  }
  if (!ids.length) return [];
  return Inventory.find({
    $or: [
      { productCode: { $in: ids } },
      { productId: { $in: ids } },
      { code: { $in: ids } }
    ]
  }).lean();
}

async function findCustomers(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  const filter = activeFilter(query);
  const ors = regexOr(q, ['code', 'customerCode', 'name', 'customerName', 'phone', 'address', 'area', 'route', 'staffCode', 'staffName']);
  if (ors.length) filter.$or = ors;

  return Customer.find(filter)
    .select('code customerCode name customerName phone address area route staffCode staffName openingDebt debtLimit debtAmount currentDebt debt balance isActive')
    .sort({ code: 1 })
    .limit(parseLimit(query, q ? 100 : 300, 1000))
    .lean();
}

async function findMonthOrdersForCustomers(customerCodes = [], monthPrefix = '') {
  if (!customerCodes.length || !monthPrefix) return [];
  return SalesOrder.find({
    customerCode: { $in: customerCodes },
    status: { $nin: ['void', 'cancelled', 'canceled', 'deleted'] },
    $or: [
      { date: { $regex: `^${escapeRegex(monthPrefix)}` } },
      { orderDate: { $regex: `^${escapeRegex(monthPrefix)}` } }
    ]
  }).select('customerCode totalAmount amount grandTotal payableAmount date orderDate status').lean();
}

async function findStaffs(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  const filter = activeFilter(query);
  const roles = Array.isArray(query.roles)
    ? query.roles
    : String(query.roles || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (roles.length) filter.role = { $in: roles };
  const ors = regexOr(q, ['code', 'staffCode', 'username', 'name', 'fullName', 'phone', 'role']);
  if (ors.length) filter.$or = ors;

  return Staff.find(filter)
    .select('code staffCode username name fullName phone role type isActive isSalesman isDelivery')
    .sort({ code: 1 })
    .limit(parseLimit(query, q ? 50 : 100, 300))
    .lean();
}

module.exports = {
  findProducts,
  findInventoriesForProducts,
  findCustomers,
  findMonthOrdersForCustomers,
  findStaffs
};
