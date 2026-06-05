'use strict';

const { normalizeSearchText } = require('../utils/search.util');

const searchRepository = require('../repositories/searchRepository');
const queryGuard = require('../utils/queryGuard.util');
const { toNumber, stripMongoFields, formatCaseLooseQty } = require('../utils/common.util');

const ROLE_LABELS = {
  admin: 'Admin - toàn quyền',
  accountant: 'Kế toán',
  sales: 'Bán hàng',
  delivery: 'Giao hàng'
};


function productCodeOf(product = {}) {
  return String(product.code || product.sku || product.productCode || product.id || product._id || '').trim();
}

function productNameOf(product = {}) {
  return String(product.name || product.productName || '').trim();
}

function baseProductQty() {
  // Phase 3.4: products không còn là nguồn tồn.
  // Nếu chưa có inventorySnapshots thì tồn hiển thị là 0 và cần rebuild từ stockTransactions/chứng từ.
  return 0;
}

function cleanKey(value) {
  return String(value || '').trim();
}

function compactTextParts(parts = []) {
  return [...new Set((parts || [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean))];
}

function buildSuggestionMeta(parts = []) {
  const aliases = compactTextParts(parts);
  return {
    aliases,
    searchText: normalizeSearchText(aliases.join(' '))
  };
}

function buildInventoryMap(products = [], inventories = []) {
  const productKeysByCode = new Map();

  for (const product of products) {
    const code = productCodeOf(product);
    if (!code) continue;

    const keys = [
      product.code,
      product.sku,
      product.productCode,
      product.id,
      product._id,
      product._id ? String(product._id) : ''
    ]
      .map(cleanKey)
      .filter(Boolean);

    productKeysByCode.set(code, [...new Set(keys)]);
  }

  const inventoryQtyByKey = new Map();
  for (const row of inventories || []) {
    // Phase 3.4+: tồn hiển thị lấy từ inventorySnapshots/inventories.
    // Ưu tiên availableQty; nếu snapshot cũ chưa có availableQty thì tính từ onHand - reservedQty.
    const onHand = toNumber(row.onHand ?? row.qty ?? row.quantity ?? row.stockQuantity);
    const reserved = toNumber(row.reservedQty ?? row.reserved ?? 0);
    const qty = row.availableQty !== undefined && row.availableQty !== null
      ? toNumber(row.availableQty)
      : Math.max(0, onHand - reserved);

    for (const key of [
      row.productCode,
      row.productId,
      row.code,
      row.sku,
      row.product?.code,
      row.product?._id,
      row._id ? String(row._id) : ''
    ]) {
      const clean = cleanKey(key);
      if (!clean) continue;
      inventoryQtyByKey.set(clean, toNumber(inventoryQtyByKey.get(clean)) + qty);
    }
  }

  const result = new Map();
  for (const [code, keys] of productKeysByCode.entries()) {
    let matched = false;
    let qty = 0;

    for (const key of keys) {
      if (!inventoryQtyByKey.has(key)) continue;
      matched = true;
      qty += toNumber(inventoryQtyByKey.get(key));
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
  const meta = buildSuggestionMeta([
    code, product.sku, product.productCode, productNameOf(product),
    product.barcode, product.category, product.brand, product.packing,
    product.unit, product.baseUnit
  ]);
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

    // Các alias này chỉ để frontend cũ đọc được; giá trị vẫn sinh từ inventorySnapshots.
    availableQty,
    availableStock: availableQty,
    stockQuantity: availableQty,
    stock: availableQty,
    quantity: availableQty,
    openSaleQty: availableQty,
    stockDisplay,
    isOutOfStock: availableQty <= 0,

    label: [code, productNameOf(product)].filter(Boolean).join(' - '),
    value: code,
    aliases: meta.aliases,
    searchText: meta.searchText
  };
  if (options.compact) delete row.searchText;
  return row;
}

async function searchProducts(query = {}) {
  if (!queryGuard.ensureSearchKeyword(query, 2).ok) return [];
  const products = await searchRepository.findProducts({ ...(query || {}), limit: queryGuard.clampLimit(query.limit, 20, 50) });

  // Tồn mở bán là thông tin bắt buộc của gợi ý bán hàng.
  // Trước đây web chỉ lấy product.availableStock nên có thể hiện 0,
  // trong khi app mobile lấy inventories nên hiện đúng. Từ đây search chung luôn
  // đọc inventories giống app, trừ khi client cố tình truyền includeStock=0.
  const includeStock = String(query.includeStock ?? '1') !== '0';
  const inventories = includeStock ? await searchRepository.findInventoriesForProducts(products) : [];
  const inventoryMap = includeStock ? buildInventoryMap(products, inventories) : new Map();
  let suggestions = products.map((product) => toProductSuggestion(product, inventoryMap, { compact: query.compact === '1' }));
  const inStockOnly = ['1', 'true', 'yes'].includes(String(query.inStockOnly ?? query.onlyInStock ?? '').toLowerCase());
  if (inStockOnly) suggestions = suggestions.filter((row) => toNumber(row.availableQty || row.availableStock || row.stockQuantity || row.stock || row.quantity) > 0);
  return suggestions;
}

function toCustomerSuggestion(customer = {}, revenueByCustomer = new Map()) {
  const raw = stripMongoFields(customer);
  const code = String(customer.code || customer.customerCode || customer.id || customer._id || '').trim();
  const name = String(customer.name || customer.customerName || '').trim();
  const phone = String(customer.phone || customer.mobile || customer.customerPhone || '').trim();
  const debt = toNumber(customer.debtAmount ?? customer.currentDebt ?? customer.debt ?? customer.balance ?? customer.openingDebt ?? 0);
  const meta = buildSuggestionMeta([
    code, name, phone, customer.address, customer.area, customer.route,
    customer.routeName, customer.staffCode, customer.staffName
  ]);
  return {
    ...raw,
    type: 'customer',
    id: String(customer._id || customer.id || code || '').trim(),
    code,
    customerCode: customer.customerCode || code,
    name,
    customerName: customer.customerName || name,
    phone,
    debtAmount: debt,
    currentDebt: debt,
    monthRevenue: toNumber(revenueByCustomer.get(code)),
    label: [code, name, phone].filter(Boolean).join(' - '),
    value: code,
    aliases: meta.aliases,
    searchText: meta.searchText
  };
}

function allowsEmptyCustomerSearch(query = {}) {
  return ['1', 'true', 'yes'].includes(String(query.allowEmpty ?? query.showOnFocus ?? query.initial ?? '').toLowerCase());
}

async function searchCustomers(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  if (!q && !allowsEmptyCustomerSearch(query)) return [];
  if (q && !queryGuard.ensureSearchKeyword(query, 2).ok) return [];
  const customers = await searchRepository.findCustomers({ ...(query || {}), limit: queryGuard.clampLimit(query.limit, 20, 50) });
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
  const roleRaw = String(staff.role || staff.type || staff.roleCode || '').trim().toLowerCase();
  const role = ['admin', 'accountant', 'sales', 'delivery'].includes(roleRaw)
    ? roleRaw
    : (staff.isDelivery ? 'delivery' : staff.isSalesman || staff.isSalesStaff ? 'sales' : 'sales');
  const code = String(staff.code || staff.staffCode || staff.username || staff._id || '').trim();
  const username = String(staff.username || code || '').trim();
  const name = String(staff.name || staff.fullName || staff.displayName || username || code || '').trim();
  const phone = String(staff.phone || staff.mobile || staff.tel || '').trim();
  const type = role === 'delivery' ? 'deliveryStaff' : 'salesStaff';
  const meta = buildSuggestionMeta([
    code, username, name, staff.fullName, staff.displayName, phone,
    role, ROLE_LABELS[role], staff.position, staff.department
  ]);
  return {
    ...raw,
    type,
    staffType: type,
    id: String(staff._id || staff.id || code || username || '').trim(),
    code,
    staffCode: staff.staffCode || code,
    username,
    name,
    fullName: staff.fullName || name,
    phone,
    role,
    roleLabel: ROLE_LABELS[role] || role,
    label: [code || username, name, phone].filter(Boolean).join(' - '),
    value: code || username,
    aliases: meta.aliases,
    searchText: meta.searchText
  };
}

function allowsEmptyStaffSearch(query = {}) {
  return ['1', 'true', 'yes'].includes(String(query.allowEmpty ?? query.showOnFocus ?? query.initial ?? '').toLowerCase());
}

async function searchStaffs(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  if (!q && !allowsEmptyStaffSearch(query)) return [];
  if (q && !queryGuard.ensureSearchKeyword(query, 2).ok) return [];
  const staffs = await searchRepository.findStaffs({ ...(query || {}), limit: queryGuard.clampLimit(query.limit, 20, 50) });
  return staffs.map(toStaffSuggestion);
}


function toOrderSuggestion(order = {}, type = 'order') {
  const raw = stripMongoFields(order);
  const code = String(order.code || order.orderCode || order.salesOrderCode || order.id || '').trim();
  return {
    ...raw,
    type,
    id: String(order.id || order._id || code || '').trim(),
    code,
    orderCode: order.orderCode || order.salesOrderCode || code,
    customerCode: order.customerCode || '',
    customerName: order.customerName || '',
    staffCode: order.staffCode || '',
    staffName: order.staffName || '',
    deliveryStaffCode: order.deliveryStaffCode || '',
    deliveryStaffName: order.deliveryStaffName || '',
    date: order.date || order.orderDate || order.deliveryDate || '',
    totalAmount: toNumber(order.totalAmount || order.amount || order.grandTotal),
    label: [code, order.customerName, order.deliveryStaffName, order.date || order.deliveryDate].filter(Boolean).join(' - '),
    value: code
  };
}

async function searchOrders(query = {}) {
  if (!queryGuard.ensureSearchKeyword(query, 2).ok) return [];
  const rows = await searchRepository.findOrders({ ...(query || {}), limit: queryGuard.clampLimit(query.limit, 20, 50) });
  return rows.map((row) => toOrderSuggestion(row, 'order'));
}

async function searchMasterOrders(query = {}) {
  if (!queryGuard.ensureSearchKeyword(query, 2).ok) return [];
  const rows = await searchRepository.findMasterOrders({ ...(query || {}), limit: queryGuard.clampLimit(query.limit, 20, 50) });
  return rows.map((row) => toOrderSuggestion(row, 'masterOrder'));
}

function toDebtSuggestion(row = {}) {
  const raw = stripMongoFields(row);
  const code = String(row.code || row.refCode || row.orderCode || row.id || '').trim();
  const amount = toNumber(row.amount || row.debit || row.credit);
  return {
    ...raw,
    type: 'arLedger',
    id: String(row.id || row._id || code || '').trim(),
    code,
    refCode: row.refCode || '',
    orderCode: row.orderCode || row.refCode || '',
    customerCode: row.customerCode || '',
    customerName: row.customerName || '',
    date: row.date || '',
    amount,
    label: [code, row.customerName, row.type, amount ? amount.toLocaleString('vi-VN') : ''].filter(Boolean).join(' - '),
    value: code
  };
}

async function searchDebt(query = {}) {
  if (!queryGuard.ensureSearchKeyword(query, 2).ok) return [];
  const rows = await searchRepository.findArLedger({ ...(query || {}), limit: queryGuard.clampLimit(query.limit, 20, 50) });
  return rows.map(toDebtSuggestion);
}

async function search(type, query = {}) {
  const normalizedType = String(type || query.type || '').trim().toLowerCase();
  if (['product', 'products', 'stock'].includes(normalizedType)) return searchProducts({ ...query, includeStock: normalizedType === 'stock' ? '1' : query.includeStock });
  if (['customer', 'customers'].includes(normalizedType)) return searchCustomers(query);
  if (['staff', 'staffs', 'user', 'users'].includes(normalizedType)) return searchStaffs(query);
  if (['sales-staff', 'sales_staff', 'salesstaff', 'sales'].includes(normalizedType)) return searchStaffs({ ...query, role: 'sales' });
  if (['delivery-staff', 'delivery_staff', 'deliverystaff', 'delivery'].includes(normalizedType)) return searchStaffs({ ...query, role: 'delivery' });
  if (['order', 'orders'].includes(normalizedType)) return searchOrders(query);
  if (['master-order', 'master-orders', 'master_order', 'master_orders'].includes(normalizedType)) return searchMasterOrders(query);
  if (['ar-ledger', 'ar_ledger', 'debt', 'debts'].includes(normalizedType)) return searchDebt(query);
  return [];
}

module.exports = {
  normalizeSearchText,
  search,
  searchProducts,
  searchCustomers,
  searchStaffs,
  searchOrders,
  searchMasterOrders,
  searchDebt,
  toProductSuggestion,
  toCustomerSuggestion,
  toStaffSuggestion
};
