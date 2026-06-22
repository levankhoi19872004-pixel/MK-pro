'use strict';

const { normalizeText } = require('../utils/search.util');

const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Staff = require('../models/Staff');
const User = require('../models/User');
const MasterOrder = require('../models/MasterOrder');
const Journal = require('../models/Journal');
const SalesOrder = require('../models/SalesOrder');
const inventoryStockService = require('../services/inventoryStock.service');
const { escapeRegex } = require('../utils/query.util');
const { customerOwnershipFilter, combineFilters } = require('../domain/staff/customerOwnership');

const SEARCH_RETURN_MAX = 50;


function isNumericKeyword(value = '') {
  return /^\d+$/.test(String(value || '').trim());
}

function numericDigits(value = '') {
  return String(value ?? '').replace(/\D/g, '');
}

function priceCandidates(row = {}) {
  return [row.salePrice, row.price, row.sellPrice, row.retailPrice]
    .map((value) => numericDigits(Math.round(Number(value || 0))))
    .filter(Boolean);
}

function priceSearchScore(row = {}, nq = '') {
  const qDigits = numericDigits(nq);

  // Chỉ kích hoạt tìm theo giá khi người dùng nhập tối thiểu 4 số
  // để tránh gõ mã ngắn như 62, 627 bị lẫn với giá bán.
  if (qDigits.length < 4) return -1;

  let best = -1;
  for (const priceText of priceCandidates(row)) {
    if (!priceText) continue;
    if (priceText === qDigits) best = Math.max(best, 5500);
    else if (priceText.startsWith(qDigits)) best = Math.max(best, 4500);
    else if (priceText.includes(qDigits)) best = Math.max(best, 2500);
  }
  return best;
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
    row.barcode, row.category, row.categoryName, row.group, row.groupName, row.productGroup, row.productGroupName, row.brand, row.packing, row.unit, row.baseUnit,
    row.searchText
  ].filter(Boolean).join(' '));
}

function customerSearchText(row = {}) {
  return normalizeText([
    row.code, row.customerCode, row.name, row.customerName, row.phone,
    row.address, row.area, row.route, row.routeName, row.staffCode, row.staffName, row.searchText
  ].filter(Boolean).join(' '));
}


function codeCandidates(row = {}) {
  return [row.code, row.sku, row.productCode, row.id, row._id]
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function customerCodeCandidates(row = {}) {
  return [row.code, row.customerCode, row.id, row._id]
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function barcodeCandidates(row = {}) {
  return [row.barcode]
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function bestFieldScore(values = [], q = '', scores = {}) {
  if (!q) return 0;
  let best = -1;
  for (const value of values || []) {
    const text = normalizeText(value);
    if (!text) continue;
    if (text === q) best = Math.max(best, scores.exact ?? 1000);
    else if (text.startsWith(q)) best = Math.max(best, scores.startsWith ?? 800);
    else if (text.includes(q)) best = Math.max(best, scores.includes ?? 500);
  }
  return best;
}

function productSearchScore(row = {}, nq = '') {
  if (!nq) return 0;

  const codeScore = bestFieldScore(codeCandidates(row), nq, {
    exact: 10000,
    startsWith: 9000,
    includes: 7000
  });
  const barcodeScore = bestFieldScore(barcodeCandidates(row), nq, {
    exact: 9500,
    startsWith: 8500,
    includes: 6500
  });

  const priceScore = priceSearchScore(row, nq);

  // Khi từ khóa toàn số, ưu tiên mã sản phẩm / barcode, nhưng vẫn cho phép tìm theo giá bán
  // nếu nhập từ 4 số trở lên, ví dụ 24750 hoặc 24.750.
  // Điểm giá thấp hơn mã/barcode để gõ mã vẫn ra đúng mã trước.
  if (isNumericKeyword(nq) || numericDigits(nq).length >= 4) {
    const numericBest = Math.max(codeScore, barcodeScore, priceScore);
    if (isNumericKeyword(nq)) return numericBest;
  }

  const nameScore = bestFieldScore([row.name, row.productName], nq, {
    exact: 6000,
    startsWith: 5000,
    includes: 3000
  });
  const metaScore = bestFieldScore([row.category, row.brand, row.packing, row.unit, row.baseUnit, row.searchText], nq, {
    exact: 2000,
    startsWith: 1500,
    includes: 1000
  });

  return Math.max(codeScore, barcodeScore, nameScore, metaScore, priceScore);
}

function customerSearchScore(row = {}, nq = '') {
  if (!nq) return 0;

  const codeScore = bestFieldScore(customerCodeCandidates(row), nq, {
    exact: 10000,
    startsWith: 9000,
    includes: 7000
  });
  const phoneScore = bestFieldScore([row.phone], nq, {
    exact: 9500,
    startsWith: 8500,
    includes: 6500
  });
  const nameScore = bestFieldScore([row.name, row.customerName], nq, {
    exact: 6000,
    startsWith: 5000,
    includes: 3000
  });
  const metaScore = bestFieldScore([row.address, row.area, row.route, row.routeName, row.staffCode, row.staffName, row.searchText], nq, {
    exact: 2000,
    startsWith: 1500,
    includes: 1000
  });

  return Math.max(codeScore, phoneScore, nameScore, metaScore);
}

function sortScoredRows(rows = [], scoreFn, nq = '', limit = SEARCH_RETURN_MAX, codeFields = []) {
  return (rows || [])
    .map((row) => ({ row, score: scoreFn(row, nq) }))
    // score = 0 nghĩa là không khớp. Không được giữ lại, nếu không autocomplete sẽ fallback về danh sách đầu.
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aCode = codeFields.map((field) => String(a.row?.[field] || '').trim()).find(Boolean) || '';
      const bCode = codeFields.map((field) => String(b.row?.[field] || '').trim()).find(Boolean) || '';
      return aCode.localeCompare(bCode, 'vi', { numeric: true });
    })
    .map((item) => item.row)
    .slice(0, limit);
}

async function findProducts(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  const nq = normalizeText(q);
  const limit = parseLimit(query);
  const baseFilter = activeFilter(query);
  const select = 'id code sku productCode name productName unit baseUnit conversionRate packing barcode category categoryName group groupName productGroup productGroupName brand salePrice price minStock maxStock isActive searchText';
  // MOBILE_PRODUCT_GROUP_FILTER_REPOSITORY_START: lọc sản phẩm theo Nhóm hàng mà không phá $or tìm kiếm hiện có.
  const groupKeyword = String(query.group || query.groupName || query.category || query.categoryName || query.productGroup || query.productGroupName || '').trim();
  const groupRegex = groupKeyword ? { $regex: escapeRegex(groupKeyword), $options: 'i' } : null;
  const groupFilter = groupRegex ? {
    $or: [
      { category: groupRegex },
      { categoryName: groupRegex },
      { group: groupRegex },
      { groupName: groupRegex },
      { productGroup: groupRegex },
      { productGroupName: groupRegex }
    ]
  } : null;
  const withGroupFilter = (filter = {}) => groupFilter ? { $and: [filter, groupFilter] } : filter;
  // MOBILE_PRODUCT_GROUP_FILTER_REPOSITORY_END

  if (!q) {
    return Product.find(withGroupFilter(baseFilter))
      .select(select)
      .sort({ code: 1 })
      .limit(limit)
      .lean();
  }

  const rawRegex = { $regex: escapeRegex(q), $options: 'i' };
  const normalizedRegex = { $regex: escapeRegex(nq), $options: 'i' };
  const filter = {
    ...baseFilter,
    $or: [
      { code: rawRegex },
      { sku: rawRegex },
      { productCode: rawRegex },
      { barcode: rawRegex },
      { name: rawRegex },
      { productName: rawRegex },
      { category: rawRegex },
      { categoryName: rawRegex },
      { group: rawRegex },
      { groupName: rawRegex },
      { productGroup: rawRegex },
      { productGroupName: rawRegex },
      { brand: rawRegex },
      { packing: rawRegex },
      { unit: rawRegex },
      { baseUnit: rawRegex },
      { searchText: normalizedRegex }
    ]
  };
  const scanned = await Product.find(withGroupFilter(filter))
    .select(select)
    .sort({ code: 1 })
    .limit(Math.min(limit * 5, 250))
    .lean();

  return uniqueBy(
    sortScoredRows(scanned, productSearchScore, nq, limit, ['code', 'productCode', 'sku']),
    ['code', 'productCode', 'sku']
  ).slice(0, limit);
}

async function findInventoriesForProducts(products = []) {
  const canonicalCodes = [];
  for (const product of products || []) {
    const code = String(product.code || product.productCode || product.sku || product.id || product._id || '').trim();
    if (code && !canonicalCodes.includes(code)) canonicalCodes.push(code);
  }
  if (!canonicalCodes.length) return [];

  const stockMap = await inventoryStockService.getAvailableStocks(canonicalCodes);
  return canonicalCodes.map((code) => ({
    productCode: code,
    warehouseCode: inventoryStockService.stockWarehouseCode(),
    availableQty: Number(stockMap[inventoryStockService.normalizeProductCode(code)] || stockMap[code] || 0),
    quantity: Number(stockMap[inventoryStockService.normalizeProductCode(code)] || stockMap[code] || 0),
    qty: Number(stockMap[inventoryStockService.normalizeProductCode(code)] || stockMap[code] || 0),
    onHand: Number(stockMap[inventoryStockService.normalizeProductCode(code)] || stockMap[code] || 0),
    source: 'inventoryStock.service'
  }));
}

async function findCustomers(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  const nq = normalizeText(q);
  const limit = parseLimit(query);
  const baseFilter = activeFilter(query);
  const ownershipFilter = (query.ownerSalesStaffCode || query.ownerSalesStaffName)
    ? customerOwnershipFilter({
        salesStaffCode: query.ownerSalesStaffCode,
        salesStaffName: query.ownerSalesStaffName,
        requireIdentity: true
      })
    : {};
  const scopedBaseFilter = combineFilters(baseFilter, ownershipFilter);
  const select = 'code customerCode name customerName businessName customerBusinessName householdBusinessName taxBusinessName invoiceBusinessName tenHoKinhDoanh phone address taxCode taxInvoiceAddress customerTaxCode taxNumber vatNumber vatCode mst invoiceAddress vatInvoiceAddress billingAddress area route routeName salesStaffCode salesStaffName salesmanCode salesmanName assignedSalesStaffCode assignedSalesStaffName nvbhCode nvbhName staffCode staffName openingDebt debtLimit debtAmount currentDebt debt balance isActive searchText';

  if (!q) {
    return Customer.find(scopedBaseFilter)
      .select(select)
      .sort({ code: 1 })
      .limit(limit)
      .lean();
  }

  const rawRegex = { $regex: escapeRegex(q), $options: 'i' };
  const normalizedRegex = { $regex: escapeRegex(nq), $options: 'i' };
  const searchFilter = {
    $or: [
      { code: rawRegex },
      { customerCode: rawRegex },
      { name: rawRegex },
      { customerName: rawRegex },
      { businessName: rawRegex },
      { customerBusinessName: rawRegex },
      { householdBusinessName: rawRegex },
      { taxBusinessName: rawRegex },
      { invoiceBusinessName: rawRegex },
      { tenHoKinhDoanh: rawRegex },
      { phone: rawRegex },
      { address: rawRegex },
      { taxCode: rawRegex },
      { customerTaxCode: rawRegex },
      { taxNumber: rawRegex },
      { vatNumber: rawRegex },
      { mst: rawRegex },
      { taxInvoiceAddress: rawRegex },
      { invoiceAddress: rawRegex },
      { area: rawRegex },
      { route: rawRegex },
      { routeName: rawRegex },
      { staffCode: rawRegex },
      { staffName: rawRegex },
      { searchText: normalizedRegex }
    ]
  };
  const filter = combineFilters(scopedBaseFilter, searchFilter);
  const scanned = await Customer.find(filter)
    .select(select)
    .sort({ code: 1 })
    .limit(Math.min(limit * 5, 250))
    .lean();

  return uniqueBy(
    sortScoredRows(scanned, customerSearchScore, nq, limit, ['code', 'customerCode']),
    ['code', 'customerCode']
  ).slice(0, limit);
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


function staffRoleFilter(role = '', roles = []) {
  const wanted = [...roles, role].map((v) => String(v || '').trim().toLowerCase()).filter(Boolean);
  if (!wanted.length) return null;
  const expanded = new Set();
  for (const item of wanted) {
    expanded.add(item);
    if (['sales', 'sale', 'nvbh', 'salesstaff', 'sales_staff'].includes(item)) {
      ['sales', 'sale', 'nvbh', 'NVBH', 'salesStaff', 'sales_staff'].forEach((v) => expanded.add(v));
    }
    if (['delivery', 'shipper', 'nvgh', 'deliverystaff', 'delivery_staff'].includes(item)) {
      ['delivery', 'shipper', 'nvgh', 'NVGH', 'deliveryStaff', 'delivery_staff'].forEach((v) => expanded.add(v));
    }
  }
  return [...expanded];
}

function isRoleSpecificStaffSearch(query = {}) {
  const roleText = String(query.role || query.roles || '').toLowerCase();
  return ['sales', 'sale', 'nvbh', 'salesstaff', 'sales_staff', 'delivery', 'shipper', 'nvgh', 'deliverystaff', 'delivery_staff']
    .some((key) => roleText.includes(key));
}

function staffCodeFilterRequired(query = {}) {
  // Gợi ý NVBH/NVGH phải là nhân viên thật có mã nhân viên.
  // Không được hiện tài khoản dùng chung như `banhang` / `giaohang` vì các tài khoản này chỉ là account đăng nhập.
  // Nếu màn nào cố tình cần xem toàn bộ user account thì gọi /api/search/staffs với includeLoginAccounts=1.
  if (['1', 'true', 'yes'].includes(String(query.includeLoginAccounts || query.includeAccounts || '').toLowerCase())) return false;
  return isRoleSpecificStaffSearch(query);
}

// STAFF_SEARCH_USER_ACCOUNT_CODE_START
// Màn Tài khoản có thể lưu mã nhân viên ở users.code hoặc users.staffCode.
// Autocomplete NVBH/NVGH phải nhận các mã nghiệp vụ này, nhưng tuyệt đối không
// fallback sang username/id/_id để tránh tài khoản đăng nhập dùng chung lọt vào danh sách nhân viên.
const USER_ACCOUNT_STAFF_SEARCH_CODE_FIELDS = Object.freeze([
  'code',
  'staffCode',
  'salesStaffCode',
  'salesmanCode',
  'deliveryStaffCode',
  'shipperCode',
  'employeeCode',
  'maNhanVien'
]);

const ROLE_SPECIFIC_STAFF_CODE_FIELDS = Object.freeze({
  sales: ['code', 'staffCode', 'salesStaffCode', 'salesmanCode', 'employeeCode', 'maNhanVien'],
  delivery: ['code', 'staffCode', 'deliveryStaffCode', 'shipperCode', 'employeeCode', 'maNhanVien']
});

function normalizedRoleFamily(query = {}) {
  const roleText = String(query.role || query.roles || '').toLowerCase();
  if (['sales', 'sale', 'nvbh', 'salesstaff', 'sales_staff'].some((key) => roleText.includes(key))) return 'sales';
  if (['delivery', 'shipper', 'nvgh', 'deliverystaff', 'delivery_staff'].some((key) => roleText.includes(key))) return 'delivery';
  return '';
}

function roleSpecificStaffCodeFields(query = {}) {
  return ROLE_SPECIFIC_STAFF_CODE_FIELDS[normalizedRoleFamily(query)] || USER_ACCOUNT_STAFF_SEARCH_CODE_FIELDS;
}

function nonEmptyFieldFilter(field) {
  return {
    [field]: {
      $exists: true,
      $nin: ['', null]
    }
  };
}

function staffCodeExistsFilter(query = {}) {
  return {
    $or: roleSpecificStaffCodeFields(query).map(nonEmptyFieldFilter)
  };
}

function pickUserAccountStaffCode(row = {}, query = {}) {
  for (const field of roleSpecificStaffCodeFields(query)) {
    const value = String(row[field] || '').trim();
    if (value) return value;
  }
  for (const field of USER_ACCOUNT_STAFF_SEARCH_CODE_FIELDS) {
    const value = String(row[field] || '').trim();
    if (value) return value;
  }
  return '';
}
// STAFF_SEARCH_USER_ACCOUNT_CODE_END

async function findStaffs(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  const roles = Array.isArray(query.roles)
    ? query.roles
    : String(query.roles || query.role || '').split(',').map((v) => v.trim()).filter(Boolean);
  const normalizedRoles = staffRoleFilter(query.role, roles);
  const limit = parseLimit(query, q ? 50 : 20, 50);
  const userFilter = { ...activeFilter(query) };
  const andFilters = [];

  const scopedQuery = { ...query, roles };
  if (normalizedRoles && normalizedRoles.length) {
    const roleRegexes = normalizedRoles.map((r) => new RegExp(`^${escapeRegex(r)}$`, 'i'));
    andFilters.push({
      $or: [
        { role: { $in: roleRegexes } },
        { roles: { $in: roleRegexes } },
        { staffType: { $in: roleRegexes } },
        { type: { $in: roleRegexes } }
      ]
    });
  }

  if (staffCodeFilterRequired(scopedQuery)) {
    andFilters.push(staffCodeExistsFilter(scopedQuery));
  }

  const scopedCodeFields = roleSpecificStaffCodeFields(scopedQuery);
  const searchFields = staffCodeFilterRequired(scopedQuery)
    ? [...scopedCodeFields, 'fullName', 'name', 'phone']
    : [...USER_ACCOUNT_STAFF_SEARCH_CODE_FIELDS, 'username', 'fullName', 'name', 'phone', 'role'];
  const userSearchOrs = regexOr(q, searchFields);
  if (userSearchOrs.length) andFilters.push({ $or: userSearchOrs });
  if (andFilters.length) userFilter.$and = andFilters;

  // V45 rule: NVBH/NVGH lấy từ users có role đúng và có mã nhân viên nghiệp vụ thật.
  // Mã nghiệp vụ hợp lệ: users.code/users.staffCode hoặc các field canonical theo role.
  // Không fallback sang username cho mã nhân viên, để tránh hiện tài khoản đăng nhập dùng chung.
  const userRows = await User.find(userFilter)
    .select('id code staffCode salesStaffCode salesmanCode deliveryStaffCode shipperCode employeeCode maNhanVien username name fullName phone role isActive')
    .sort({ code: 1, staffCode: 1, username: 1 })
    .limit(limit)
    .lean();

  return uniqueBy(userRows.map((u) => {
    const realStaffCode = pickUserAccountStaffCode(u, scopedQuery);
    return {
      ...u,
      code: realStaffCode,
      staffCode: realStaffCode,
      name: u.fullName || u.name || realStaffCode,
      fullName: u.fullName || u.name || realStaffCode,
      source: 'users'
    };
  }).filter((u) => {
    if (!staffCodeFilterRequired(scopedQuery)) return true;
    return Boolean(String(u.staffCode || '').trim());
  }), ['staffCode']).slice(0, limit);
}

function orderSearchScore(row = {}, nq = '') {
  return Math.max(
    bestFieldScore([row.code, row.orderCode, row.salesOrderCode, row.id], nq, { exact: 10000, startsWith: 9000, includes: 7000 }),
    bestFieldScore([row.customerCode, row.customerName, row.staffCode, row.staffName, row.deliveryStaffCode, row.deliveryStaffName, row.date, row.deliveryDate], nq, { exact: 6000, startsWith: 5000, includes: 3000 })
  );
}

async function findOrders(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  const nq = normalizeText(q);
  const limit = parseLimit(query, 20, 50);
  const filter = {};
  if (q) filter.$or = regexOr(q, ['code', 'orderCode', 'salesOrderCode', 'customerCode', 'customerName', 'staffCode', 'staffName', 'deliveryStaffCode', 'deliveryStaffName', 'date']);
  const rows = await SalesOrder.find(filter)
    .select('id code orderCode salesOrderCode date orderDate customerCode customerName staffCode staffName deliveryStaffCode deliveryStaffName status deliveryStatus arStatus totalAmount amount grandTotal source')
    .sort({ date: -1, createdAt: -1 })
    .limit(Math.min(limit * 5, 250))
    .lean();
  return q ? sortScoredRows(rows, orderSearchScore, nq, limit, ['code', 'orderCode', 'salesOrderCode']) : rows.slice(0, limit);
}

async function findMasterOrders(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  const nq = normalizeText(q);
  const limit = parseLimit(query, 20, 50);
  const filter = {};
  if (q) filter.$or = regexOr(q, ['code', 'deliveryDate', 'deliveryStaffCode', 'deliveryStaffName', 'routeName', 'status']);
  const rows = await MasterOrder.find(filter)
    .select('id code date deliveryDate deliveryStaffCode deliveryStaffName routeName status totalAmount childOrderIds children createdAt')
    .sort({ deliveryDate: -1, createdAt: -1 })
    .limit(Math.min(limit * 5, 250))
    .lean();
  return q ? sortScoredRows(rows, orderSearchScore, nq, limit, ['code']) : rows.slice(0, limit);
}

function ledgerSearchScore(row = {}, nq = '') {
  return Math.max(
    bestFieldScore([row.code, row.id, row.refCode, row.orderCode], nq, { exact: 10000, startsWith: 9000, includes: 7000 }),
    bestFieldScore([row.customerCode, row.customerName, row.type, row.note, row.date], nq, { exact: 6000, startsWith: 5000, includes: 3000 })
  );
}

async function findArLedger(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  const nq = normalizeText(q);
  const limit = parseLimit(query, 20, 50);
  const filter = {};
  if (q) filter.$or = regexOr(q, ['code', 'id', 'refCode', 'orderCode', 'customerCode', 'customerName', 'type', 'note', 'date']);
  const rows = await Journal.find(filter)
    .select('id code type date customerCode customerName orderId orderCode refId refCode refType amount debit credit note createdAt')
    .sort({ date: -1, createdAt: -1 })
    .limit(Math.min(limit * 5, 250))
    .lean();
  return q ? sortScoredRows(rows, ledgerSearchScore, nq, limit, ['code', 'refCode', 'orderCode']) : rows.slice(0, limit);
}

module.exports = {
  findProducts,
  findInventoriesForProducts,
  findCustomers,
  findMonthOrdersForCustomers,
  findStaffs,
  findOrders,
  findMasterOrders,
  findArLedger
};
