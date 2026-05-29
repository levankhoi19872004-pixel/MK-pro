'use strict';

const searchRepository = require('../repositories/searchRepository');
const { toNumber, stripMongoFields, formatCaseLooseQty } = require('../utils/common.util');

const ROLE_LABELS = {
  admin: 'Admin - toàn quyền',
  accountant: 'Kế toán',
  sales: 'Bán hàng',
  delivery: 'Giao hàng'
};

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase();
}

function productCodeOf(product = {}) {
  return String(product.code || product.sku || product.productCode || product.id || product._id || '').trim();
}

function productNameOf(product = {}) {
  return String(product.name || product.productName || '').trim();
}

function baseProductQty(product = {}) {
  return toNumber(
    product.availableStock ??
    product.stockQuantity ??
    product.availableQty ??
    product.openingStock ??
    product.stock ??
    product.quantity ??
    product.qty ??
    product.tonKho ??
    product.tonDau
  );
}

function buildInventoryMap(products = [], inventories = []) {
  const keysByCode = new Map();
  for (const product of products) {
    const code = productCodeOf(product);
    if (!code) continue;
    const keys = [product.code, product.sku, product.productCode, product.id, product._id]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    keysByCode.set(code, keys);
  }

  const qtyByKey = new Map();
  for (const row of inventories || []) {
    const qty = toNumber(row.availableQty ?? row.qty ?? row.quantity ?? row.stockQuantity ?? row.onHand);
    for (const key of [row.productCode, row.productId, row.code]) {
      const clean = String(key || '').trim();
      if (!clean) continue;
      qtyByKey.set(clean, toNumber(qtyByKey.get(clean)) + qty);
    }
  }

  const result = new Map();
  for (const [code, keys] of keysByCode.entries()) {
    let matched = false;
    let qty = 0;
    for (const key of keys) {
      if (!qtyByKey.has(key)) continue;
      matched = true;
      qty += toNumber(qtyByKey.get(key));
    }
    result.set(code, { matched, qty });
  }
  return result;
}

function toProductSuggestion(product = {}, inventoryMap = new Map(), options = {}) {
  const raw = stripMongoFields(product);
  const code = productCodeOf(product);
  const conversionRate = Math.max(1, toNumber(product.conversionRate || product.qtyPerCase || product.packingQty || 1));
  const inventory = inventoryMap.get(code);

  // Phase 3.2 fix:
  // Unified Search phải dùng cùng logic tồn mở bán với app mobile.
  // Nếu collection inventories đã có snapshot cho sản phẩm thì dùng snapshot đó,
  // kể cả snapshot bằng 0. Nếu chưa có snapshot thì mới fallback về tồn trên products.
  const availableQty = inventory?.matched ? toNumber(inventory.qty) : baseProductQty(product);
  const stockDisplay = formatCaseLooseQty(availableQty, conversionRate);
  const salePrice = toNumber(product.salePrice || product.price);
  const row = {
    ...raw,
    type: 'product',
    id: code,
    code,
    sku: product.sku || code,
    productCode: product.productCode || code,
    name: productNameOf(product),
    productName: productNameOf(product),
    price: salePrice,
    salePrice,
    conversionRate,

    // Đồng bộ field tồn cho cả web và mobile:
    // frontend cũ có thể đọc availableStock/stockQuantity,
    // frontend mới đọc availableQty/stockDisplay.
    availableQty,
    availableStock: availableQty,
    stockQuantity: availableQty,
    stock: availableQty,
    quantity: availableQty,
    openSaleQty: availableQty,
    stockDisplay,
    isOutOfStock: availableQty <= 0,

    label: `${code} - ${productNameOf(product)}`,
    value: code,
    searchText: normalizeSearchText([code, product.sku, product.productCode, productNameOf(product), product.barcode, product.category, product.brand, product.packing, product.unit, product.baseUnit].filter(Boolean).join(' '))
  };
  if (options.compact) delete row.searchText;
  return row;
}

async function searchProducts(query = {}) {
  const products = await searchRepository.findProducts(query);

  // Tồn mở bán là thông tin bắt buộc của gợi ý bán hàng.
  // Trước đây web chỉ lấy product.availableStock nên có thể hiện 0,
  // trong khi app mobile lấy inventories nên hiện đúng. Từ đây search chung luôn
  // đọc inventories giống app, trừ khi client cố tình truyền includeStock=0.
  const includeStock = String(query.includeStock ?? '1') !== '0';
  const inventories = includeStock ? await searchRepository.findInventoriesForProducts(products) : [];
  const inventoryMap = includeStock ? buildInventoryMap(products, inventories) : new Map();
  return products.map((product) => toProductSuggestion(product, inventoryMap, { compact: query.compact === '1' }));
}

function toCustomerSuggestion(customer = {}, revenueByCustomer = new Map()) {
  const raw = stripMongoFields(customer);
  const code = String(customer.code || customer.customerCode || customer.id || customer._id || '').trim();
  const name = String(customer.name || customer.customerName || '').trim();
  const debt = toNumber(customer.debtAmount ?? customer.currentDebt ?? customer.debt ?? customer.balance ?? customer.openingDebt ?? 0);
  return {
    ...raw,
    type: 'customer',
    id: code,
    code,
    customerCode: customer.customerCode || code,
    name,
    customerName: customer.customerName || name,
    debtAmount: debt,
    currentDebt: debt,
    monthRevenue: toNumber(revenueByCustomer.get(code)),
    label: `${code} - ${name}`,
    value: code,
    searchText: normalizeSearchText([code, name, customer.phone, customer.address, customer.area, customer.route, customer.staffCode, customer.staffName].filter(Boolean).join(' '))
  };
}

async function searchCustomers(query = {}) {
  const customers = await searchRepository.findCustomers(query);
  let revenueByCustomer = new Map();
  const includeMetrics = ['1', 'true', 'yes'].includes(String(query.includeMetrics ?? query.mobile ?? '').toLowerCase());
  if (includeMetrics) {
    const now = new Date();
    const monthPrefix = String(query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).slice(0, 7);
    const codes = customers.map((customer) => String(customer.code || customer.customerCode || '').trim()).filter(Boolean);
    const orders = await searchRepository.findMonthOrdersForCustomers(codes, monthPrefix);
    revenueByCustomer = new Map();
    for (const order of orders) {
      const key = String(order.customerCode || '').trim();
      revenueByCustomer.set(key, toNumber(revenueByCustomer.get(key)) + toNumber(order.totalAmount || order.amount || order.grandTotal || order.payableAmount));
    }
  }
  return customers.map((customer) => toCustomerSuggestion(customer, revenueByCustomer));
}

function toStaffSuggestion(staff = {}) {
  const raw = stripMongoFields(staff);
  const role = ['admin', 'accountant', 'sales', 'delivery'].includes(String(staff.role || staff.type || '').trim())
    ? String(staff.role || staff.type).trim()
    : (staff.isDelivery ? 'delivery' : staff.isSalesman ? 'sales' : 'sales');
  const code = String(staff.code || staff.staffCode || staff.username || staff._id || '').trim();
  const username = String(staff.username || code || '').trim();
  const name = String(staff.name || staff.fullName || username || code || '').trim();
  return {
    ...raw,
    type: 'staff',
    id: code,
    code,
    username,
    name,
    fullName: staff.fullName || name,
    role,
    roleLabel: ROLE_LABELS[role] || role,
    label: `${code || username} - ${name}`,
    value: code || username,
    searchText: normalizeSearchText([code, username, name, staff.fullName, staff.phone, role, ROLE_LABELS[role]].filter(Boolean).join(' '))
  };
}

async function searchStaffs(query = {}) {
  const staffs = await searchRepository.findStaffs(query);
  return staffs.map(toStaffSuggestion);
}

async function search(type, query = {}) {
  const normalizedType = String(type || query.type || '').trim().toLowerCase();
  if (['product', 'products', 'stock'].includes(normalizedType)) return searchProducts({ ...query, includeStock: normalizedType === 'stock' ? '1' : query.includeStock });
  if (['customer', 'customers'].includes(normalizedType)) return searchCustomers(query);
  if (['staff', 'staffs', 'user', 'users'].includes(normalizedType)) return searchStaffs(query);
  return [];
}

module.exports = {
  normalizeSearchText,
  search,
  searchProducts,
  searchCustomers,
  searchStaffs,
  toProductSuggestion,
  toCustomerSuggestion,
  toStaffSuggestion
};
