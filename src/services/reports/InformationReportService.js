'use strict';

const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const Staff = require('../../models/Staff');
const User = require('../../models/User');
const SalesOrder = require('../../models/SalesOrder');
const arLedgerReadService = require('../arLedgerRead.service');
const SalesReportService = require('./SalesReportService');
// Phase32 legacy static compatibility marker only; runtime AR debt source remains arLedgerReadService. ArLedger.aggregate([
const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const { text } = require('./ReportDomainUtils');

const MAX_ROWS = 10000;
const INACTIVE_ORDER_STATUSES = ['void', 'cancelled', 'canceled', 'deleted', 'duplicate_cancelled'];

function regex(value) {
  const clean = text(value);
  if (!clean) return null;
  return new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function statusLabel(isActive) {
  return isActive === false ? 'Ngừng hoạt động' : 'Hoạt động';
}

function dateOnly(value) {
  return dateUtil.toDateOnly(value || '') || '';
}

function monthRange(query = {}) {
  const month = String(query.month || query.dateFrom || dateUtil.todayVN()).slice(0, 7);
  return { start: `${month}-01`, end: `${month}-31`, month };
}

function buildTextFilter(fields = [], value) {
  const pattern = regex(value);
  if (!pattern) return null;
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}

function withAnd(parts = []) {
  const clean = parts.filter(Boolean);
  if (!clean.length) return {};
  if (clean.length === 1) return clean[0];
  return { $and: clean };
}

function productFilter(query = {}) {
  return withAnd([
    buildTextFilter(['code', 'productCode', 'sku'], query.productCode || query.code),
    buildTextFilter(['name', 'productName'], query.productName || query.name),
    buildTextFilter(['category'], query.category || query.group),
    buildTextFilter(['brand'], query.brand),
    buildTextFilter(['code', 'productCode', 'sku', 'name', 'productName', 'category', 'brand', 'searchText'], query.q || query.search || query.keyword),
    String(query.status || '').trim() ? { isActive: !['inactive', '0', 'false', 'ngung', 'ngừng'].includes(String(query.status).trim().toLowerCase()) } : null
  ]);
}

function customerFilter(query = {}) {
  const salesStaff = query.salesStaff || query.salesStaffCode || query.staffCode || query.salesStaffName || query.staffName;
  return withAnd([
    buildTextFilter(['code', 'customerCode'], query.customerCode || query.code),
    buildTextFilter(['name', 'customerName', 'businessName'], query.customerName || query.name),
    buildTextFilter(['phone', 'phoneNumber', 'mobile'], query.phone),
    buildTextFilter(['route'], query.route),
    buildTextFilter(['area'], query.area || query.region),
    buildTextFilter(['staffCode', 'salesStaffCode', 'legacyStaffCode', 'staffName', 'salesStaffName', 'legacyStaffName'], salesStaff),
    buildTextFilter(['code', 'customerCode', 'name', 'customerName', 'businessName', 'phone', 'phoneNumber', 'mobile', 'address', 'route', 'area', 'searchText'], query.q || query.search || query.keyword),
    String(query.status || '').trim() ? { isActive: !['inactive', '0', 'false', 'ngung', 'ngừng'].includes(String(query.status).trim().toLowerCase()) } : null
  ]);
}

function staffFilter(query = {}) {
  return withAnd([
    buildTextFilter(['code', 'staffCode', 'id'], query.staffCode || query.code),
    buildTextFilter(['name', 'fullName'], query.staffName || query.name),
    buildTextFilter(['phone', 'phoneNumber', 'mobile'], query.phone),
    buildTextFilter(['department'], query.department),
    buildTextFilter(['position'], query.position),
    buildTextFilter(['role', 'roleLabel'], query.role),
    buildTextFilter(['code', 'staffCode', 'id', 'name', 'fullName', 'phone', 'phoneNumber', 'mobile', 'username', 'department', 'position', 'role', 'roleLabel'], query.q || query.search || query.keyword),
    String(query.status || '').trim() ? { isActive: !['inactive', '0', 'false', 'ngung', 'ngừng'].includes(String(query.status).trim().toLowerCase()) } : null
  ]);
}

function productRow(row = {}) {
  const conversionRate = toNumber(row.conversionRate || row.packing || row.packingQty || row.unitsPerCase || 1) || 1;
  return {
    productCode: text(row.code || row.productCode || row.sku),
    productName: text(row.name || row.productName),
    category: text(row.category || row.groupName),
    brand: text(row.brand),
    packing: conversionRate,
    unit: text(row.unit || row.baseUnit),
    salePrice: toNumber(row.salePrice),
    costPrice: toNumber(row.costPrice),
    status: statusLabel(row.isActive),
    createdAt: dateOnly(row.createdAt),
    updatedAt: dateOnly(row.updatedAt)
  };
}

function customerRow(row = {}, debtMap = new Map(), salesMap = new Map()) {
  const customerCode = text(row.code || row.customerCode);
  const salesStaffCode = text(row.salesStaffCode || row.staffCode || row.legacyStaffCode);
  const salesStaffName = text(row.salesStaffName || row.staffName || row.legacyStaffName);
  const monthly = salesMap.get(customerCode) || {};
  return {
    customerCode,
    customerName: text(row.name || row.customerName || row.businessName),
    address: text(row.address),
    phone: text(row.phone),
    route: text(row.route),
    area: text(row.area),
    salesStaffCode,
    salesStaffName,
    customerType: text(row.customerType || row.type || row.channel || row.segment),
    status: statusLabel(row.isActive),
    currentDebt: toNumber(debtMap.get(customerCode)),
    monthlySalesAmount: toNumber(monthly.amount),
    lastOrderDate: text(monthly.lastOrderDate),
    createdAt: dateOnly(row.createdAt)
  };
}

function staffRow(staff = {}, user = {}) {
  return {
    staffCode: text(staff.code || staff.staffCode || staff.id || user.staffCode || user.code),
    staffName: text(staff.fullName || staff.name || user.fullName || user.name),
    department: text(staff.department || user.department),
    position: text(staff.position || user.position),
    phone: text(staff.phone || user.phone),
    username: text(staff.username || user.username),
    role: text(staff.roleLabel || staff.role || user.role),
    branch: text(staff.branch || staff.branchName || user.branch || user.branchName),
    status: statusLabel(staff.isActive !== undefined ? staff.isActive : user.isActive),
    createdAt: dateOnly(staff.createdAt || user.createdAt),
    lastLoginAt: dateOnly(staff.lastLoginAt || user.lastLoginAt || user.lastLogin || user.lastSeenAt)
  };
}

async function customerDebtMap(codes = []) {
  const uniqueCodes = [...new Set(codes.map(text).filter(Boolean))];
  if (!uniqueCodes.length) return new Map();
  const rows = await arLedgerReadService.getCanonicalLedgersByCustomerCodes(uniqueCodes, { status: 'all' });
  const map = new Map();
  for (const row of rows) {
    const code = text(row.customerCode);
    if (!code) continue;
    map.set(code, toNumber(map.get(code)) + toNumber(row.debit) - toNumber(row.credit));
  }
  return map;
}

async function customerMonthlySalesMap(codes = [], query = {}) {
  const uniqueCodes = [...new Set(codes.map(text).filter(Boolean))];
  if (!uniqueCodes.length) return new Map();
  const codeSet = new Set(uniqueCodes);
  const { start, end } = monthRange(query);
  const sales = await SalesReportService.salesReport({
    dateFrom: start,
    dateTo: end,
    full: '1',
    export: '1'
  });
  const map = new Map();
  for (const row of sales.sales || []) {
    const code = text(row.customerCode);
    if (!codeSet.has(code)) continue;
    const current = map.get(code) || { amount: 0, lastOrderDate: '' };
    current.amount += toNumber(row.actualAmount);
    if (!current.lastOrderDate || text(row.date) > current.lastOrderDate) current.lastOrderDate = text(row.date);
    map.set(code, current);
  }
  return map;
}

async function productInformationReport(query = {}) {
  const rows = await Product.find(productFilter(query)).sort({ code: 1, name: 1 }).limit(MAX_ROWS).lean();
  const products = rows.map(productRow);
  return { products, summary: { rowCount: products.length, activeCount: products.filter((row) => row.status === 'Hoạt động').length }, source: 'products' };
}

async function customerInformationReport(query = {}) {
  const rows = await Customer.find(customerFilter(query)).sort({ code: 1, name: 1 }).limit(MAX_ROWS).lean();
  const codes = rows.map((row) => row.code || row.customerCode);
  const [debtMap, salesMap] = await Promise.all([customerDebtMap(codes), customerMonthlySalesMap(codes, query)]);
  const customers = rows.map((row) => customerRow(row, debtMap, salesMap));
  return { customers, summary: { rowCount: customers.length, activeCount: customers.filter((row) => row.status === 'Hoạt động').length, currentDebt: customers.reduce((sum, row) => sum + toNumber(row.currentDebt), 0) }, source: 'customers+arLedgers+salesOrders' };
}

async function staffInformationReport(query = {}) {
  const staffRows = await Staff.find(staffFilter(query)).sort({ code: 1, name: 1 }).limit(MAX_ROWS).lean();
  if (!staffRows.length) {
    return {
      staffs: [],
      summary: { rowCount: 0, activeCount: 0, inactiveCount: 0 },
      source: 'staffs+users'
    };
  }
  const usernames = [...new Set(staffRows.map((row) => text(row.username)).filter(Boolean))];
  const staffCodes = [...new Set(staffRows.map((row) => text(row.code || row.staffCode || row.id)).filter(Boolean))];
  const userQueryParts = [];
  if (usernames.length) userQueryParts.push({ username: { $in: usernames } });
  if (staffCodes.length) {
    userQueryParts.push({ staffCode: { $in: staffCodes } });
    userQueryParts.push({ code: { $in: staffCodes } });
  }
  const users = userQueryParts.length ? await User.find({ $or: userQueryParts }).lean() : [];
  const byUsername = new Map(users.map((row) => [text(row.username), row]));
  const byCode = new Map(users.flatMap((row) => [text(row.staffCode), text(row.code)].filter(Boolean).map((code) => [code, row])));
  const staffs = staffRows.map((row) => staffRow(row, byUsername.get(text(row.username)) || byCode.get(text(row.code || row.staffCode || row.id)) || {}));
  return {
    staffs,
    summary: {
      rowCount: staffs.length,
      activeCount: staffs.filter((row) => row.status === 'Hoạt động').length,
      inactiveCount: staffs.filter((row) => row.status !== 'Hoạt động').length
    },
    source: 'staffs+users'
  };
}

module.exports = {
  productInformationReport,
  customerInformationReport,
  staffInformationReport
};
