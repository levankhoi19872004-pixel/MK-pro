'use strict';

const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Staff = require('../models/Staff');
const SalesOrder = require('../models/SalesOrder');
const Inventory = require('../models/Inventory');
const { escapeRegex } = require('../utils/query.util');

const SEARCH_RETURN_MAX = 50;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function parseLimit(query = {}, fallback = SEARCH_RETURN_MAX, max = SEARCH_RETURN_MAX) {
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

function uniqueBy(rows = [], keyFields = []) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFields.map((field) => String(row?.[field] || '').trim()).find(Boolean)
      || String(row?._id || '').trim();
    if (!key) continue;
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

function productSearchText(row = {}) {
  return normalizeText([
    row.code, row.sku, row.productCode, row.name, row.productName,
    row.barcode, row.category, row.brand, row.packing, row.unit, row.baseUnit,
    row.searchText
  ].filter(Boolean).join(' '));
}

function customerSearchText(row = {}) {
  return normalizeText([
    row.code, row.customerCode, row.name, row.customerName, row.phone,
    row.address, row.area, row.route, row.staffCode, row.staffName, row.searchText
  ].filter(Boolean).join(' '));
}

async function findProducts(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  const nq = normalizeText(q);
  const limit = parseLimit(query);
  const baseFilter = activeFilter(query);
  const select = 'id code sku productCode name productName unit baseUnit conversionRate packing barcode category brand salePrice price minStock maxStock isActive searchText';

  if (!q) {
    return Product.find(baseFilter)
      .select(select)
      .sort({ code: 1 })
      .limit(limit)
      .lean();
  }

  // Phase 3.6 fixed: trả tối đa 50 kết quả nhưng nguồn tìm kiếm là TOÀN BỘ Mongo,
  // không phải 50/100 sản phẩm đầu tiên. Ưu tiên query bằng index/regex trước.
  const mongoFilter = { ...baseFilter };
  const ors = regexOr(q, ['code', 'sku', 'productCode', 'name', 'productName', 'barcode', 'category', 'brand', 'packing', 'unit', 'baseUnit', 'searchText']);
  if (nq && nq !== q.toLowerCase()) ors.push({ searchText: { $regex: escapeRegex(nq), $options: 'i' } });
  if (ors.length) mongoFilter.$or = ors;

  const directRows = await Product.find(mongoFilter)
    .select(select)
    .sort({ code: 1 })
    .limit(limit)
    .lean();

  if (directRows.length >= limit) return directRows;

  // Fallback bắt buộc cho dữ liệu cũ chưa có searchText hoặc tên có dấu.
  // Không giới hạn nguồn 100 dòng đầu; quét toàn bộ catalog active trên server rồi chỉ trả limit kết quả.
  const scanned = await Product.find(baseFilter)
    .select(select)
    .sort({ code: 1 })
    .lean();

  const matched = scanned.filter((row) => productSearchText(row).includes(nq)).slice(0, limit);
  return uniqueBy([...directRows, ...matched], ['code', 'productCode', 'sku']).slice(0, limit);
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
  const nq = normalizeText(q);
  const limit = parseLimit(query);
  const baseFilter = activeFilter(query);
  const select = 'code customerCode name customerName phone address area route staffCode staffName openingDebt debtLimit debtAmount currentDebt debt balance isActive searchText';

  if (!q) {
    return Customer.find(baseFilter)
      .select(select)
      .sort({ code: 1 })
      .limit(limit)
      .lean();
  }

  const mongoFilter = { ...baseFilter };
  const ors = regexOr(q, ['code', 'customerCode', 'name', 'customerName', 'phone', 'address', 'area', 'route', 'staffCode', 'staffName', 'searchText']);
  if (nq && nq !== q.toLowerCase()) ors.push({ searchText: { $regex: escapeRegex(nq), $options: 'i' } });
  if (ors.length) mongoFilter.$or = ors;

  const directRows = await Customer.find(mongoFilter)
    .select(select)
    .sort({ code: 1 })
    .limit(limit)
    .lean();

  if (directRows.length >= limit) return directRows;

  const scanned = await Customer.find(baseFilter)
    .select(select)
    .sort({ code: 1 })
    .lean();

  const matched = scanned.filter((row) => customerSearchText(row).includes(nq)).slice(0, limit);
  return uniqueBy([...directRows, ...matched], ['code', 'customerCode']).slice(0, limit);
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
    .limit(parseLimit(query, q ? 50 : 50, 50))
    .lean();
}

module.exports = {
  findProducts,
  findInventoriesForProducts,
  findCustomers,
  findMonthOrdersForCustomers,
  findStaffs
};
