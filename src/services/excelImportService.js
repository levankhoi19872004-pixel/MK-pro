'use strict';

const { canonicalizeOperationalStaff } = require('../utils/canonicalStaffWrite.util');

const { normalizeSearchText } = require('../utils/search.util');

const dateUtil = require('../utils/date.util');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const ImportOrder = require('../models/ImportOrder');
const SalesOrder = require('../models/SalesOrder');
const StockTransaction = require('../models/StockTransaction');
const InventoryLegacy = require('../models/InventoryLegacy');
const inventoryStockService = require('./inventoryStock.service');
const Receipt = require('../models/Receipt');
const Cashbook = require('../models/Cashbook');
const ArLedger = require('../models/ArLedger');
const ImportLog = require('../models/ImportLog');
const User = require('../models/User');
const PromotionProductRule = require('../models/PromotionProductRule');
const PromotionGroupItem = require('../models/PromotionGroupItem');
const PromotionGroupRule = require('../models/PromotionGroupRule');
const systemService = require('./systemService');
const { toNumber, makeId, normalizeText, normalizePacking } = require('../utils/common.util');
const { applyOrderSourceFields, ORDER_SOURCE } = require('../utils/orderSource.util');
const { DIRECT_PRICE } = require('../constants/pricingModes');
const { STOCK_WAREHOUSE_CODE, STOCK_WAREHOUSE_NAME } = require('../constants/business.constants');
const importRules = require('../rules/importRules');
const { extractCustomerTaxProfile } = require('../utils/customerTaxProfile.util');
const { extractCustomerBusinessProfile } = require('../utils/customerBusinessProfile.util');
const importSessionService = require('./importSessionService');
const auditService = require('./auditService');
const importShortageReportService = require('./importShortageReportService');
const { saveImportFiles, cleanupImportFiles } = require('../utils/importTempFileStore');
const { enqueueImportPreviewJob } = require('../jobs/importPreviewQueue');
const { runImportPreviewPipeline } = require('../jobs/importPreviewRunner');
const importCommitOrchestrator = require('./import/ImportCommitOrchestrator');
const { runAtomicChunks } = require('./import/importTransaction.service');
const {
  IMPORT_MODE_CREATE,
  IMPORT_MODE_UPDATE,
  normalizeImportMode,
  getProvidedField,
  parseImportBoolean,
  buildChanges,
  omitUnchanged
} = require('./import/selectiveUpdate.util');
const InventoryPostingService = require('../domain/posting/InventoryPostingService');
const financialService = require('./financialService');
const promotionService = require('./promotionService');
const { isBcryptHash, hashPasswordSync } = require('../security/passwordPolicy');
const { normalizePickingZone, pickingZoneFrom, legacyPrintGroupCode, pickingZoneLabel, PICKING_ZONES } = require('../utils/pickingZone.util');
const {
  pickSalesStaffCode,
  pickSalesStaffName,
  buildSalesStaffSnapshot,
  SALES_STAFF_CODE_FIELDS,
  USER_ACCOUNT_SALES_STAFF_CODE_FIELDS,
  pickUserAccountSalesStaffCode
} = require('../domain/staff/staffIdentity');

function makeReturnDraftItemFromImportItem(item = {}) {
  const soldQty = toNumber(item.quantity ?? item.qty ?? item.soldQuantity ?? 0);
  const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? 0);
  return {
    productId: item.productId || item.productCode || '',
    productCode: cleanText(item.productCode || item.code || item.productId),
    productName: cleanText(item.productName || item.name),
    unit: cleanText(item.unit || item.baseUnit),
    soldQty,
    price,
    salePrice: price,
    unitPrice: price,
    soldAmount: Math.round(soldQty * price),
    returnQty: 0,
    qtyReturn: 0,
    returnQuantity: 0,
    returnedQty: 0,
    quantity: 0,
    qty: 0,
    returnAmount: 0,
    amount: 0,
    lineKey: [cleanText(item.productCode || item.code || item.productId), cleanText(item.unit || item.baseUnit), String(price)].join('|')
  };
}

function buildReturnDraftFromImportedOrder(order = {}) {
  const items = (Array.isArray(order.items) ? order.items : []).map(makeReturnDraftItemFromImportItem).filter((item) => item.productCode || item.productName);
  const totalSoldAmount = items.reduce((sum, item) => sum + toNumber(item.soldAmount), 0);
  return {
    id: `RO-${String(order.code || order.id || makeId('RO')).replace(/^RO[-_]?/i, '').replace(/[^a-zA-Z0-9_-]/g, '')}`,
    code: `RO-${String(order.code || order.id || makeId('RO')).replace(/^RO[-_]?/i, '').replace(/[^a-zA-Z0-9_-]/g, '')}`,
    date: dateUtil.toDateOnly(order.deliveryDate || order.date || dateUtil.todayVN()),
    documentDate: dateUtil.toDateOnly(order.date || order.orderDate || dateUtil.todayVN()),
    salesOrderId: order.id || '',
    salesOrderCode: order.code || '',
    orderId: order.id || '',
    orderCode: order.code || '',
    customerId: order.customerId || '',
    customerCode: order.customerCode || '',
    customerName: order.customerName || '',
    salesStaffId: order.salesStaffId || '',
    salesStaffCode: pickSalesStaffCode(order),
    salesStaffName: pickSalesStaffName(order),
    staffCode: '',
    staffName: '',
    masterOrderId: '',
    masterOrderCode: '',
    deliveryStaffId: '',
    deliveryStaffCode: '',
    deliveryStaffName: '',
    deliveryDate: dateUtil.toDateOnly(order.deliveryDate || order.date || dateUtil.todayVN()),
    items,
    totalSoldAmount,
    totalReturnAmount: 0,
    totalQuantity: 0,
    totalAmount: 0,
    amount: 0,
    debtReduction: 0,
    status: 'draft',
    returnStatus: 'draft',
    returnMergeStatus: 'unmerged',
    warehouseReceiveStatus: 'draft',
    source: 'sales_order_draft',
    createdFrom: 'sales_order',
    accountingStatus: 'draft',
    accountingConfirmed: false,
    postedAt: '',
    createdAt: order.createdAt || dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
}

function cleanText(value) {
  return String(value ?? '').trim();
}



function isValidDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

function formatDateOnly(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeImportDate(value) {
  return dateUtil.toDateOnly(value);
}

function dateOnly(value) {
  return normalizeImportDate(value || dateUtil.todayVN());
}

function isObjectIdLike(value) {
  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

function get(row = {}, names = []) {
  const keys = Object.keys(row || {});
  for (const name of names) {
    const wanted = normalizeText(name);
    const key = keys.find((k) => normalizeText(k) === wanted);
    if (key) return row[key];
  }
  return '';
}

function text(row, names) {
  return cleanText(get(row, names));
}

function number(row, names) {
  return toNumber(get(row, names));
}

function normalizeProductPickingZone(value) {
  return normalizePickingZone(value, PICKING_ZONES.HC);
}

function productPickingZoneName(value) {
  return pickingZoneLabel(normalizeProductPickingZone(value));
}

// Legacy print group aliases remain for old imported order snapshots only.
function normalizeProductWarehouseCode(value) {
  return legacyPrintGroupCode(normalizeProductPickingZone(value));
}

function productWarehouseName(code) {
  const zone = normalizeProductPickingZone(code);
  return zone === PICKING_ZONES.PC ? 'KHO PC' : 'KHO HC';
}

function pickProductPayload(row = {}) {
  const pickingZone = normalizeProductPickingZone(
    row.pickingZone || row['Khu bốc hàng'] || row['Khu boc hang'] ||
    row.warehouseCode || row.warehouse || row.kho || row['Kho'] || row['Kho mặc định'] || row['Kho mac dinh']
  );
  const code = cleanText(row.code || row.productCode || row['Mã sản phẩm'] || row['Ma san pham']);
  const packingInfo = normalizePacking({
    unit: row.unit || row['Đơn vị'] || row['Don vi'],
    baseUnit: row.baseUnit || row['Đơn vị gốc'] || row['Don vi goc'],
    conversionRate: row.conversionRate || row['Quy đổi'] || row['Quy doi'] || row['Tỷ lệ'] || row['Ty le'],
    packing: row.packing || row.package || row['Quy cách'] || row['Quy cach']
  });
  return {
    code,
    name: cleanText(row.name || row.productName || row['Tên sản phẩm'] || row['Ten san pham']),
    ...packingInfo,
    barcode: cleanText(row.barcode || row['Mã vạch'] || row['Ma vach']),
    category: cleanText(row.category || row['Nhóm hàng'] || row['Nhom hang']),
    brand: cleanText(row.brand || row['Thương hiệu'] || row['Thuong hieu']),
    pickingZone,
    salePrice: toNumber(row.salePrice || row.price || row['Giá bán'] || row['Gia ban']),
    costPrice: toNumber(row.costPrice || row.importPrice || row['Giá nhập'] || row['Gia nhap']),
    minStock: toNumber(row.minStock || row['Tồn tối thiểu'] || row['Ton toi thieu']),
    maxStock: toNumber(row.maxStock || row['Tồn tối đa'] || row['Ton toi da']),
    isActive: row.isActive !== false
  };
}

function pickCustomerPayload(row = {}) {
  const code = cleanText(row.code || row.customerCode || row['Mã khách hàng'] || row['Ma khach hang']);
  const legacyStaffCode = cleanText(row.legacyStaffCode || row.staffCode || row['Mã NVBH'] || row['Ma NVBH'] || row['Mã nhân viên'] || row['Ma nhan vien'] || row['Mã nhân viên']);
  const legacyStaffName = cleanText(row.legacyStaffName || row.staffName || row['Tên NVBH'] || row['Ten NVBH']);
  const taxProfile = extractCustomerTaxProfile(row);
  const businessProfile = extractCustomerBusinessProfile(row);
  const payload = {
    code,
    name: cleanText(row.name || row.customerName || row['Tên khách hàng'] || row['Ten khach hang']),
    phone: cleanText(row.phone || row.customerPhone || row['Số điện thoại'] || row['So dien thoai']),
    address: cleanText(row.address || row.customerAddress || row['Địa chỉ giao hàng'] || row['Địa chỉ'] || row['Dia chi giao hang'] || row['Dia chi']),
    area: cleanText(row.area || row['Khu vực'] || row['Khu vuc']),
    route: cleanText(row.route || row['Tuyến'] || row['Tuyen']),
    legacyStaffCode,
    legacyStaffName,
    staffCode: legacyStaffCode,
    staffName: legacyStaffName,
    openingDebt: toNumber(row.openingDebt || row['Công nợ đầu kỳ'] || row['Cong no dau ky']),
    debtLimit: toNumber(row.debtLimit || row['Hạn mức nợ'] || row['Han muc no']),
    isActive: row.isActive !== false
  };
  // Import bằng mẫu cũ không được xóa tên hộ kinh doanh/thông tin thuế đã có của khách hàng.
  if (businessProfile.hasBusinessName) payload.businessName = businessProfile.businessName;
  if (taxProfile.hasTaxCode) payload.taxCode = taxProfile.taxCode;
  if (taxProfile.hasTaxInvoiceAddress) payload.taxInvoiceAddress = taxProfile.taxInvoiceAddress;
  return payload;
}

const PRODUCT_UPDATE_LABELS = Object.freeze({
  name: 'Tên sản phẩm', unit: 'Đơn vị bán', baseUnit: 'Đơn vị gốc', conversionRate: 'Quy đổi',
  packing: 'Quy cách', barcode: 'Barcode', category: 'Nhóm hàng', brand: 'Thương hiệu',
  pickingZone: 'Khu bốc hàng', costPrice: 'Giá nhập', salePrice: 'Giá bán',
  minStock: 'Tồn tối thiểu', maxStock: 'Tồn tối đa', isActive: 'Trạng thái'
});

const CUSTOMER_UPDATE_LABELS = Object.freeze({
  name: 'Tên khách hàng', businessName: 'Tên hộ kinh doanh', phone: 'Số điện thoại', address: 'Địa chỉ giao hàng',
  taxCode: 'Mã số thuế', taxInvoiceAddress: 'Địa chỉ hóa đơn thuế', area: 'Khu vực', route: 'Tuyến',
  staffCode: 'Mã NVBH', staffName: 'Tên NVBH', openingDebt: 'Công nợ đầu kỳ',
  debtLimit: 'Hạn mức nợ', isActive: 'Trạng thái'
});

const USER_UPDATE_LABELS = Object.freeze({
  fullName: 'Họ tên', staffCode: 'Mã nhân viên', role: 'Vai trò', phone: 'Số điện thoại',
  email: 'Email', area: 'Khu vực', route: 'Tuyến', permissions: 'Quyền truy cập',
  isActive: 'Trạng thái', password: 'Mật khẩu'
});

function applyTextPatch(row, patch, field, aliases) {
  const provided = getProvidedField(row, aliases);
  if (provided.hasValue) patch[field] = cleanText(provided.value);
  return provided;
}

function applyNumberPatch(row, patch, field, aliases) {
  const provided = getProvidedField(row, aliases);
  if (provided.hasValue) patch[field] = toNumber(provided.value);
  return provided;
}

function applyBooleanPatch(row, patch, field, aliases, fallback = true) {
  const provided = getProvidedField(row, aliases);
  if (provided.hasValue) patch[field] = parseImportBoolean(provided.value, fallback);
  return provided;
}

function buildProductSelectiveUpdate(row = {}, current = {}) {
  const patch = {};
  applyTextPatch(row, patch, 'name', ['name', 'productName', 'Tên sản phẩm', 'Ten san pham']);
  applyTextPatch(row, patch, 'barcode', ['barcode', 'Mã vạch', 'Ma vach']);
  applyTextPatch(row, patch, 'category', ['category', 'Nhóm hàng', 'Nhom hang']);
  applyTextPatch(row, patch, 'brand', ['brand', 'Thương hiệu', 'Thuong hieu']);
  applyNumberPatch(row, patch, 'costPrice', ['costPrice', 'importPrice', 'Giá nhập', 'Gia nhap']);
  applyNumberPatch(row, patch, 'salePrice', ['salePrice', 'price', 'Giá bán', 'Gia ban']);
  applyNumberPatch(row, patch, 'minStock', ['minStock', 'Tồn tối thiểu', 'Ton toi thieu']);
  applyNumberPatch(row, patch, 'maxStock', ['maxStock', 'Tồn tối đa', 'Ton toi da']);
  applyBooleanPatch(row, patch, 'isActive', ['isActive', 'Trạng thái', 'Trang thai', 'Hoạt động', 'Hoat dong'], current.isActive !== false);

  const pickingZone = getProvidedField(row, [
    'pickingZone', 'Khu bốc hàng', 'Khu boc hang',
    'warehouseCode', 'warehouse', 'kho', 'Kho', 'Kho mặc định', 'Kho mac dinh'
  ]);
  if (pickingZone.hasValue) {
    patch.pickingZone = normalizeProductPickingZone(pickingZone.value);
  }

  const unit = getProvidedField(row, ['unit', 'Đơn vị', 'Don vi', 'Đơn vị bán', 'Don vi ban']);
  const baseUnit = getProvidedField(row, ['baseUnit', 'Đơn vị gốc', 'Don vi goc']);
  const conversionRate = getProvidedField(row, ['conversionRate', 'Quy đổi', 'Quy doi', 'Tỷ lệ', 'Ty le']);
  const packing = getProvidedField(row, ['packing', 'package', 'Quy cách', 'Quy cach']);
  if (unit.hasValue || baseUnit.hasValue || conversionRate.hasValue || packing.hasValue) {
    const normalized = normalizePacking({
      unit: unit.hasValue ? unit.value : current.unit,
      baseUnit: baseUnit.hasValue ? baseUnit.value : current.baseUnit,
      conversionRate: conversionRate.hasValue ? conversionRate.value : current.conversionRate,
      packing: packing.hasValue ? packing.value : ''
    });
    patch.unit = normalized.unit;
    patch.baseUnit = normalized.baseUnit;
    patch.conversionRate = normalized.conversionRate;
    patch.packing = normalized.packing;
    patch.units = normalized.units;
  }

  const merged = { ...current, ...patch };
  if (Object.keys(patch).length) patch.searchText = productSearchText(merged);
  const update = omitUnchanged(current, patch);
  return { patch: update, changes: buildChanges(current, update, PRODUCT_UPDATE_LABELS) };
}

function buildCustomerSelectiveUpdate(row = {}, current = {}, resolvedStaff = null) {
  const patch = {};
  applyTextPatch(row, patch, 'name', ['name', 'customerName', 'Tên khách hàng', 'Ten khach hang']);
  applyTextPatch(row, patch, 'businessName', ['businessName', 'customerBusinessName', 'householdBusinessName', 'taxBusinessName', 'invoiceBusinessName', 'tenHoKinhDoanh', 'Tên hộ kinh doanh', 'Ten ho kinh doanh']);
  applyTextPatch(row, patch, 'phone', ['phone', 'customerPhone', 'Số điện thoại', 'So dien thoai', 'SĐT', 'SDT']);
  applyTextPatch(row, patch, 'address', ['address', 'customerAddress', 'Địa chỉ giao hàng', 'Dia chi giao hang', 'Địa chỉ', 'Dia chi']);
  applyTextPatch(row, patch, 'taxCode', ['taxCode', 'customerTaxCode', 'Mã số thuế', 'Ma so thue', 'MST', 'taxNumber', 'vatNumber']);
  applyTextPatch(row, patch, 'taxInvoiceAddress', ['taxInvoiceAddress', 'customerTaxInvoiceAddress', 'Địa chỉ hóa đơn thuế', 'Dia chi hoa don thue', 'invoiceAddress', 'billingAddress']);
  applyTextPatch(row, patch, 'area', ['area', 'Khu vực', 'Khu vuc']);
  applyTextPatch(row, patch, 'route', ['route', 'Tuyến', 'Tuyen']);
  applyNumberPatch(row, patch, 'openingDebt', ['openingDebt', 'Công nợ đầu kỳ', 'Cong no dau ky']);
  applyNumberPatch(row, patch, 'debtLimit', ['debtLimit', 'Hạn mức nợ', 'Han muc no']);
  applyBooleanPatch(row, patch, 'isActive', ['isActive', 'Trạng thái', 'Trang thai', 'Hoạt động', 'Hoat dong'], current.isActive !== false);

  const staffCode = getProvidedField(row, ['legacyStaffCode', 'staffCode', 'Mã NVBH', 'Ma NVBH', 'Mã nhân viên', 'Ma nhan vien', 'Mã nhân viên']);
  if (staffCode.hasValue && resolvedStaff && resolvedStaff.found && resolvedStaff.validRole) {
    patch.legacyStaffCode = resolvedStaff.staffCode;
    patch.staffCode = resolvedStaff.staffCode;
    patch.legacyStaffName = resolvedStaff.staffName;
    patch.staffName = resolvedStaff.staffName;
  }

  const merged = { ...current, ...patch };
  if (Object.keys(patch).length) patch.searchText = customerSearchText(merged);
  const update = omitUnchanged(current, patch);
  return { patch: update, changes: buildChanges(current, update, CUSTOMER_UPDATE_LABELS) };
}

function getUserUpdateInput(row = {}) {
  return {
    fullName: getProvidedField(row, ['fullName', 'name', 'Họ tên', 'Ho ten', 'Tên nhân viên', 'Ten nhan vien', 'Tên NV', 'Ten NV']),
    staffCode: getProvidedField(row, ['staffCode', 'code', 'Mã nhân viên', 'Ma nhan vien', 'Mã NV', 'Ma NV', 'StaffCode']),
    role: getProvidedField(row, ['role', 'Vai trò', 'Vai tro', 'Quyền', 'Quyen', 'Role']),
    password: getProvidedField(row, ['password', 'Mật khẩu', 'Mat khau', 'Password']),
    phone: getProvidedField(row, ['phone', 'mobile', 'SĐT', 'SDT', 'Điện thoại', 'Dien thoai']),
    email: getProvidedField(row, ['email', 'Email']),
    area: getProvidedField(row, ['area', 'Khu vực', 'Khu vuc']),
    route: getProvidedField(row, ['route', 'Tuyến', 'Tuyen']),
    permissions: getProvidedField(row, ['permissions', 'permission', 'Quyền truy cập', 'Quyen truy cap']),
    isActive: getProvidedField(row, ['isActive', 'status', 'Trạng thái', 'Trang thai'])
  };
}

function buildUserSelectiveUpdate(row = {}, current = {}, { hashPassword = false } = {}) {
  const input = getUserUpdateInput(row);
  const patch = {};
  if (input.fullName.hasValue) {
    patch.fullName = cleanText(input.fullName.value);
    patch.name = patch.fullName;
  }
  if (input.staffCode.hasValue) {
    patch.staffCode = cleanText(input.staffCode.value);
    patch.code = patch.staffCode;
  }
  if (input.role.hasValue) {
    const role = normalizeImportRole(input.role.value);
    if (role) {
      patch.role = role;
      patch.isSalesman = role === 'sales';
      patch.isDelivery = role === 'delivery';
    }
  }
  if (input.phone.hasValue) patch.phone = cleanText(input.phone.value);
  if (input.email.hasValue) patch.email = cleanText(input.email.value);
  if (input.area.hasValue) patch.area = cleanText(input.area.value);
  if (input.route.hasValue) patch.route = cleanText(input.route.value);
  if (input.permissions.hasValue) patch.permissions = cleanText(input.permissions.value);
  if (input.isActive.hasValue) patch.isActive = parseImportBoolean(input.isActive.value, current.isActive !== false);
  if (input.password.hasValue && hashPassword) {
    const password = cleanText(input.password.value);
    patch.password = isBcryptHash(password) ? password : hashPasswordSync(password);
  }

  const update = omitUnchanged(current, patch);
  const changes = buildChanges(current, update, USER_UPDATE_LABELS, new Set(['password']));
  if (input.password.hasValue && !hashPassword) {
    changes.push({ field: 'password', label: 'Mật khẩu', oldValue: 'Đã thiết lập', newValue: 'Sẽ cập nhật' });
  }
  return { patch: update, changes, input };
}

async function buildRunningCode(Model, prefix, field = 'code') {
  const rows = await Model.find({ [field]: new RegExp(`^${prefix}`) }).select(field).lean();
  const max = rows.reduce((result, row) => {
    const match = String(row[field] || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}${String(max + 1).padStart(5, '0')}`;
}

async function addImportLog(type, summary) {
  await ImportLog.create({
    id: makeId('IL'),
    type,
    summary,
    createdAt: dateUtil.nowIso()
  }).catch(() => null);
}

async function findProductByAny(value) {
  const key = cleanText(value);
  if (!key) return null;
  const ors = [{ code: key }, { productCode: key }, { sku: key }, { barcode: key }, { id: key }];
  if (isObjectIdLike(key)) ors.push({ _id: key });
  return Product.findOne({ $or: ors }).lean();
}

async function findCustomerByAny(value) {
  const key = cleanText(value);
  if (!key) return null;
  const ors = [{ code: key }, { customerCode: key }, { phone: key }, { id: key }];
  if (isObjectIdLike(key)) ors.push({ _id: key });
  return Customer.findOne({ $or: ors }).lean();
}


function excelSerialToDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0) return '';
  const utc = Math.round((serial - 25569) * 86400 * 1000);
  return dateUtil.toDateOnly(new Date(utc));
}

function getDateFromRow(row = {}) {
  const value = row.date ?? row.orderDate ?? row['Ngày'] ?? row['Ngay'] ?? row['Ngày lập hoá đơn'] ?? row['Ngày lập hóa đơn'] ?? row['Ngay lap hoa don'] ?? get(row, ['date', 'ngày', 'ngay', 'ngày lập hoá đơn', 'ngày lập hóa đơn', 'ngay lap hoa don']);
  return normalizeImportDate(value);
}

function getPackingFromRow(row = {}, product = null) {
  // File S3 cung cấp quy cách tại cột Qc. Đây là snapshot quy cách của chính
  // chứng từ import nên được ưu tiên để hiển thị thùng/lẻ và in lại đơn cũ.
  // Số lượng trong cột "Số lượng" vẫn là tổng SU, tuyệt đối không nhân thêm Qc.
  const rowPacking = [
    row['Qc'],
    row['QC'],
    row['Q/c'],
    row['Q/C'],
    row.packingQty,
    row.conversionRate,
    row['Đóng gói'],
    row['Dong goi'],
    row['Quy cách'],
    row['Quy cach']
  ].map(toNumber).find((value) => value > 1) || 0;
  if (rowPacking > 1) return rowPacking;

  const productPacking = toNumber(product?.conversionRate ?? product?.packingQty ?? product?.unitsPerCase);
  return Math.max(1, productPacking || rowPacking || 1);
}

const CARTON_QTY_FIELDS = [
  'cartons',
  'cartonQty',
  'Số lượng thùng',
  'So luong thung',
  'SL thùng',
  'SL thung',
  'Thùng',
  'Thung'
];

const UNIT_QTY_FIELDS = [
  'units',
  'unitQty',
  'Số lượng SU',
  'So luong SU',
  'SL lẻ',
  'SL le',
  'Lẻ',
  'Le'
];

function hasAnyQuantityColumn(row = {}, fields = []) {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(row, field));
}

function hasCartonUnitQuantityColumns(row = {}) {
  return hasAnyQuantityColumn(row, CARTON_QTY_FIELDS) || hasAnyQuantityColumn(row, UNIT_QTY_FIELDS);
}

function getCartonsFromRow(row = {}) {
  return toNumber(
    row.cartons ??
    row.cartonQty ??
    row['Số lượng thùng'] ??
    row['So luong thung'] ??
    row['SL thùng'] ??
    row['SL thung'] ??
    row['Thùng'] ??
    row['Thung'] ??
    0
  );
}

function getUnitsFromRow(row = {}) {
  return toNumber(
    row.units ??
    row.unitQty ??
    row['Số lượng SU'] ??
    row['So luong SU'] ??
    row['SL lẻ'] ??
    row['SL le'] ??
    row['Lẻ'] ??
    row['Le'] ??
    0
  );
}

function getCartonUnitQuantityFromRow(row = {}, product = null) {
  const packing = getPackingFromRow(row, product);
  const cartons = getCartonsFromRow(row);
  const units = getUnitsFromRow(row);

  return (cartons * packing) + units;
}

function getPromoCartonsFromRow(row = {}) {
  return toNumber(row.promoCartons ?? row['Số lượng khuyến mãi theo thùng/ Số thùng'] ?? row['So luong khuyen mai theo thung/ So thung'] ?? row['SL khuyến mãi thùng'] ?? row['SL khuyen mai thung']);
}

function getPromoUnitsFromRow(row = {}) {
  return toNumber(row.promoUnits ?? row['Số lượng khuyến mãi theo SU/ Số SU khuyế'] ?? row['Số lượng khuyến mãi theo SU/ Số SU khuyến mãi'] ?? row['So luong khuyen mai theo SU/ So SU khuye'] ?? row['SL khuyến mãi SU'] ?? row['SL khuyen mai SU']);
}

function getPromoCartons2FromRow(row = {}) {
  return toNumber(
    row.promoCartons2 ??
    row.promotionCartons2 ??
    row['Số lượng khuyến mãi 2 theo thùng/ Số thùng'] ??
    row['So luong khuyen mai 2 theo thung/ So thung'] ??
    row['SL khuyến mãi thùng 2'] ??
    row['SL khuyen mai thung 2'] ??
    row['KM thùng 2'] ??
    row['KM thung 2']
  );
}

function getPromoUnits2FromRow(row = {}) {
  return toNumber(
    row.promoUnits2 ??
    row.promotionUnits2 ??
    row['Số lượng khuyến mãi 2 theo SU/ Số SU khuyến mãi'] ??
    row['So luong khuyen mai 2 theo SU/ So SU khuyen mai'] ??
    row['SL khuyến mãi SU 2'] ??
    row['SL khuyen mai SU 2'] ??
    row['KM SU 2'] ??
    row['KM lẻ 2'] ??
    row['KM le 2']
  );
}

function isPromoLineFromRow(row = {}) {
  const value = cleanText(
    row.isPromo ??
    row.promoFlag ??
    row['Là KM'] ??
    row['La KM'] ??
    row['Hàng KM'] ??
    row['Hang KM'] ??
    row['Khuyến mại'] ??
    row['Khuyen mai'] ??
    ''
  ).toLowerCase();
  if (!value) return false;
  return ['1', 'y', 'yes', 'true', 'x', 'km', 'co', 'có'].includes(value);
}

function hasOwnImportValue(row = {}, keys = []) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined && row[key] !== null && row[key] !== '');
}

function getRawDmsQuantityValue(row = {}) {
  return toNumber(row.quantity ?? row.qty ?? row['Số lượng'] ?? row['So luong'] ?? row.sl ?? number(row, ['quantity', 'qty', 'số lượng', 'so luong', 'sl']));
}

function hasExplicitDmsAmount(row = {}) {
  return hasOwnImportValue(row, [
    'actualAmount',
    'lineAmount',
    'amount',
    'Doanh số mỗi ngày',
    'Doanh so moi ngay',
    'Thành tiền',
    'Thanh tien',
    'Thành tiền thực tế',
    'Thanh tien thuc te',
    'Giá trị bán thực tế',
    'Gia tri ban thuc te'
  ]);
}

function getExplicitDmsAmount(row = {}) {
  return toNumber(row.actualAmount ?? row.lineAmount ?? row.amount ?? row['Doanh số mỗi ngày'] ?? row['Doanh so moi ngay'] ?? row['Thành tiền'] ?? row['Thanh tien'] ?? row['Thành tiền thực tế'] ?? row['Thanh tien thuc te'] ?? row['Giá trị bán thực tế'] ?? row['Gia tri ban thuc te']);
}

function isZeroAmountPromoLineFromRow(row = {}) {
  if (isPromoLineFromRow(row)) return true;
  const qty = getRawDmsQuantityValue(row);
  if (qty <= 0) return false;
  if (!hasExplicitDmsAmount(row)) return false;
  return getExplicitDmsAmount(row) === 0;
}

function getDmsQuantityFromRow(row = {}, product = null) {
  if (isZeroAmountPromoLineFromRow(row)) return 0;

  // Ưu tiên cột SL thùng / SL lẻ nếu file có 2 cột này.
  // Kể cả SL thùng = 0, SL lẻ = 0 thì vẫn hiểu là người dùng chủ động nhập 0.
  if (hasCartonUnitQuantityColumns(row)) {
    return getCartonUnitQuantityFromRow(row, product);
  }

  return getRawDmsQuantityValue(row);
}

function getDmsPromoQuantityFromRow(row = {}, product = null) {
  const packing = getPackingFromRow(row, product);
  // DMS có thể có nhiều cột khuyến mại. Quy đổi toàn bộ về số lượng lẻ để xuất kho,
  // nhưng không tính tiền bán hàng.
  const promoQty1 = (getPromoCartonsFromRow(row) * packing) + getPromoUnitsFromRow(row);
  const promoQty2 = (getPromoCartons2FromRow(row) * packing) + getPromoUnits2FromRow(row);
  const directPromoQty = toNumber(
    row.promoQuantity ??
    row.promotionQuantity ??
    row.freeQuantity ??
    row['Số lượng khuyến mãi'] ??
    row['So luong khuyen mai'] ??
    row['SL khuyến mãi'] ??
    row['SL khuyen mai'] ??
    row['Hàng khuyến mãi'] ??
    row['Hang khuyen mai'] ??
    0
  );
  const flaggedPromoQty = isZeroAmountPromoLineFromRow(row)
    ? getRawDmsQuantityValue(row)
    : 0;
  return promoQty1 + promoQty2 + directPromoQty + flaggedPromoQty;
}

function allocateStockForSaleAndPromo(saleQuantity = 0, promoQuantity = 0, availableQuantity = 0) {
  const saleQty = Math.max(0, toNumber(saleQuantity));
  const promoQty = Math.max(0, toNumber(promoQuantity));
  const available = Math.max(0, toNumber(availableQuantity));
  // Ưu tiên giữ hàng bán có tính tiền, cắt khuyến mại trước. Nếu vẫn thiếu mới cắt hàng bán.
  const allowedSaleQuantity = Math.min(saleQty, available);
  const remaining = Math.max(0, available - allowedSaleQuantity);
  const allowedPromoQuantity = Math.min(promoQty, remaining);
  return {
    allowedSaleQuantity,
    allowedPromoQuantity,
    allowedDeliveredQuantity: allowedSaleQuantity + allowedPromoQuantity,
    missingSaleQuantity: Math.max(0, saleQty - allowedSaleQuantity),
    missingPromoQuantity: Math.max(0, promoQty - allowedPromoQuantity),
    missingQuantity: Math.max(0, saleQty + promoQty - available)
  };
}

function getActualAmountFromRow(row = {}) {
  if (isZeroAmountPromoLineFromRow(row)) return 0;
  return getExplicitDmsAmount(row);
}

function getListPriceBeforeVatFromRow(row = {}) {
  return toNumber(row.listPriceBeforeVat ?? row.listPrice ?? row['Đơn giá'] ?? row['Don gia'] ?? row['Giá niêm yết trước thuế'] ?? row['Gia niem yet truoc thue']);
}

function getVatAmountFromRow(row = {}) {
  return toNumber(
    row.vatAmount ??
    row.taxAmount ??
    row['Thuế'] ??
    row['Thue'] ??
    row['Thuế GTGT'] ??
    row['Thue GTGT'] ??
    row['VAT'] ??
    0
  );
}

function getGsvAmountFromRow(row = {}) {
  return toNumber(
    row.gsvAmount ??
    row['GSV bán ra'] ??
    row['GSV ban ra'] ??
    row['Giá trị trước khuyến mại'] ??
    row['Gia tri truoc khuyen mai'] ??
    0
  );
}

function getNivAmountFromRow(row = {}) {
  return toNumber(
    row.nivAmount ??
    row['NIV bán ra'] ??
    row['NIV ban ra'] ??
    row['Giá trị trước thuế sau chiết khấu'] ??
    row['Gia tri truoc thue sau chiet khau'] ??
    0
  );
}

function getDmsCatalogPriceAfterVatFromRow(row = {}, quantity = 0, finalPrice = 0) {
  const beforeVat = getListPriceBeforeVatFromRow(row);
  if (beforeVat > 0) return beforeVat * 1.08;

  const gsvAmount = getGsvAmountFromRow(row);
  if (gsvAmount > 0 && quantity > 0) return gsvAmount / quantity;

  return toNumber(finalPrice);
}

function getDmsVatAmountForLine(row = {}, quantity = 0, finalPrice = 0, lineAmount = 0) {
  const explicitVat = getVatAmountFromRow(row);
  if (explicitVat > 0) return explicitVat;

  const actualAmount = toNumber(lineAmount || getActualAmountFromRow(row));
  const nivAmount = getNivAmountFromRow(row);
  if (actualAmount > 0 && nivAmount > 0 && actualAmount >= nivAmount) {
    return Math.round(actualAmount - nivAmount);
  }

  if (actualAmount > 0) {
    return Math.max(0, Math.round(actualAmount - (actualAmount / 1.08)));
  }

  if (quantity > 0 && finalPrice > 0) {
    return Math.max(0, Math.round((finalPrice - (finalPrice / 1.08)) * quantity));
  }

  return 0;
}

function getDmsPriceFromRow(row = {}, quantity = 0) {
  const actualAmount = getActualAmountFromRow(row);
  if (actualAmount > 0 && quantity > 0) return actualAmount / quantity;
  const explicit = getSalePriceFromRow(row);
  if (explicit > 0) return explicit;
  const beforeVat = getListPriceBeforeVatFromRow(row);
  if (beforeVat > 0) return beforeVat * 1.08;
  return 0;
}

function getDmsAmountFromRow(row = {}, quantity = 0, salePrice = 0) {
  const actualAmount = getActualAmountFromRow(row);
  if (actualAmount > 0) return actualAmount;
  return quantity * salePrice;
}

function getProductCodeFromRow(row = {}) {
  return cleanText(row.productCode || row['Mã hàng'] || row['Ma hang'] || row.code || row['Mã hàng hóa'] || row['Ma hang hoa'] || row['Mã sản phẩm'] || row['Ma san pham'] || text(row, ['productCode', 'mã hàng hóa', 'ma hang hoa', 'mã sản phẩm', 'ma san pham', 'mã hàng', 'ma hang', 'code']));
}

function getCustomerCodeFromRow(row = {}) {
  return cleanText(row.customerCode || row['Mã Khách'] || row['Ma Khach'] || row['Mã khách'] || row['Ma khach'] || row['Mã cửa hàng'] || row['Ma cua hang'] || row['Mã khách hàng'] || row['Ma khach hang'] || text(row, ['customerCode', 'mã cửa hàng', 'ma cua hang', 'mã khách hàng', 'ma khach hang', 'mã khách', 'ma khach']));
}

function getCustomerNameFromRow(row = {}) {
  return cleanText(row.customerName || row['Tên Khách'] || row['Ten Khach'] || row['Tên khách'] || row['Ten khach'] || row['Tên cửa hàng'] || row['Ten cua hang'] || row['Tên khách hàng'] || row['Ten khach hang'] || row['Họ'] || row['Họ'] || row['Ho'] || text(row, ['customerName', 'tên cửa hàng', 'ten cua hang', 'tên khách hàng', 'ten khach hang', 'tên khách', 'ten khach', 'họ', 'ho']));
}

function getRouteCodeFromRow(row = {}) {
  return cleanText(row.routeCode || row['Tuyến bán hàng'] || row['Tuyen ban hang'] || row['Mã tuyến'] || row['Ma tuyen'] || text(row, ['routeCode', 'tuyến bán hàng', 'tuyen ban hang', 'mã tuyến', 'ma tuyen']));
}

function getQtyFromRow(row = {}, product = null) {
  // Nếu Excel có cột SL thùng / SL lẻ thì luôn ưu tiên 2 cột này.
  // Không phụ thuộc vào cột "Số lượng" để tránh nhầm.
  if (hasCartonUnitQuantityColumns(row)) {
    return getCartonUnitQuantityFromRow(row, product);
  }

  const directQty = toNumber(
    row.quantity ??
    row.qty ??
    row.stockQuantity ??
    row.openingQuantity ??
    row.openingStock ??
    row['Số lượng'] ??
    row['So luong'] ??
    row['Số lượng tồn đầu'] ??
    row['So luong ton dau'] ??
    row['SL'] ??
    row['sl'] ??
    number(row, ['quantity', 'qty', 'số lượng', 'so luong', 'số lượng tồn đầu', 'so luong ton dau', 'sl'])
  );

  if (
    directQty > 0 ||
    Object.prototype.hasOwnProperty.call(row, 'quantity') ||
    Object.prototype.hasOwnProperty.call(row, 'Số lượng') ||
    Object.prototype.hasOwnProperty.call(row, 'SL') ||
    Object.prototype.hasOwnProperty.call(row, 'sl')
  ) {
    return directQty;
  }

  return getDmsQuantityFromRow(row, product);
}

function getCostFromRow(row = {}) {
  return toNumber(row.costPrice ?? row.importPrice ?? row['Giá nhập'] ?? row['Gia nhap'] ?? row['Đơn giá'] ?? row['Don gia'] ?? number(row, ['costPrice', 'giá nhập', 'gia nhap', 'đơn giá', 'don gia']));
}

function getSalePriceFromRow(row = {}) {
  return toNumber(row.salePrice ?? row.price ?? row['Đơn giá sau KM/Ck'] ?? row['Don gia sau KM/Ck'] ?? row['Đơn giá sau KM/CK'] ?? row['Don gia sau KM/CK'] ?? row['Giá bán'] ?? row['Gia ban'] ?? row['Đơn giá'] ?? row['Don gia'] ?? number(row, ['salePrice', 'giá bán', 'gia ban', 'đơn giá sau km ck', 'don gia sau km ck', 'đơn giá', 'don gia']));
}

function groupRows(rows = [], keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return Array.from(map.values());
}


const IMPORT_BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE || 1000);

function chunkArray(rows = [], size = IMPORT_BATCH_SIZE) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

async function bulkWriteInBatches(Model, operations = [], options = {}) {
  let ok = 0;
  const errors = [];
  for (const batch of chunkArray(operations, options.batchSize || IMPORT_BATCH_SIZE)) {
    if (!batch.length) continue;
    try {
      const result = await Model.bulkWrite(batch, { ordered: false, ...options.bulkOptions });
      ok += Number(result.upsertedCount || 0) + Number(result.modifiedCount || 0) + Number(result.insertedCount || 0) + Number(result.matchedCount || 0);
    } catch (err) {
      const writeErrors = err && Array.isArray(err.writeErrors) ? err.writeErrors : [];
      ok += Number(err?.result?.result?.nUpserted || 0) + Number(err?.result?.result?.nModified || 0) + Number(err?.result?.result?.nInserted || 0);
      if (writeErrors.length) {
        for (const writeErr of writeErrors.slice(0, 30)) errors.push({ message: writeErr.errmsg || writeErr.message || String(writeErr) });
      } else {
        errors.push({ message: err.message || String(err) });
      }
    }
  }
  return { ok, errors };
}

async function insertManyInBatches(Model, docs = [], options = {}) {
  let inserted = 0;
  const errors = [];
  for (const batch of chunkArray(docs, options.batchSize || IMPORT_BATCH_SIZE)) {
    if (!batch.length) continue;
    try {
      const result = await Model.insertMany(batch, {
        ordered: false,
        lean: true,
        rawResult: true,
        ...options.insertOptions
      });
      const insertedCount = typeof result?.insertedCount === 'number'
        ? result.insertedCount
        : (Array.isArray(result) ? result.length : (Object.keys(result?.insertedIds || {}).length || batch.length));
      inserted += insertedCount;
    } catch (err) {
      const insertedCount = Number(err?.result?.insertedCount || err?.insertedDocs?.length || 0);
      inserted += insertedCount;
      const writeErrors = err && Array.isArray(err.writeErrors) ? err.writeErrors : [];
      if (writeErrors.length) {
        for (const writeErr of writeErrors.slice(0, 30)) errors.push({ message: writeErr.errmsg || writeErr.message || String(writeErr) });
      } else {
        errors.push({ message: err.message || String(err) });
      }
    }
  }
  return { inserted, errors };
}


function productSearchText(payload = {}) {
  return normalizeSearchText([
    payload.code,
    payload.sku,
    payload.productCode,
    payload.name,
    payload.productName,
    payload.barcode,
    payload.category,
    payload.brand,
    payload.pickingZone,
    payload.packing,
    payload.unit,
    payload.baseUnit
  ].filter(Boolean).join(' '));
}

function customerSearchText(payload = {}) {
  return normalizeSearchText([
    payload.code,
    payload.customerCode,
    payload.name,
    payload.customerName,
    payload.businessName,
    payload.customerBusinessName,
    payload.householdBusinessName,
    payload.taxBusinessName,
    payload.invoiceBusinessName,
    payload.tenHoKinhDoanh,
    payload.phone,
    payload.address,
    payload.taxCode,
    payload.taxInvoiceAddress,
    payload.area,
    payload.route,
    payload.staffCode,
    payload.staffName
  ].filter(Boolean).join(' '));
}

async function buildRunningCodes(Model, prefix, count, field = 'code') {
  if (!count) return [];
  const rows = await Model.find({ [field]: new RegExp(`^${prefix}`) }).select(field).lean();
  const max = rows.reduce((result, row) => {
    const match = String(row[field] || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return Array.from({ length: count }, (_, i) => `${prefix}${String(max + i + 1).padStart(5, '0')}`);
}

async function preloadProductsByCode(rows = []) {
  const codes = Array.from(new Set(rows.map(getProductCodeFromRow).filter(Boolean)));
  const products = codes.length ? await Product.find({ $or: [
    { code: { $in: codes } },
    { productCode: { $in: codes } },
    { sku: { $in: codes } },
    { barcode: { $in: codes } },
    { id: { $in: codes } }
  ] }).lean() : [];
  const map = new Map();
  for (const p of products) {
    [p.code, p.productCode, p.sku, p.barcode, p.id, String(p._id || '')].filter(Boolean).forEach((k) => map.set(cleanText(k), p));
  }
  return map;
}

async function preloadCustomersByCode(rows = []) {
  const codes = Array.from(new Set(rows.map(getCustomerCodeFromRow).filter(Boolean)));
  const customers = codes.length ? await Customer.find({ $or: [
    { code: { $in: codes } },
    { customerCode: { $in: codes } },
    { phone: { $in: codes } },
    { id: { $in: codes } }
  ] }).lean() : [];
  const map = new Map();
  for (const c of customers) {
    [c.code, c.customerCode, c.phone, c.id, String(c._id || '')].filter(Boolean).forEach((k) => map.set(cleanText(k), c));
  }
  return map;
}

const AUTO_CREATED_CUSTOMER_ADDRESS = 'NEW';

function collectImportedCustomerCandidates(rows = [], existingCustomerMap = new Map()) {
  const candidates = new Map();

  for (const row of rows || []) {
    const code = getCustomerCodeFromRow(row);
    if (!code || existingCustomerMap.has(cleanText(code))) continue;

    const key = cleanText(code);
    const name = getCustomerNameFromRow(row);
    if (!candidates.has(key)) {
      candidates.set(key, {
        code: key,
        name: '',
        names: new Map(),
        rowNos: []
      });
    }

    const candidate = candidates.get(key);
    const rowNo = cleanText(row.__rowNo || row.rowNo || row.__rowNumber || row.rowNumber);
    if (rowNo) candidate.rowNos.push(rowNo);
    if (!name) continue;

    const normalizedName = normalizeSearchText(name);
    if (normalizedName && !candidate.names.has(normalizedName)) {
      candidate.names.set(normalizedName, name);
    }
    if (!candidate.name) candidate.name = name;
  }

  for (const candidate of candidates.values()) {
    candidate.nameConflict = candidate.names.size > 1;
    candidate.distinctNames = Array.from(candidate.names.values());
  }

  return candidates;
}

function buildImportedCustomerPlaceholder(candidate = {}) {
  const code = cleanText(candidate.code);
  const name = cleanText(candidate.name);
  if (!code || !name || candidate.nameConflict) return null;
  return {
    id: code,
    code,
    customerCode: code,
    name,
    customerName: name,
    address: AUTO_CREATED_CUSTOMER_ADDRESS,
    customerAddress: AUTO_CREATED_CUSTOMER_ADDRESS,
    isActive: true,
    __autoCreateCustomer: true
  };
}

function importedCustomerCandidateError(candidate = {}, customerCode = '') {
  const code = cleanText(candidate.code || customerCode);
  if (candidate.nameConflict) {
    return `Mã cửa hàng ${code} có nhiều tên khác nhau trong file: ${candidate.distinctNames.join(' / ')}`;
  }
  if (!cleanText(candidate.name)) {
    return `Khách hàng mới ${code || '(chưa có mã)'} thiếu tên cửa hàng`;
  }
  return 'Không thể tự tạo khách hàng mới';
}

async function ensureImportedCustomersForOrderChunk(orderChunk = [], options = {}) {
  const session = options.session;
  const createdBy = cleanText(options.createdBy || 'excel_import');
  const importSessionId = cleanText(options.importSessionId);
  const candidates = new Map();

  for (const order of orderChunk || []) {
    const candidate = order?.__autoCreateCustomer;
    const code = cleanText(candidate?.code || order?.customerCode);
    const name = cleanText(candidate?.name || order?.customerName);
    if (!candidate || !code || !name) continue;
    if (!candidates.has(code)) candidates.set(code, { code, name });
  }

  if (!candidates.size) {
    for (const order of orderChunk || []) delete order.__autoCreateCustomer;
    return { createdCustomers: 0, customerCodes: [] };
  }

  const codes = Array.from(candidates.keys());
  const query = Customer.find({
    $or: [
      { code: { $in: codes } },
      { customerCode: { $in: codes } },
      { id: { $in: codes } }
    ]
  });
  if (session && typeof query.session === 'function') query.session(session);
  const existingRows = await query.lean();
  const customerMap = new Map();
  for (const customer of existingRows || []) {
    [customer.code, customer.customerCode, customer.id, String(customer._id || '')]
      .filter(Boolean)
      .forEach((value) => customerMap.set(cleanText(value), customer));
  }

  let createdCustomers = 0;
  for (const candidate of candidates.values()) {
    if (customerMap.has(candidate.code)) continue;
    const payload = {
      code: candidate.code,
      customerCode: candidate.code,
      name: candidate.name,
      customerName: candidate.name,
      phone: '',
      address: AUTO_CREATED_CUSTOMER_ADDRESS,
      customerAddress: AUTO_CREATED_CUSTOMER_ADDRESS,
      area: '',
      route: '',
      openingDebt: 0,
      debtLimit: 0,
      isActive: true,
      searchText: normalizeSearchText([
        candidate.code,
        candidate.name,
        AUTO_CREATED_CUSTOMER_ADDRESS
      ].join(' ')),
      createdFrom: 'sales_order_import',
      createdBy,
      importSessionId,
      needsProfileUpdate: true
    };
    const createdRows = await Customer.create([payload], session ? { session } : undefined);
    const created = Array.isArray(createdRows) ? createdRows[0] : createdRows;
    const raw = typeof created?.toObject === 'function' ? created.toObject() : created;
    if (!raw) throw new Error(`Không thể tự tạo khách hàng mới ${candidate.code}`);
    customerMap.set(candidate.code, raw);
    createdCustomers += 1;
  }

  for (const order of orderChunk || []) {
    const code = cleanText(order?.customerCode);
    const customer = customerMap.get(code);
    if (order?.__autoCreateCustomer && !customer) {
      throw new Error(`Không tìm thấy khách hàng mới ${code} sau khi tạo`);
    }
    if (customer) {
      order.customerId = String(customer.id || customer._id || customer.code || code);
      order.customerCode = cleanText(customer.code || customer.customerCode || code);
      order.customerName = cleanText(order.customerName || customer.name || customer.customerName);
      order.customerPhone = cleanText(customer.phone || order.customerPhone);
      order.customerAddress = cleanText(customer.address || customer.customerAddress || order.customerAddress || AUTO_CREATED_CUSTOMER_ADDRESS);
    }
    delete order.__autoCreateCustomer;
  }

  return { createdCustomers, customerCodes: codes };
}


function pushInventoryMovement({ movements, inventoryDeltas, item, direction, type, refType, refId, refCode, date, warehouseCode, warehouseName, note }) {
  const rawQty = toNumber(item.stockQuantity ?? item.deliveredQuantity ?? item.quantity ?? item.qty);
  if (!rawQty) return;
  const productCode = cleanText(item.productCode || item.code || item.productId);
  if (!productCode) return;
  const productId = String(item.productId || productCode);
  const productName = cleanText(item.productName || item.name);
  // Tồn kho chỉ ghi vào 1 kho chính MAIN; warehouseCode từ file chỉ là nhóm in/gộp đơn.
  const whCode = STOCK_WAREHOUSE_CODE || 'MAIN';
  const whName = STOCK_WAREHOUSE_NAME || 'Kho chính';
  const sign = direction === 'OUT' ? -1 : 1;
  const qty = Math.abs(rawQty) * sign;
  const now = dateUtil.nowIso();

  movements.push({
    id: makeId('ST'),
    date: dateOnly(date),
    productId,
    productCode,
    productName,
    warehouseId: whCode,
    warehouseCode: whCode,
    warehouseName: whName,
    type,
    direction,
    quantity: qty,
    qty,
    inQty: direction === 'IN' ? Math.abs(rawQty) : 0,
    outQty: direction === 'OUT' ? Math.abs(rawQty) : 0,
    balanceQty: 0,
    refType,
    refId,
    refCode,
    note: note || '',
    createdAt: now,
    updatedAt: now
  });

  const key = productCode;
  if (!inventoryDeltas.has(key)) {
    inventoryDeltas.set(key, {
      productId,
      productCode,
      productName,
      warehouseCode: whCode,
      warehouseId: whCode,
      warehouseName: whName,
      qty: 0
    });
  }
  inventoryDeltas.get(key).qty += qty;
}

async function applyInventoryMovementsBulk(movements = [], inventoryDeltas = new Map()) {
  // Chốt chặn cuối cùng: không cho bulk $inc âm làm tồn kho âm.
  // Mọi luồng import DMS/Excel nếu xuất kho phải được kiểm tra trước khi ghi transaction/snapshot.
  const negativeDeltas = Array.from(inventoryDeltas.values())
    .map((delta) => ({ ...delta, qty: toNumber(delta.qty) }))
    .filter((delta) => delta.qty < 0);
  if (negativeDeltas.length) {
    const stockMap = await inventoryStockService.getAvailableStocks(negativeDeltas.map((delta) => delta.productCode));
    const checks = negativeDeltas.map((delta) => {
      const key = inventoryStockService.normalizeProductCode(delta.productCode);
      const availableQty = toNumber(stockMap[key]);
      const requiredQty = Math.abs(delta.qty);
      return { ...delta, availableQty, requiredQty, nextQty: availableQty - requiredQty };
    });
    const insufficient = checks.filter((row) => row.nextQty < 0);
    if (insufficient.length) {
      const first = insufficient[0];
      const err = new Error(`Không đủ tồn kho: mã SP ${first.productCode}, tồn hiện tại ${first.availableQty}, cần xuất ${first.requiredQty}`);
      err.code = 'INSUFFICIENT_STOCK_BULK';
      err.rows = insufficient.map((row) => ({
        productCode: row.productCode,
        productName: row.productName,
        warehouseCode: STOCK_WAREHOUSE_CODE || 'MAIN',
        availableQty: row.availableQty,
        requiredQty: row.requiredQty
      }));
      throw err;
    }
  }

  if (movements.length) await insertManyInBatches(StockTransaction, movements);
  const ops = [];
  const now = dateUtil.nowIso();
  for (const delta of inventoryDeltas.values()) {
    const qty = toNumber(delta.qty);
    if (!qty) continue;
    ops.push({
      updateOne: {
        filter: { productCode: delta.productCode, warehouseCode: STOCK_WAREHOUSE_CODE || 'MAIN' },
        update: {
          $setOnInsert: {
            id: makeId('IV'),
            productId: delta.productId,
            productCode: delta.productCode,
            warehouseId: STOCK_WAREHOUSE_CODE || 'MAIN',
            warehouseCode: STOCK_WAREHOUSE_CODE || 'MAIN',
            reservedQty: 0,
            createdAt: now
          },
          $set: {
            productId: delta.productId,
            productCode: delta.productCode,
            productName: delta.productName,
            warehouseId: STOCK_WAREHOUSE_CODE || 'MAIN',
            warehouseCode: STOCK_WAREHOUSE_CODE || 'MAIN',
            warehouseName: STOCK_WAREHOUSE_NAME || 'Kho chính',
            lastTransactionAt: now,
            updatedAt: now
          },
          $inc: {
            qty,
            quantity: qty,
            onHand: qty,
            availableQty: qty
          }
        },
        upsert: true
      }
    });
  }
  if (ops.length) {
    await bulkWriteInBatches(InventoryLegacy, ops);
  }
  return { transactionCount: movements.length, inventoryRows: ops.length };
}

async function setOpeningStockInventoriesBulk(rows = []) {
  const ops = [];
  const now = dateUtil.nowIso();
  for (const row of rows) {
    const quantity = toNumber(row.quantity);
    const reservedQty = toNumber(row.reservedQty);
    ops.push({
      updateOne: {
        filter: { productCode: row.productCode, warehouseCode: STOCK_WAREHOUSE_CODE || 'MAIN' },
        update: {
          $setOnInsert: {
            id: makeId('IV'),
            createdAt: now
          },
          $set: {
            productId: row.productId || row.productCode,
            productCode: row.productCode,
            productName: row.productName || '',
            warehouseId: STOCK_WAREHOUSE_CODE || 'MAIN',
            warehouseCode: STOCK_WAREHOUSE_CODE || 'MAIN',
            warehouseName: STOCK_WAREHOUSE_NAME || 'Kho chính',
            qty: quantity,
            quantity,
            onHand: quantity,
            reservedQty,
            availableQty: Math.max(0, quantity - reservedQty),
            lastTransactionAt: now,
            updatedAt: now
          }
        },
        upsert: true
      }
    });
  }
  if (ops.length) {
    await bulkWriteInBatches(InventoryLegacy, ops);
  }
  return { inventoryRows: ops.length };
}

async function upsertProducts(rows = [], options = {}) {
  const importMode = normalizeImportMode(options.importMode, 'products');
  if (importMode === IMPORT_MODE_UPDATE) {
    let skipped = 0;
    let unchanged = 0;
    const errors = [];
    const ops = [];
    const seen = new Set();
    const codes = Array.from(new Set(rows.map((row) => cleanText(row.code || row.productCode || row['Mã sản phẩm'] || row['Ma san pham'])).filter(Boolean)));
    const existingRows = codes.length ? await Product.find({ code: { $in: codes } }).lean() : [];
    const existingMap = new Map(existingRows.map((row) => [normalizeText(row.code), row]));

    for (const row of rows) {
      const code = cleanText(row.code || row.productCode || row['Mã sản phẩm'] || row['Ma san pham']);
      const codeKey = normalizeText(code);
      if (!code) {
        skipped += 1;
        errors.push({ code, message: 'Thiếu mã sản phẩm' });
        continue;
      }
      if (seen.has(codeKey)) {
        skipped += 1;
        errors.push({ code, message: 'Mã sản phẩm bị trùng trong file cập nhật' });
        continue;
      }
      seen.add(codeKey);
      const current = existingMap.get(codeKey);
      if (!current) {
        skipped += 1;
        errors.push({ code, message: 'Không tìm thấy sản phẩm để cập nhật' });
        continue;
      }

      const conversion = getProvidedField(row, ['conversionRate', 'Quy đổi', 'Quy doi', 'Tỷ lệ', 'Ty le']);
      const costPrice = getProvidedField(row, ['costPrice', 'importPrice', 'Giá nhập', 'Gia nhap']);
      const salePrice = getProvidedField(row, ['salePrice', 'price', 'Giá bán', 'Gia ban']);
      if (conversion.hasValue && toNumber(conversion.value) < 1) {
        skipped += 1;
        errors.push({ code, message: 'Quy đổi phải lớn hơn hoặc bằng 1' });
        continue;
      }
      if ((costPrice.hasValue && toNumber(costPrice.value) < 0) || (salePrice.hasValue && toNumber(salePrice.value) < 0)) {
        skipped += 1;
        errors.push({ code, message: 'Giá không được âm' });
        continue;
      }

      const { patch } = buildProductSelectiveUpdate(row, current);
      if (!Object.keys(patch).length) {
        unchanged += 1;
        continue;
      }
      ops.push({
        updateOne: {
          filter: { code: current.code },
          update: { $set: { ...patch, updatedAt: dateUtil.nowIso() } },
          upsert: false
        }
      });
    }

    const bulk = await bulkWriteInBatches(Product, ops);
    skipped += bulk.errors.length;
    errors.push(...bulk.errors.map((e) => ({ code: '', message: e.message })));
    const updated = Math.max(0, ops.length - bulk.errors.length);
    await addImportLog('products', { imported: updated, updated, unchanged, skipped, errors: errors.slice(0, 30), mode: 'selective-update', batchSize: IMPORT_BATCH_SIZE });
    return {
      imported: updated,
      updated,
      unchanged,
      skipped,
      errors,
      importMode,
      message: `Đã cập nhật ${updated} sản phẩm${unchanged ? `, giữ nguyên ${unchanged} dòng không thay đổi` : ''}${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}`
    };
  }

  let skipped = 0;
  const errors = [];
  const ops = [];
  const seen = new Set();

  for (const row of rows) {
    const payload = pickProductPayload(row);
    if (!payload.code || !payload.name) {
      skipped += 1;
      errors.push({ code: payload.code, message: 'Thiếu mã hoặc tên sản phẩm' });
      continue;
    }
    const codeKey = normalizeText(payload.code);
    if (seen.has(codeKey)) continue;
    seen.add(codeKey);
    payload.searchText = productSearchText(payload);
    ops.push({
      updateOne: {
        filter: { code: payload.code },
        update: {
          $set: payload,
          $unset: {
            openingStock: 1,
            stockQuantity: 1,
            availableStock: 1,
            availableQty: 1,
            stock: 1,
            quantity: 1,
            qty: 1,
            tonKho: 1,
            tonDau: 1
          }
        },
        upsert: true
      }
    });
  }

  const bulk = await bulkWriteInBatches(Product, ops);
  skipped += bulk.errors.length;
  errors.push(...bulk.errors.map((e) => ({ code: '', message: e.message })));
  const imported = Math.max(0, ops.length - bulk.errors.length);
  await addImportLog('products', { imported, skipped, errors: errors.slice(0, 30), mode: 'bulkWrite', batchSize: IMPORT_BATCH_SIZE });
  return { imported, skipped, errors, importMode };
}

async function upsertCustomers(rows = [], options = {}) {
  const importMode = normalizeImportMode(options.importMode, 'customers');
  if (importMode === IMPORT_MODE_UPDATE) {
    let skipped = 0;
    let unchanged = 0;
    const errors = [];
    const ops = [];
    const seen = new Set();
    const salesStaffUserMap = await preloadSalesStaffUsersByCode(rows);
    const codes = Array.from(new Set(rows.map((row) => cleanText(row.code || row.customerCode || row['Mã khách hàng'] || row['Ma khach hang'])).filter(Boolean)));
    const existingRows = codes.length ? await Customer.find({ code: { $in: codes } }).lean() : [];
    const existingMap = new Map(existingRows.map((row) => [normalizeText(row.code), row]));

    for (const row of rows) {
      const code = cleanText(row.code || row.customerCode || row['Mã khách hàng'] || row['Ma khach hang']);
      const codeKey = normalizeText(code);
      if (!code) {
        skipped += 1;
        errors.push({ code, message: 'Thiếu mã khách hàng' });
        continue;
      }
      if (seen.has(codeKey)) {
        skipped += 1;
        errors.push({ code, message: 'Mã khách hàng bị trùng trong file cập nhật' });
        continue;
      }
      seen.add(codeKey);
      const current = existingMap.get(codeKey);
      if (!current) {
        skipped += 1;
        errors.push({ code, message: 'Không tìm thấy khách hàng để cập nhật' });
        continue;
      }

      let resolvedStaff = null;
      const staffField = getProvidedField(row, ['legacyStaffCode', 'staffCode', 'Mã NVBH', 'Ma NVBH', 'Mã nhân viên', 'Ma nhan vien', 'Mã nhân viên']);
      if (staffField.hasValue) {
        resolvedStaff = resolveSalesStaffForImportRow(row, salesStaffUserMap);
        if (!resolvedStaff.found) {
          skipped += 1;
          errors.push({ code, message: `Không tìm thấy mã NVBH ${cleanText(staffField.value)} trong tài khoản hệ thống` });
          continue;
        }
        if (!resolvedStaff.validRole) {
          skipped += 1;
          errors.push({ code, message: `Mã ${cleanText(staffField.value)} không phải nhân viên bán hàng` });
          continue;
        }
      }

      const { patch } = buildCustomerSelectiveUpdate(row, current, resolvedStaff);
      if (!Object.keys(patch).length) {
        unchanged += 1;
        continue;
      }
      ops.push({
        updateOne: {
          filter: { code: current.code },
          update: { $set: { ...patch, updatedAt: dateUtil.nowIso() } },
          upsert: false
        }
      });
    }

    const bulk = await bulkWriteInBatches(Customer, ops);
    skipped += bulk.errors.length;
    errors.push(...bulk.errors.map((e) => ({ code: '', message: e.message })));
    const updated = Math.max(0, ops.length - bulk.errors.length);
    await addImportLog('customers', { imported: updated, updated, unchanged, skipped, errors: errors.slice(0, 30), mode: 'selective-update', batchSize: IMPORT_BATCH_SIZE });
    return {
      imported: updated,
      updated,
      unchanged,
      skipped,
      errors,
      importMode,
      message: `Đã cập nhật ${updated} khách hàng${unchanged ? `, giữ nguyên ${unchanged} dòng không thay đổi` : ''}${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}`
    };
  }

  let skipped = 0;
  const errors = [];
  const ops = [];
  const seen = new Set();
  const salesStaffUserMap = await preloadSalesStaffUsersByCode(rows);

  for (const row of rows) {
    const payload = pickCustomerPayload(row);
    if (!payload.code || !payload.name) {
      skipped += 1;
      errors.push({ code: payload.code, message: 'Thiếu mã hoặc tên khách hàng' });
      continue;
    }
    if (payload.staffCode) {
      const resolvedStaff = resolveSalesStaffForImportRow(row, salesStaffUserMap);
      if (!resolvedStaff.found) {
        skipped += 1;
        errors.push({ code: payload.code, message: `Không tìm thấy mã NVBH ${payload.staffCode} trong tài khoản hệ thống` });
        continue;
      }
      if (!resolvedStaff.validRole) {
        skipped += 1;
        errors.push({ code: payload.code, message: `Mã ${payload.staffCode} không phải nhân viên bán hàng` });
        continue;
      }
      payload.staffCode = resolvedStaff.staffCode;
      payload.staffName = resolvedStaff.staffName;
    }
    const codeKey = normalizeText(payload.code);
    if (seen.has(codeKey)) continue;
    seen.add(codeKey);
    payload.searchText = customerSearchText(payload);
    ops.push({
      updateOne: {
        filter: { code: payload.code },
        update: { $set: payload },
        upsert: true
      }
    });
  }

  const bulk = await bulkWriteInBatches(Customer, ops);
  skipped += bulk.errors.length;
  errors.push(...bulk.errors.map((e) => ({ code: '', message: e.message })));
  const imported = Math.max(0, ops.length - bulk.errors.length);
  await addImportLog('customers', { imported, skipped, errors: errors.slice(0, 30), mode: 'bulkWrite', batchSize: IMPORT_BATCH_SIZE });
  return { imported, skipped, errors, importMode };
}

async function importOpeningStock(rows = []) {
  const shortageReport = [];
  let imported = 0;
  let skipped = 0;
  const errors = [];
  const productMap = await preloadProductsByCode(rows);
  const codeList = await buildRunningCodes(StockTransaction, 'TD', rows.length);
  let codeIndex = 0;
  const movements = [];
  const snapshotRows = [];

  for (const row of rows) {
    const productCode = getProductCodeFromRow(row);
    const product = productMap.get(cleanText(productCode)) || null;
    const quantity = getQtyFromRow(row, product);
    if (!productCode || quantity < 0) {
      skipped += 1;
      errors.push({ productCode, message: !productCode ? 'Thiếu mã sản phẩm' : 'Tồn đầu không được âm' });
      continue;
    }
    if (!product) {
      skipped += 1;
      errors.push({ productCode, message: 'Không tìm thấy sản phẩm trong danh mục. Tồn kho ban đầu chỉ nhận mã sản phẩm đã có.' });
      continue;
    }
    const date = dateOnly(row.date || row.documentDate || row['Ngày'] || row['Ngay'] || dateUtil.todayVN());
    const docCode = cleanText(row.documentCode || row.code || row['Mã phiếu'] || row['Ma phieu']) || codeList[codeIndex++] || makeId('TD');
    // Tồn kho chỉ có 1 kho chính. HC/PC chỉ là nhóm in/gộp đơn, không ghi vào lịch sử tồn đầu.
    const warehouseCode = STOCK_WAREHOUSE_CODE || 'MAIN';
    const warehouseName = STOCK_WAREHOUSE_NAME || 'Kho chính';
    const productId = String(product.id || product._id || productCode);
    const productName = product.name || productCode;
    const note = cleanText(row.note || row['Ghi chú'] || row['Ghi chu']) || 'Import tồn đầu Excel';

    movements.push({
      id: makeId('ST'),
      date,
      productId,
      productCode: product?.code || productCode,
      productName,
      warehouseId: warehouseCode,
      warehouseCode,
      warehouseName,
      type: 'OPENING',
      direction: 'IN',
      quantity,
      qty: quantity,
      inQty: quantity,
      outQty: 0,
      balanceQty: quantity,
      refType: 'OPENING_STOCK_IMPORT',
      refId: makeId('OS'),
      refCode: docCode,
      note,
      createdAt: dateUtil.nowIso(),
      updatedAt: dateUtil.nowIso()
    });
    snapshotRows.push({
      productId,
      productCode: product?.code || productCode,
      productName,
      warehouseId: warehouseCode,
      warehouseCode,
      warehouseName,
      quantity
    });
    imported += 1;
  }

  if (movements.length) await insertManyInBatches(StockTransaction, movements);
  const inventoryResult = await setOpeningStockInventoriesBulk(snapshotRows);
  await addImportLog('openingStock', {
    imported,
    skipped,
    errors: errors.slice(0, 30),
    mode: 'setOpeningStockSnapshots',
    batchSize: IMPORT_BATCH_SIZE,
    stockTransactions: movements.length,
    inventoryRows: inventoryResult.inventoryRows,
    shortageCount: shortageReport.length,
    shortageReport: shortageReport.slice(0, 100)
  });
  return { imported, skipped, errors, shortageReport };
}

async function importImportOrders(rows = []) {
  let skipped = 0;
  const errors = [];
  const productMap = await preloadProductsByCode(rows);
  const importDocumentCodes = Array.from(new Set(rows.map(r => cleanText(r.documentCode || r.code || r['Số hóa đơn'] || r['So hoa don'] || r['Mã đơn'] || r['Ma don'])).filter(Boolean)));
  const existingOrders = await SalesOrder.find({ documentCode: { $in: importDocumentCodes } }).select('documentCode').lean().catch(() => []);
  const existingDocumentSet = new Set(existingOrders.map(o => cleanText(o.documentCode)));
const groups = groupRows(rows, (r) => `${cleanText(r.documentCode || r.code || r['Mã phiếu'] || r['Ma phieu']) || 'AUTO'}|${dateOnly(r.date || r['Ngày'] || r['Ngay'] || dateUtil.todayVN())}|${cleanText(r.supplier || r.supplierName || r['Nhà cung cấp'] || r['Nha cung cap']) || 'Import Excel'}`);
  const autoCodes = await buildRunningCodes(ImportOrder, 'PN', groups.length);
  let autoIdx = 0;
  const docs = [];
  const movements = [];
  const inventoryDeltas = new Map();
  const shortageReport = [];

  for (const group of groups) {
    const first = group[0] || {};
    const items = [];
    for (const row of group) {
      const productCode = getProductCodeFromRow(row);
      const product = productMap.get(cleanText(productCode));
      const quantity = getQtyFromRow(row, product);
      const costPrice = toNumber(product?.costPrice || 0);

      // Phiếu nhập kho: dòng SL = 0 nghĩa là không nhập sản phẩm này.
      // Bỏ qua an toàn, không ghi lỗi.
      if (quantity === 0) {
        skipped += 1;
        continue;
      }

      if (!product || quantity < 0) {
        skipped += 1;
        errors.push({ productCode, message: !product ? 'Không tìm thấy sản phẩm' : 'Số lượng nhập không được âm' });
        continue;
      }
      const pickingZone = normalizePickingZone(
        pickingZoneFrom(
          row.pickingZone || row['Khu bốc hàng'] || row['Khu boc hang'],
          product,
          row.warehouseCode || row.warehouse || row['Kho']
        ),
        PICKING_ZONES.HC
      );
      items.push({
        productId: String(product.id || product._id || product.code),
        productCode: product.code,
        productName: product.name,
        unit: product.unit,
        quantity,
        costPrice,
        amount: quantity * costPrice,
        pickingZone,
        // Alias in phiếu nhập cũ; InventoryPostingService vẫn luôn ghi MAIN.
        warehouseCode: legacyPrintGroupCode(pickingZone),
        warehouseName: pickingZoneLabel(pickingZone)
      });
    }
    if (!items.length) continue;
    const now = dateUtil.nowIso();
    const importDate = dateOnly(first.date || first.documentDate || first.importDate || first['Ngày'] || first['Ngay'] || dateUtil.todayVN());
    const doc = {
      id: makeId('IM'),
      code: cleanText(first.documentCode || first.code || first['Mã phiếu'] || first['Ma phieu']) || autoCodes[autoIdx++] || makeId('PN'),
      date: importDate,
      documentDate: importDate,
      importDate,
      supplier: cleanText(first.supplier || first.supplierName || first['Nhà cung cấp'] || first['Nha cung cap']) || 'Import Excel',
      supplierName: cleanText(first.supplier || first.supplierName || first['Nhà cung cấp'] || first['Nha cung cap']) || 'Import Excel',
      // Kho vật lý của chứng từ luôn là MAIN. HC/PC chỉ nằm ở pickingZone của từng dòng để phục vụ in/bốc hàng.
      warehouseCode: STOCK_WAREHOUSE_CODE,
      warehouseName: STOCK_WAREHOUSE_NAME,
      note: cleanText(first.note || first['Ghi chú'] || first['Ghi chu']) || 'Import Excel Mongo-native bulk',
      status: 'draft',
      items,
      totalQuantity: items.reduce((sum, item) => sum + toNumber(item.quantity), 0),
      totalAmount: items.reduce((sum, item) => sum + toNumber(item.amount), 0),
      createdAt: now,
      updatedAt: now
    };
    docs.push(doc);
    // Phiếu nhập import Excel chỉ tạo bản nháp; chưa ghi tồn kho.
  }

  const orderResult = await insertManyInBatches(ImportOrder, docs);
  const inventoryResult = { transactionCount: 0, inventoryRows: 0 };
  skipped += orderResult.errors.length;
  errors.push(...orderResult.errors.map((error) => ({ productCode: '', message: error.message })));
  const imported = Math.max(0, docs.length - orderResult.errors.length);
  await addImportLog('importOrders', {
    imported,
    skipped,
    errors: errors.slice(0, 30),
    mode: 'bulkImportOrders',
    batchSize: IMPORT_BATCH_SIZE,
    stockTransactions: inventoryResult.transactionCount,
    inventoryRows: inventoryResult.inventoryRows,
    shortageCount: shortageReport.length,
    shortageReport: shortageReport.slice(0, 100)
  });
  return { imported, skipped, errors, shortageReport };
}

async function importSalesOrders(rows = [], options = {}) {
  const startedAtMs = Date.now();
  const autoCutStock = Boolean(options.autoCutStock);
  let skipped = 0;
  const errors = [];
  const customerMap = await preloadCustomersByCode(rows);
  const importedCustomerCandidates = collectImportedCustomerCandidates(rows, customerMap);
  const productMap = await preloadProductsByCode(rows);
  const salesStaffUserMap = await preloadSalesStaffUsersByCode(rows);
  const productCodes = Array.from(new Set(rows.map(getProductCodeFromRow).map(cleanText).filter(Boolean)));
  const importDocumentCodes = Array.from(new Set(rows.map(getOrderDocumentCode).map(cleanText).filter((code) => code && code !== 'AUTO')));
  const existingSalesOrders = importDocumentCodes.length
    ? await SalesOrder.find({
        $or: [
          { documentCode: { $in: importDocumentCodes } },
          { code: { $in: importDocumentCodes } }
        ]
      }).select('documentCode code').lean().catch(() => [])
    : [];
  const existingDocumentSet = new Set(
    existingSalesOrders
      .flatMap((order) => [order.documentCode, order.code])
      .map(cleanText)
      .filter(Boolean)
  );
  const importedDocumentSet = new Set();
  // Lấy tồn kho theo mã sản phẩm. Không khóa cứng warehouseCode ở bước import DMS,
  // vì tồn đầu/import cũ có thể lưu warehouseCode rỗng hoặc thiếu warehouseCode.
  // Nếu chỉ query MAIN thì màn Tồn kho thấy còn hàng nhưng import lại báo còn 0.
  const stockByCode = await inventoryStockService.getAvailableStocks(productCodes);
  const productStockMap = new Map();
  for (const code of productCodes) {
    const normalizedCode = inventoryStockService.normalizeProductCode(code);
    productStockMap.set(cleanText(code), toNumber(stockByCode[normalizedCode]));
  }
  const groups = groupRows(rows, makeSalesOrderGroupKey);
  const autoOrderCodes = await buildRunningCodes(SalesOrder, 'BH', groups.length);
  let autoOrderIdx = 0;
  const orderDocs = [];
  // ERP/DMS chuẩn: import Excel DMS chỉ tạo đơn con chờ gộp/giao.
  // Không tạo Payment/Cashbook/AR ngay tại bước import, vì công nợ chỉ phát sinh khi giao hàng thành công.
  const shortageReport = [];

  for (const group of groups) {
    const first = group[0] || {};
    const resolvedSalesStaff = resolveSalesStaffForImportRow(first, salesStaffUserMap);
    const docCodeCheck = getOrderDocumentCode(first);
    if (docCodeCheck && docCodeCheck !== 'AUTO' && existingDocumentSet.has(docCodeCheck)) {
      skipped += group.length;
      errors.push({ documentCode: docCodeCheck, message: 'Đơn đã tồn tại - bỏ qua import' });
      continue;
    }
    if (docCodeCheck && docCodeCheck !== 'AUTO' && importedDocumentSet.has(docCodeCheck)) {
      skipped += group.length;
      errors.push({ documentCode: docCodeCheck, message: 'Đơn trùng trong cùng file - bỏ qua import' });
      continue;
    }

    const customerCode = getCustomerCodeFromRow(first);
    const customerCandidate = importedCustomerCandidates.get(cleanText(customerCode));
    const customer = customerMap.get(cleanText(customerCode)) || buildImportedCustomerPlaceholder(customerCandidate);
    if (!customer) {
      skipped += group.length;
      errors.push({
        customerCode,
        message: customerCode
          ? importedCustomerCandidateError(customerCandidate, customerCode)
          : 'Thiếu mã khách hàng / mã cửa hàng'
      });
      continue;
    }
    if (!resolvedSalesStaff.staffCode) {
      skipped += group.length;
      errors.push({ documentCode: docCodeCheck, message: 'Thiếu mã NVBH trong file Excel import' });
      continue;
    }
    if (!resolvedSalesStaff.found) {
      skipped += group.length;
      errors.push({
        documentCode: docCodeCheck,
        staffCode: resolvedSalesStaff.staffCode,
        message: `Mã NVBH ${resolvedSalesStaff.staffCode} không tồn tại trong users`
      });
      continue;
    }

    if (!resolvedSalesStaff.validRole) {
      skipped += group.length;
      errors.push({
        documentCode: docCodeCheck,
        staffCode: resolvedSalesStaff.staffCode,
        message: `Mã ${resolvedSalesStaff.staffCode} không phải nhân viên bán hàng`
      });
      continue;
    }

    if (!resolvedSalesStaff.hasUserStaffCode) {
      skipped += group.length;
      errors.push({
        documentCode: docCodeCheck,
        staffCode: resolvedSalesStaff.staffCode,
        message: `Tài khoản NVBH ${resolvedSalesStaff.staffCode} thiếu mã nhân viên trong users`
      });
      continue;
    }

    const items = [];
    let groupInvalid = false;
    for (const row of group) {
      const productCode = getProductCodeFromRow(row);
      const product = productMap.get(cleanText(productCode));
      let rawSaleQuantity = Object.prototype.hasOwnProperty.call(row, '__allowedSaleQuantity')
        ? toNumber(row.__allowedSaleQuantity)
        : getDmsQuantityFromRow(row, product);
      let rawPromoQuantity = Object.prototype.hasOwnProperty.call(row, '__allowedPromoQuantity')
        ? toNumber(row.__allowedPromoQuantity)
        : getDmsPromoQuantityFromRow(row, product);
      let deliveredQuantity = rawSaleQuantity + rawPromoQuantity;
      const originalSaleQuantity = rawSaleQuantity;
      const originalPromoQuantity = rawPromoQuantity;
      const salePrice = getDmsPriceFromRow(row, rawSaleQuantity);
      let lineAmount = getDmsAmountFromRow(row, rawSaleQuantity, salePrice);

      // Cột 4 của mẫu đơn con là giá bán chuẩn trong danh mục sản phẩm,
      // không phải giá thực tế lấy từ file DMS. Đóng băng giá này ngay lúc import
      // để việc in lại đơn cũ không thay đổi khi danh mục sản phẩm đổi giá.
      const productCatalogSalePrice = toNumber(
        product?.salePrice ?? product?.giaBan ?? product?.price ?? 0
      );
      let catalogPriceAfterVat = productCatalogSalePrice > 0
        ? productCatalogSalePrice
        : getDmsCatalogPriceAfterVatFromRow(row, rawSaleQuantity, salePrice);
      let preTaxPriceAtOrder = catalogPriceAfterVat > 0
        ? Math.round(catalogPriceAfterVat / 1.08)
        : 0;
      let vatAmountAtOrder = getDmsVatAmountForLine(row, rawSaleQuantity, salePrice, lineAmount);
      const pickingZoneAtOrder = normalizePickingZone(
        pickingZoneFrom(
          row.pickingZone || row['Khu bốc hàng'] || row['Khu boc hang'],
          first.pickingZone || first['Khu bốc hàng'] || first['Khu boc hang'],
          product,
          row.warehouseCode || row.warehouse || row['Mã Kho'] || row['Ma Kho'] || row['Kho']
        ),
        PICKING_ZONES.HC
      );
      const warehouseCode = legacyPrintGroupCode(pickingZoneAtOrder);
      const normalizedProductCode = cleanText(product?.code || productCode);
      // warehouseCode của dòng DMS chỉ là nhóm in/gộp đơn; tồn kho kiểm tra theo productCode chung.
      let availableQty = toNumber(productStockMap.get(normalizedProductCode));
      const isCutByStockRow = Boolean(
        row.__autoCutByStock ||
        Object.prototype.hasOwnProperty.call(row, '__allowedSaleQuantity') ||
        Object.prototype.hasOwnProperty.call(row, '__allowedPromoQuantity')
      );

      if (product && autoCutStock && !isCutByStockRow && deliveredQuantity > availableQty) {
        const allocation = allocateStockForSaleAndPromo(rawSaleQuantity, rawPromoQuantity, availableQty);
        rawSaleQuantity = allocation.allowedSaleQuantity;
        rawPromoQuantity = allocation.allowedPromoQuantity;
        deliveredQuantity = allocation.allowedDeliveredQuantity;
        lineAmount = rawSaleQuantity * salePrice;
        // Không thay đổi giá danh mục khi cắt số lượng theo tồn kho.
        // Cột 4 vẫn là product.salePrice đã chốt ở thời điểm import.
        catalogPriceAfterVat = productCatalogSalePrice > 0
          ? productCatalogSalePrice
          : getDmsCatalogPriceAfterVatFromRow(row, rawSaleQuantity, salePrice);
        preTaxPriceAtOrder = catalogPriceAfterVat > 0
          ? Math.round(catalogPriceAfterVat / 1.08)
          : 0;
        vatAmountAtOrder = getDmsVatAmountForLine(row, rawSaleQuantity, salePrice, lineAmount);
        shortageReport.push({
          documentCode: docCodeCheck === 'AUTO' ? '' : docCodeCheck,
          customerCode,
          customerName: getCustomerNameFromRow(first) || customer?.name || '',
          productCode: normalizedProductCode,
          productName: product.name,
          unit: product.unit || product.baseUnit || '',
          conversionRate: getPackingFromRow(row, product),
          sourcePackingRate: toNumber(row['Qc'] ?? row['QC'] ?? row.packingQty ?? row.conversionRate),
          requestedQuantity: originalSaleQuantity + originalPromoQuantity,
          importedQuantity: deliveredQuantity,
          missingQuantity: allocation.missingQuantity,
          missingSaleQuantity: allocation.missingSaleQuantity,
          missingPromoQuantity: allocation.missingPromoQuantity,
          cutAmount: allocation.missingSaleQuantity * salePrice,
          availableQuantity: availableQty
        });
      }

      // Dòng không có số lượng bán và không có số lượng khuyến mại thì bỏ qua,
      // không làm hỏng cả đơn DMS.
      if (product && deliveredQuantity <= 0 && (originalSaleQuantity + originalPromoQuantity) <= 0) {
        skipped += 1;
        continue;
      }

      if (!product || deliveredQuantity <= 0 || salePrice < 0 || (!autoCutStock && !isCutByStockRow && availableQty < deliveredQuantity)) {
        skipped += 1;
        groupInvalid = true;
        errors.push({
          productCode,
          message: !product
            ? 'Không tìm thấy sản phẩm'
            : (!autoCutStock && !isCutByStockRow && availableQty < deliveredQuantity)
              ? `Không đủ tồn kho: còn ${availableQty}`
              : 'Dòng bán hàng/khuyến mại không hợp lệ'
        });
        continue;
      }

      productStockMap.set(normalizedProductCode, Math.max(0, toNumber(productStockMap.get(normalizedProductCode)) - deliveredQuantity));
      const conversionRateAtOrder = getPackingFromRow(row, product);
      const catalogSalePriceAtOrder = productCatalogSalePrice > 0
        ? productCatalogSalePrice
        : (catalogPriceAfterVat || salePrice);
      const catalogSalePriceSource = productCatalogSalePrice > 0
        ? 'product.salePrice'
        : 'dms_legacy_fallback';
      // Cột 3 luôn bằng cột 4 / 1.08 theo mẫu đơn con đã chốt.
      const listPriceBeforeVat = catalogSalePriceAtOrder > 0
        ? Math.round(catalogSalePriceAtOrder / 1.08)
        : 0;
      const baseItem = {
        productId: String(product.id || product._id || product.code),
        productCode: product.code,
        productName: product.name,
        unit: product.unit,
        packingQty: conversionRateAtOrder,
        conversionRate: conversionRateAtOrder,
        conversionRateAtOrder,
        catalogSalePriceAtOrder,
        catalogSalePriceSource,
        priceAfterTaxBeforePromotionSource: catalogSalePriceSource,
        pickingZoneAtOrder,
        warehouseCodeAtOrder: warehouseCode,
        appliedPromotionRows: [],
        promotionRows: [],
        appliedPromotions: [],
        promotions: [],
        promotionCode: '',
        promotionDescription: '',
        discountPercent: 0,
        productSnapshot: {
          code: product.code,
          productCode: product.code,
          name: product.name,
          productName: product.name,
          unit: product.unit || product.baseUnit || '',
          salePrice: catalogSalePriceAtOrder,
          conversionRate: conversionRateAtOrder,
          pickingZone: pickingZoneAtOrder,
          warehouseCode,
          defaultWarehouse: warehouseCode
        },
        listPriceBeforeVat,
        preTaxPriceAtOrder: listPriceBeforeVat,
        listPriceAfterVat: catalogSalePriceAtOrder,
        priceAfterTaxBeforePromotionAtOrder: catalogSalePriceAtOrder,
        priceAfterTaxBeforePromotion: catalogSalePriceAtOrder,
        gsvAmount: getGsvAmountFromRow(row),
        nivAmount: getNivAmountFromRow(row),
        vatAmount: vatAmountAtOrder,
        vatAmountAtOrder,
        warehouseCode,
        warehouseName: cleanText(product.warehouseName || (warehouseCode === 'KHO_PC' ? 'KHO PC' : warehouseCode === 'KHO_HC' ? 'KHO HC' : 'Kho chính'))
      };

      if (rawSaleQuantity > 0) {
        items.push({
          ...baseItem,
          lineType: 'SALE',
          isPromo: false,
          lineTypeName: 'Hàng bán',
          cartons: getCartonsFromRow(row),
          units: getUnitsFromRow(row),
          quantity: rawSaleQuantity,
          deliveredQuantity: rawSaleQuantity,
          stockQuantity: rawSaleQuantity,
          soldQuantity: rawSaleQuantity,
          promoQuantity: 0,
          salePrice,
          price: salePrice,
          finalPrice: salePrice,
          finalPriceAtOrder: salePrice,
          priceAfterTaxAfterPromotion: salePrice,
          priceAfterPromotion: salePrice,
          lineAmountAtOrder: lineAmount,
          lineAmount,
          amount: lineAmount
        });
      }

      if (rawPromoQuantity > 0) {
        items.push({
          ...baseItem,
          lineType: 'PROMO',
          isPromo: true,
          lineTypeName: 'Xuất khuyến mại',
          cartons: 0,
          units: rawPromoQuantity,
          quantity: rawPromoQuantity,
          deliveredQuantity: rawPromoQuantity,
          stockQuantity: rawPromoQuantity,
          soldQuantity: 0,
          promoCartons: getPromoCartonsFromRow(row) + getPromoCartons2FromRow(row),
          promoUnits: getPromoUnitsFromRow(row) + getPromoUnits2FromRow(row),
          promoQuantity: rawPromoQuantity,
          salePrice: 0,
          referenceSalePrice: salePrice,
          finalPrice: 0,
          finalPriceAtOrder: 0,
          priceAfterTaxAfterPromotion: 0,
          price: 0,
          lineAmountAtOrder: 0,
          lineAmount: 0,
          amount: 0
        });
      }
    }
    // Không bỏ cả hóa đơn chỉ vì 1 dòng lỗi.
    // Với đơn DMS dài, một dòng thiếu mã/thiếu tồn không được làm mất toàn bộ đơn của khách.
    if (!items.length) continue;

    const totalQuantity = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
    const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const paidAmount = Math.min(toNumber(first.paidAmount ?? first['Đã thu'] ?? first['Da thu']), totalAmount);
    const now = dateUtil.nowIso();
    const doc = {
      id: makeId('SO'),
      code: docCodeCheck === 'AUTO' ? (autoOrderCodes[autoOrderIdx++] || makeId('BH')) : docCodeCheck,
      documentCode: docCodeCheck === 'AUTO' ? '' : docCodeCheck,
      invoiceCode: docCodeCheck === 'AUTO' ? '' : docCodeCheck,
      date: getDateFromRow(first),
      orderDate: getDateFromRow(first),
      deliveryDate: getDateFromRow(first),
      customerId: String(customer.id || customer._id || customer.code),
      customerCode: customer.code,
      customerName: getCustomerNameFromRow(first) || customer.name,
      customerPhone: customer.phone || '',
      customerAddress: customer.address || '',
      __autoCreateCustomer: customer.__autoCreateCustomer
        ? {
            code: customer.code,
            name: customer.name,
            address: AUTO_CREATED_CUSTOMER_ADDRESS
          }
        : null,
      // Mã NVBH lấy nguyên từ Excel; tên NVBH lấy từ users Mongo theo mã NVBH.
      staffCode: resolvedSalesStaff.staffCode,
      salesStaffCode: resolvedSalesStaff.salesStaffCode,
      staffName: resolvedSalesStaff.staffName,
      salesStaffName: resolvedSalesStaff.salesStaffName,
      routeCode: getRouteCodeFromRow(first),
      note: cleanText(first.note || first['Ghi chú'] || first['Ghi chu']) || 'Import Excel DMS bulk',
      source: 'DMS',
      sourceType: 'dms_import',
      orderSource: 'DMS',
      orderSourceName: 'Từ DMS',
      vatInvoiceRequired: true,
      vatInvoiceDecisionSource: 'default',
      vatInvoiceNote: '',
      vatInvoiceUpdatedAt: '',
      vatInvoiceUpdatedBy: '',
      // DMS_DIRECT_PRICE_LOCK_START
      saleMethod: DIRECT_PRICE,
      saleMode: DIRECT_PRICE,
      pricingMode: DIRECT_PRICE,
      orderPricingMode: DIRECT_PRICE,
      priceLocked: true,
      lockedPrice: true,
      lockedPromotion: false,
      isPromotionSale: false,
      promotionCalculated: false,
      promotionMode: 'none',
      promotions: [],
      promotionRows: [],
      totalPromotionAmount: 0,
      promotionAmount: 0,
      promotionValue: 0,
      isPromotionSale: false,
      grossAmount: totalAmount,
      totalGrossAmount: totalAmount,
      grossAmountBeforePromotion: totalAmount,
      discountAmount: 0,
      totalDiscountAmount: 0,
      promotionAmount: 0,
      totalPromotionAmount: 0,
      netAmount: totalAmount,
      goodsAmountAfterPromotion: totalAmount,
      // DMS_DIRECT_PRICE_LOCK_END
      importSource: 'excel_dms',
      isImported: true,
      isChildOrder: true,
      masterOrderId: '',
      masterOrderCode: '',
      mergeStatus: 'unmerged',
      deliveryStatus: 'pending',
      items,
      totalQuantity,
      totalAmount,
      grandTotal: totalAmount,
      paidAmount: 0,
      cashCollected: 0,
      bankCollected: 0,
      paymentAmount: 0,
      debtAmount: totalAmount,
      debt: totalAmount,
      arBalance: totalAmount,
      arStatus: 'pending',
      lifecycleStatus: 'pending',
      status: 'pending',
      stockPosted: false,
      stockPostedAt: '',
      stockPostedBy: '',
      // Kho vật lý của chứng từ luôn là MAIN. HC/PC chỉ nằm ở pickingZone của từng dòng để phục vụ in/bốc hàng.
      warehouseCode: STOCK_WAREHOUSE_CODE,
      warehouseName: STOCK_WAREHOUSE_NAME,
      createdAt: now,
      updatedAt: now
    };
    Object.assign(doc, applyOrderSourceFields(doc, ORDER_SOURCE.DMS));
    orderDocs.push(doc);
    if (doc.documentCode) importedDocumentSet.add(cleanText(doc.documentCode));
  }

  const postedBy = options.userName || options.username || options.createdBy || 'excel_import';
  const chunkSize = Number(process.env.SALES_IMPORT_TX_CHUNK_SIZE || 25);
  const importSessionId = cleanText(options.importSessionId || options.sessionId);
  const totalChunks = Math.max(1, Math.ceil(orderDocs.length / Math.max(1, chunkSize)));
  const atomicResults = await runAtomicChunks(
    orderDocs,
    async (chunk, { session }) => {
      const customerResult = await ensureImportedCustomersForOrderChunk(chunk, {
        session,
        createdBy: postedBy,
        importSessionId
      });
      const insertedOrders = await SalesOrder.insertMany(
        chunk.map((row) => canonicalizeOperationalStaff(row)),
        {
          session,
          ordered: true
        }
      );

      const transactions = await InventoryPostingService.postSalesOrdersBulkOut(
        insertedOrders,
        { session }
      );
      const stockTransactions = Array.isArray(transactions)
        ? transactions.filter((row) => !row?.skipped).length
        : 0;

      const postedAt = dateUtil.nowIso();
      await SalesOrder.updateMany(
        { _id: { $in: insertedOrders.map((order) => order._id) } },
        {
          $set: {
            stockPosted: true,
            stockPostedAt: postedAt,
            stockPostedBy: postedBy,
            updatedAt: postedAt
          }
        },
        { session }
      );

      return {
        imported: insertedOrders.length,
        stockTransactions,
        createdCustomers: Number(customerResult.createdCustomers || 0)
      };
    },
    {
      chunkSize,
      onChunkComplete: importSessionId
        ? async ({ completedChunks, completedRows, totalRows }) => {
            const ratio = totalRows > 0 ? completedRows / totalRows : completedChunks / totalChunks;
            await importSessionService.updateProgress(importSessionId, {
              percent: 20 + Math.round(Math.min(1, ratio) * 70),
              step: `committing:${completedChunks}/${totalChunks}`
            });
          }
        : null
    }
  );

  let imported = 0;
  let stockTransactions = 0;
  let createdCustomers = 0;
  for (const result of atomicResults) {
    if (result.ok) {
      imported += Number(result.value?.imported || 0);
      stockTransactions += Number(result.value?.stockTransactions || 0);
      createdCustomers += Number(result.value?.createdCustomers || 0);
      continue;
    }
    skipped += result.count;
    const failedChunk = orderDocs.slice(result.chunkIndex * chunkSize, result.chunkIndex * chunkSize + result.count);
    for (const order of failedChunk) {
      errors.push({
        documentCode: order.documentCode || order.code || '',
        customerCode: order.customerCode || '',
        code: result.code,
        message: result.error
      });
    }
  }

  const durationMs = Date.now() - startedAtMs;
  await addImportLog('salesOrders', {
    imported,
    skipped,
    failed: orderDocs.length - imported,
    errors: errors.slice(0, 100),
    mode: 'atomicBulkSalesOrderChunks',
    batchSize: chunkSize,
    durationMs,
    ordersPerSecond: durationMs > 0 ? Number((imported * 1000 / durationMs).toFixed(2)) : imported,
    stockTransactionsPerSecond: durationMs > 0 ? Number((stockTransactions * 1000 / durationMs).toFixed(2)) : stockTransactions,
    uniqueProducts: productCodes.length,
    createdCustomers,
    payments: 0,
    cashbook: 0,
    returnDrafts: 0,
    stockTransactions,
    inventoryRows: stockTransactions,
    chunks: atomicResults.map((result) => ({
      chunkIndex: result.chunkIndex,
      ok: result.ok,
      count: result.count,
      imported: Number(result.value?.imported || 0),
      createdCustomers: Number(result.value?.createdCustomers || 0),
      code: result.code || '',
      error: result.error || ''
    })),
    shortageCount: shortageReport.length,
    shortageReport: shortageReport.slice(0, 100)
  });
  return {
    imported,
    failed: orderDocs.length - imported,
    skipped,
    errors,
    createdCustomers,
    shortageReport,
    chunks: atomicResults,
    performance: {
      mode: 'atomicBulkSalesOrderChunks',
      durationMs,
      batchSize: chunkSize,
      uniqueProducts: productCodes.length,
      ordersPerSecond: durationMs > 0 ? Number((imported * 1000 / durationMs).toFixed(2)) : imported,
      stockTransactionsPerSecond: durationMs > 0 ? Number((stockTransactions * 1000 / durationMs).toFixed(2)) : stockTransactions
    }
  };
}

async function importOpeningDebt(rows = []) {
  let skipped = 0;
  const errors = [];
  const customerMap = await preloadCustomersByCode(rows);
  const docs = [];

  for (const row of rows) {
    const customerCode = getCustomerCodeFromRow(row);
    const customer = customerMap.get(cleanText(customerCode)) || await findCustomerByAny(customerCode);
    const amount = toNumber(row.amount ?? row['Số tiền'] ?? row['So tien'] ?? row['Công nợ'] ?? row['Cong no'] ?? number(row, ['amount', 'số tiền', 'so tien', 'công nợ', 'cong no', 'nợ đầu']));
    if (!customer || amount < 0) {
      skipped += 1;
      errors.push({ customerCode, message: !customer ? 'Không tìm thấy khách hàng' : 'Công nợ đầu không được âm' });
      continue;
    }
    const now = dateUtil.nowIso();
    docs.push({
      id: makeId('PM'),
      date: dateOnly(row.date || dateUtil.todayVN()),
      type: 'opening_debt',
      refType: 'opening',
      refId: '',
      refCode: 'OPENING',
      customerId: String(customer.id || customer._id || customer.code),
      customerCode: customer.code,
      customerName: customer.name,
      debit: amount,
      credit: 0,
      amount,
      note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']) || 'Công nợ đầu kỳ import Excel',
      status: 'posted',
      createdAt: now,
      updatedAt: now
    });
  }

  const result = await insertManyInBatches(ArLedger, docs);
  skipped += result.errors.length;
  errors.push(...result.errors.map((e) => ({ customerCode: '', message: e.message })));
  const imported = Math.max(0, docs.length - result.errors.length);
  await addImportLog('openingDebt', { imported, skipped, errors: errors.slice(0, 30), mode: 'insertMany', batchSize: IMPORT_BATCH_SIZE });
  return { imported, skipped, errors };
}

function normalizeImportPaymentMethod(row = {}) {
  const raw = normalizeText(
    row.method ||
    row.paymentMethod ||
    row['Phương thức'] ||
    row['Phuong thuc'] ||
    row['Hình thức'] ||
    row['Hinh thuc'] ||
    'cash'
  );
  return raw.includes('chuyen') || raw.includes('transfer') || raw.includes('bank')
    ? 'transfer'
    : 'cash';
}

async function importDebtCollections(rows = [], options = {}) {
  let skipped = 0;
  let imported = 0;
  const errors = [];
  const customerMap = await preloadCustomersByCode(rows);
  const importSessionId = cleanText(options.importSessionId || options.sessionId || 'manual');

  for (const [rowIndex, row] of rows.entries()) {
    const customerCode = getCustomerCodeFromRow(row);
    try {
      const customer = customerMap.get(cleanText(customerCode)) || await findCustomerByAny(customerCode);
      const amount = toNumber(
        row.amount ??
        row['Số tiền'] ??
        row['So tien'] ??
        row['Tiền thu'] ??
        row['Tien thu'] ??
        number(row, ['amount', 'số tiền', 'so tien', 'tiền thu', 'tien thu'])
      );
      if (!customer) {
        const error = new Error('Không tìm thấy khách hàng');
        error.code = 'CUSTOMER_NOT_FOUND';
        throw error;
      }
      if (amount <= 0) {
        const error = new Error('Số tiền thu phải lớn hơn 0');
        error.code = 'INVALID_RECEIPT_AMOUNT';
        throw error;
      }

      const sourceRow = Number(row.__sourceRow || row.__rowNumber || rowIndex + 2);
      const explicitCode = cleanText(row.code || row.receiptCode || row['Mã phiếu'] || row['Ma phieu']);
      const importIdempotencyKey = [
        'EXCEL_DEBT',
        importSessionId,
        sourceRow,
        cleanText(customer.code || customerCode),
        amount
      ].join('|');

      const result = await financialService.createReceipt({
        code: explicitCode,
        date: dateOnly(row.date || dateUtil.todayVN()),
        customerId: String(customer.id || customer._id || customer.code),
        customerCode: customer.code,
        customerName: customer.name,
        method: normalizeImportPaymentMethod(row),
        amount,
        staffName: cleanText(row.staffName || row['Người thu'] || row['Nguoi thu'] || row['Nhân viên']),
        note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']) || 'Import thu công nợ Excel',
        source: 'excel_debt_collection_import',
        refType: 'debt_collection_import',
        importIdempotencyKey
      });

      if (result?.error) {
        const error = new Error(result.error);
        error.status = result.status;
        error.code = result.code || 'DEBT_COLLECTION_IMPORT_FAILED';
        throw error;
      }
      if (result?.duplicate) skipped += 1;
      else imported += 1;
    } catch (error) {
      skipped += 1;
      errors.push({
        row: Number(row.__sourceRow || row.__rowNumber || rowIndex + 2),
        customerCode,
        code: error?.code || 'DEBT_COLLECTION_IMPORT_FAILED',
        message: error?.message || String(error)
      });
    }
  }

  await addImportLog('debtCollections', {
    imported,
    skipped,
    errors: errors.slice(0, 100),
    mode: 'atomicReceiptArFundPerRow',
    importSessionId
  });
  return { imported, skipped, errors };
}

async function importCashbook(rows = []) {
  let skipped = 0;
  const errors = [];
  const docs = [];
  const inCount = rows.filter((row) => {
    const typeRaw = normalizeText(row.type || row['Loại'] || row['Loai'] || row['Thu chi'] || 'in');
    return !(typeRaw.includes('chi') || typeRaw === 'out');
  }).length;
  const outCount = rows.length - inCount;
  const inCodes = await buildRunningCodes(Cashbook, 'PT', inCount);
  const outCodes = await buildRunningCodes(Cashbook, 'PC', outCount);
  let inIdx = 0;
  let outIdx = 0;

  for (const row of rows) {
    const typeRaw = normalizeText(row.type || row['Loại'] || row['Loai'] || row['Thu chi'] || 'in');
    const type = typeRaw.includes('chi') || typeRaw === 'out' ? 'out' : 'in';
    const amount = toNumber(row.amount ?? row['Số tiền'] ?? row['So tien'] ?? number(row, ['amount', 'số tiền', 'so tien']));
    if (amount <= 0) {
      skipped += 1;
      errors.push({ message: 'Số tiền phải lớn hơn 0' });
      continue;
    }
    const now = dateUtil.nowIso();
    docs.push({
      id: makeId('CB'),
      code: cleanText(row.code || row['Mã phiếu'] || row['Ma phieu']) || (type === 'out' ? outCodes[outIdx++] : inCodes[inIdx++]),
      date: dateOnly(row.date || row['Ngày'] || row['Ngay'] || dateUtil.todayVN()),
      type,
      source: cleanText(row.source || row['Nguồn'] || row['Nguon'] || row['Nhóm tiền']) || 'import_excel',
      refType: 'manual_import',
      refId: '',
      refCode: '',
      staffName: cleanText(row.staffName || row['Người nộp/nhận'] || row['Nguoi nop'] || row['Nhân viên']),
      amount,
      note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']) || 'Import quỹ tiền Excel',
      status: 'posted',
      createdAt: now,
      updatedAt: now
    });
  }

  const result = await insertManyInBatches(Cashbook, docs);
  skipped += result.errors.length;
  errors.push(...result.errors.map((e) => ({ message: e.message })));
  const imported = Math.max(0, docs.length - result.errors.length);
  await addImportLog('cashbook', { imported, skipped, errors: errors.slice(0, 30), mode: 'insertMany', batchSize: IMPORT_BATCH_SIZE });
  return { imported, skipped, errors };
}



function rowBase(row = {}) {
  const rowNo = row.__rowNo || row.rowNo || row.dong || row['Dòng'] || row['Dong'] || '';
  const sourceFile = cleanText(row.sourceFile || row.__sourceFile || row.fileName || row.originalFileName || '');
  return {
    rowNo,
    sourceRowNo: rowNo,
    sourceFile,
    fileName: sourceFile,
    raw: row
  };
}

function normalizeExcelHeaderKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function getRowValueByAliases(row = {}, aliases = []) {
  if (!row || typeof row !== 'object') return '';
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias) && cleanText(row[alias])) return row[alias];
  }
  const aliasSet = new Set(aliases.map(normalizeExcelHeaderKey).filter(Boolean));
  for (const key of Object.keys(row)) {
    if (aliasSet.has(normalizeExcelHeaderKey(key)) && cleanText(row[key])) return row[key];
  }
  return '';
}

const SALES_STAFF_CODE_ALIASES = [
  'staffCode', 'salesStaffCode', 'salesmanCode', 'employeeCode', 'sellerCode', 'saleCode', 'salesCode',
  'Mã NVBH', 'Ma NVBH', 'Mã NVTT', 'Ma NVTT', 'Mã NV', 'Ma NV', 'Mã Nv', 'Ma Nv',
  'Mã nhân viên', 'Ma nhan vien', 'Mã nhân viên TT', 'Ma nhan vien TT',
  'Mã nhân viên bán hàng', 'Ma nhan vien ban hang', 'Mã NV bán hàng', 'Ma NV ban hang',
  'NV bán hàng', 'NV ban hang', 'Nhân viên bán hàng', 'Nhan vien ban hang',
  'Salesman Code', 'Sales Rep Code', 'Sales Staff Code', 'Seller Code', 'Employee Code',
  'Mã nhân viên', 'Mã NVBH', 'Mã NVTT'
];

const SALES_STAFF_NAME_ALIASES = [
  'staffName', 'salesStaffName', 'salesmanName', 'employeeName', 'sellerName',
  'Tên NVBH', 'Ten NVBH', 'Tên NVTT', 'Ten NVTT', 'Tên NV', 'Ten NV', 'Tên Nv', 'Ten Nv',
  'Tên nhân viên', 'Ten nhan vien', 'Tên nhân viên bán hàng', 'Ten nhan vien ban hang',
  'Nhân viên bán hàng', 'Nhan vien ban hang', 'NVBH', 'NVTT',
  'Salesman', 'Sales Rep', 'Sales Staff', 'Seller Name', 'Employee Name'
];

function getSalesStaffCodeFromRow(row = {}) {
  return cleanText(getRowValueByAliases(row, SALES_STAFF_CODE_ALIASES));
}

function getSalesStaffNameFromRow(row = {}) {
  return cleanText(getRowValueByAliases(row, SALES_STAFF_NAME_ALIASES));
}

function addUserStaffAlias(map, value, user) {
  const key = cleanText(value);
  if (key && user && !map.has(key)) map.set(key, user);
}

function getUserStaffName(user = {}) {
  return cleanText(pickSalesStaffName(user));
}

// DMS_IMPORT_SALES_STAFF_USERS_ONLY_START
function getUserStaffCode(user = {}) {
  // NVBH nghiệp vụ ưu tiên mã chuyên biệt; với màn Tài khoản hiện tại,
  // mã nhân viên hợp lệ có thể đang lưu ở users.code/users.staffCode.
  // Không dùng username/id/_id để match nhân viên.
  return cleanText(pickSalesStaffCode(user) || pickUserAccountSalesStaffCode(user));
}
// DMS_IMPORT_SALES_STAFF_USERS_ONLY_END

function staffCodeLookupClauses(codes = [], fields = USER_ACCOUNT_SALES_STAFF_CODE_FIELDS) {
  const textValues = Array.from(new Set((codes || []).map(cleanText).filter(Boolean)));
  const numericValues = Array.from(new Set(textValues.filter((value) => /^\d+$/.test(value)).map(Number)));
  const regexValues = textValues.map((value) => new RegExp(`^${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
  const clauses = [];
  for (const field of fields || []) {
    if (textValues.length) clauses.push({ [field]: { $in: textValues } });
    if (numericValues.length) clauses.push({ [field]: { $in: numericValues } });
    for (const rx of regexValues) clauses.push({ [field]: rx });
  }
  return clauses;
}

function isSalesStaffUser(user = {}) {
  const role = cleanText(user.role).toLowerCase();
  return ['sales', 'admin', 'nvbh'].includes(role);
}

async function preloadSalesStaffUsersByCode(rows = []) {
  const codes = Array.from(new Set((rows || []).map((row) => pickSalesStaffCode(row) || getSalesStaffCodeFromRow(row)).map(cleanText).filter(Boolean)));
  if (!codes.length) return new Map();
  const users = await User.find({
    isActive: { $ne: false },
    $or: staffCodeLookupClauses(codes)
  })
    .select('code staffCode employeeCode salesStaffCode salesStaffName salesmanCode salesmanName maNhanVien fullName name role isActive')
    .lean()
    .catch(() => []);

  const map = new Map();
  for (const user of users || []) {
    USER_ACCOUNT_SALES_STAFF_CODE_FIELDS.map((field) => user[field]).forEach((value) => addUserStaffAlias(map, value, user));
  }
  return map;
}

function resolveSalesStaffForImportRow(row = {}, salesStaffUserMap = new Map()) {
  // Quy tắc chuẩn: mã NVBH lấy từ salesStaffCode/salesmanCode/employeeCode/maNhanVien.
  // Tên NVBH không lấy từ Excel/raw; chỉ tra từ users Mongo theo mã canonical.
  const excelStaffCode = cleanText(pickSalesStaffCode(row) || getSalesStaffCodeFromRow(row));
  const user = excelStaffCode ? salesStaffUserMap.get(excelStaffCode) : null;
  const snapshot = user ? buildSalesStaffSnapshot(user) : buildSalesStaffSnapshot(row);
  const userStaffCode = user ? getUserStaffCode(user) : '';

  return {
    // Mã lưu theo Excel để giữ lineage DMS; tên bắt buộc lấy từ users.
    staffCode: excelStaffCode,
    salesStaffCode: snapshot.salesStaffCode || userStaffCode || excelStaffCode,
    staffName: '',
    salesStaffName: user ? snapshot.salesStaffName : '',
    salesmanCode: snapshot.salesmanCode || userStaffCode || excelStaffCode,
    salesmanName: user ? snapshot.salesmanName : '',
    user,
    found: !!user,
    validRole: !!user && isSalesStaffUser(user),
    hasUserStaffCode: !!userStaffCode
  };
}


async function getStockMapByProductCode(rows = []) {
  const codes = Array.from(new Set(rows.map(getProductCodeFromRow).map(cleanText).filter(Boolean)));
  if (!codes.length) return new Map();
  const stockByCode = await inventoryStockService.getAvailableStocks(codes);
  const map = new Map();
  for (const code of codes) {
    map.set(code, toNumber(stockByCode[inventoryStockService.normalizeProductCode(code)]));
  }
  return map;
}


function getOrderDocumentCode(row = {}) {
  // DMS/Unilever: mã chứng từ chuẩn phải lấy từ cột "Số hóa đơn" trước tiên.
  // File DMS có thêm cột "Số hóa đơn trong 1 ngày" giá trị 0/1; nếu mapping nhầm
  // cột này vào documentCode thì các dòng sẽ bị gom sai và có thể làm mất đơn Hải Miên.
  const rawInvoiceCode = cleanText(
    row['Số Đơn'] ||
    row['So Don'] ||
    row['Số đơn'] ||
    row['So don'] ||
    row['Số hóa đơn'] ||
    row['So hoa don'] ||
    row['Số hoá đơn'] ||
    row['Số hoá đơn '] ||
    row['So hoa don '] ||
    row.invoiceCode ||
    row.orderCode ||
    row['Mã đơn'] ||
    row['Ma don'] ||
    row['Mã phiếu'] ||
    row['Ma phieu']
  );
  if (rawInvoiceCode) return rawInvoiceCode;

  const mappedDocumentCode = cleanText(row.documentCode);
  // Không nhận 0/1/2... làm mã đơn, vì đó thường là cột "Số hóa đơn trong 1 ngày".
  if (mappedDocumentCode && !/^\d{1,3}$/.test(mappedDocumentCode)) return mappedDocumentCode;

  // Chỉ dùng row.code khi chắc chắn đó là mã đơn, không phải mã sản phẩm dạng số.
  const genericCode = cleanText(row.code);
  if (genericCode && !/^\d{5,}$/.test(genericCode)) return genericCode;

  return 'AUTO';
}

function makeImportOrderGroupKey(row = {}) {
  return [
    getOrderDocumentCode(row),
    getDateFromRow(row),
    cleanText(row.supplier || row.supplierName || row['Nhà cung cấp'] || row['Nha cung cap']) || 'Import Excel'
  ].join('|');
}

function makeSalesOrderGroupKey(row = {}) {
  const documentCode = getOrderDocumentCode(row);
  // Nếu file thiếu Số hóa đơn thì không gom cứng theo khách/ngày,
  // vì 2 đơn cùng khách đứng sát nhau sẽ bị hiểu là 1 đơn.
  const safeDocumentCode = documentCode && documentCode !== 'AUTO'
    ? documentCode
    : `AUTO_ROW_${row.__rowNo || row.rowNo || makeId('ROW')}`;
  return [
    cleanText(row.__sourceFile || row.sourceFile || row.fileName || ''),
    safeDocumentCode,
    getDateFromRow(row),
    getCustomerCodeFromRow(row)
  ].join('|');
}

function cloneRawRowForImport(row = {}) {
  const cloned = { ...(row.raw || row) };
  delete cloned.raw;
  delete cloned.errors;
  delete cloned.valid;
  return cloned;
}

function flattenCommitRows(rows = []) {
  const result = [];
  for (const row of rows || []) {
    const source = Array.isArray(row.__importRows) ? row.__importRows : (Array.isArray(row.rows) ? row.rows : null);
    if (source) {
      for (const child of source) result.push(cloneRawRowForImport(child));
    } else {
      result.push(cloneRawRowForImport(row));
    }
  }
  return result;
}

function flattenAdjustedCommitRows(rows = []) {
  const result = [];
  for (const row of rows || []) {
    const source = Array.isArray(row.__adjustedRows)
      ? row.__adjustedRows
      : (Array.isArray(row.__importRows) ? row.__importRows : (Array.isArray(row.rows) ? row.rows : null));
    if (source) {
      for (const child of source) {
        const raw = cloneRawRowForImport(child);
        if (raw.__skipImportLine) continue;
        // Giữ kết quả validate: mã NVBH lấy từ Excel, tên NVBH đã resolve từ users.
        raw.staffCode = '';
        raw.salesStaffCode = row.salesStaffCode || row.salesmanCode || raw.salesStaffCode || '';
        raw.staffName = '';
        raw.salesStaffName = row.salesStaffName || row.salesmanName || '';
        result.push(raw);
      }
    } else {
      const raw = cloneRawRowForImport(row);
      raw.staffCode = '';
      raw.salesStaffCode = row.salesStaffCode || row.salesmanCode || raw.salesStaffCode || '';
      raw.staffName = '';
      raw.salesStaffName = row.salesStaffName || row.salesmanName || '';
      if (!raw.__skipImportLine) result.push(raw);
    }
  }
  return result;
}

function applyAdjustedQuantityToRow(row = {}, allowedSaleQuantity = 0, allowedPromoQuantity = 0, salePrice = 0) {
  const adjusted = { ...(row.raw || row) };
  const saleQty = Math.max(0, toNumber(allowedSaleQuantity));
  const promoQty = Math.max(0, toNumber(allowedPromoQuantity));
  adjusted.quantity = saleQty;
  adjusted.qty = saleQty;
  adjusted.stockQuantity = saleQty + promoQty;
  adjusted.deliveredQuantity = saleQty + promoQty;
  adjusted.soldQuantity = saleQty;
  adjusted.cartons = 0;
  adjusted.units = saleQty;
  adjusted.promoCartons = 0;
  adjusted.promoUnits = promoQty;
  adjusted.promoQuantity = promoQty;
  adjusted.actualAmount = saleQty * salePrice;
  adjusted.amount = saleQty * salePrice;
  adjusted.lineAmount = saleQty * salePrice;
  adjusted.__allowedSaleQuantity = saleQty;
  adjusted.__allowedPromoQuantity = promoQty;
  adjusted.__autoCutByStock = true;
  if ((saleQty + promoQty) <= 0) adjusted.__skipImportLine = true;
  return adjusted;
}

function normalizeShortageRows(shortages = []) {
  if (!Array.isArray(shortages)) return [];
  const seen = new Set();
  const rows = [];

  for (const item of shortages) {
    if (!item || typeof item !== 'object') continue;
    const documentCode = cleanText(item.documentCode || item.orderCode || item.code || item.refCode || '');
    const productCode = cleanText(item.productCode || item.code || item.productId || '');
    const missingQuantity = toNumber(item.missingQuantity ?? item.shortageQuantity ?? item.missingQty);
    const cutAmount = toNumber(item.cutAmount ?? item.shortageAmount ?? item.amount);
    const orderedQuantity = toNumber(item.orderedQuantity ?? item.orderQuantity ?? item.quantity);
    const availableQuantity = toNumber(item.availableQuantity ?? item.stockQuantity ?? item.availableStock);
    const allowedQuantity = toNumber(item.allowedQuantity ?? item.importedQuantity ?? item.adjustedQuantity);

    // Không đưa dòng rỗng/ảo vào báo cáo thiếu hàng.
    if (!documentCode && !productCode && missingQuantity <= 0 && cutAmount <= 0) continue;

    const key = [
      documentCode,
      productCode,
      orderedQuantity,
      availableQuantity,
      allowedQuantity,
      missingQuantity,
      cutAmount
    ].join('|');

    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      ...item,
      documentCode: documentCode || item.documentCode || item.orderCode || item.refCode || '',
      productCode: productCode || item.productCode || item.productId || '',
      missingQuantity,
      cutAmount
    });
  }

  return rows;
}

function summarizeOrderShortages(shortages = []) {
  const safeShortages = normalizeShortageRows(shortages);
  const totalMissingQty = safeShortages.reduce((sum, item) => sum + toNumber(item.missingQuantity), 0);
  const totalCutAmount = safeShortages.reduce((sum, item) => sum + toNumber(item.cutAmount), 0);
  return { totalMissingQty, totalCutAmount };
}



async function preloadPromotionProductsByCode(rows = []) {
  const codes = Array.from(new Set(rows.map((row) => cleanText(row.productCode || row['Mã sản phẩm'] || row['Ma san pham'] || get(row, ['mã sản phẩm', 'ma san pham', 'productCode']))).filter(Boolean)));
  if (!codes.length) return new Map();
  const products = await Product.find({ $or: [{ code: { $in: codes } }, { productCode: { $in: codes } }, { sku: { $in: codes } }, { barcode: { $in: codes } }] }).lean();
  return new Map(products.map((p) => [cleanText(p.code || p.productCode || p.sku || p.barcode), p]));
}

function pickPromotionProductRulePayload(row = {}) {
  const programCode = cleanText(row.programCode || row.code || row['Mã chương trình'] || row['Ma chuong trinh'] || row['Mã CTKM'] || row['Ma CTKM'] || row['Mã chương trình KM'] || row['Ma chuong trinh KM']);
  const productCode = cleanText(row.productCode || row['Mã sản phẩm'] || row['Ma san pham']);
  return {
    ...rowBase(row),
    programCode,
    programName: cleanText(row.programName || row.name || row['Nội dung chương trình'] || row['Noi dung chuong trinh'] || row['Nội dung chương trình KM'] || row['Noi dung chuong trinh KM']),
    productCode,
    productName: cleanText(row.productName || row['Tên sản phẩm'] || row['Ten san pham']),
    discountPercent: promotionService.normalizeDiscountPercent(row.discountPercent ?? row.discount ?? row['Chiết khấu'] ?? row['Chiet khau'] ?? row['CK']),
    productMatched: false,
    missingProduct: false,
    source: 'excel-import'
  };
}

function pickPromotionGroupItemPayload(row = {}) {
  return {
    ...rowBase(row),
    programCode: cleanText(row.programCode || row.groupCode || row.code || row['Mã chương trình KM'] || row['Ma chuong trinh KM'] || row['Mã chương trình'] || row['Ma chuong trinh'] || row['Mã nhóm sản phẩm'] || row['Ma nhom san pham']),
    productCode: cleanText(row.productCode || row['Mã sản phẩm'] || row['Ma san pham']),
    productName: cleanText(row.productName || row['Tên sản phẩm'] || row['Ten san pham'])
  };
}

function pickPromotionGroupRulePayload(row = {}) {
  return {
    ...rowBase(row),
    programCode: cleanText(row.programCode || row.groupCode || row.code || row['Mã nhóm sản phẩm'] || row['Ma nhom san pham'] || row['Mã chương trình KM'] || row['Ma chuong trinh KM'] || row['Mã chương trình'] || row['Ma chuong trinh']),
    programName: cleanText(row.programName || row.name || row['Nội dung chương trình KM'] || row['Noi dung chuong trinh KM'] || row['Nội dung chương trình'] || row['Noi dung chuong trinh']),
    minAmount: toNumber(row.minAmount ?? row.requiredAmount ?? row.salesAmount ?? row['Mức doanh số cần lấy'] ?? row['Muc doanh so can lay'] ?? row['Doanh số cần lấy'] ?? row['Doanh so can lay']),
    discountPercent: promotionService.normalizeDiscountPercent(row.discountPercent ?? row.discount ?? row['Chiết khấu'] ?? row['Chiet khau'] ?? row['CK']),
    source: 'excel-import'
  };
}

function dedupePromotionPayloads(payloads = [], makeKey) {
  const map = new Map();
  const duplicated = [];
  for (const item of payloads) {
    const key = makeKey(item);
    if (!key) continue;
    if (map.has(key)) duplicated.push(key);
    map.set(key, item); // lấy dòng cuối cùng nếu Excel bị trùng key
  }
  return { rows: Array.from(map.values()), duplicateCount: duplicated.length };
}

function promotionBulkChunks(ops = [], size = 1000) {
  const chunks = [];
  for (let i = 0; i < ops.length; i += size) chunks.push(ops.slice(i, i + size));
  return chunks;
}


const USER_IMPORT_ROLES = new Set(['admin', 'manager', 'accountant', 'sales', 'delivery', 'warehouse']);
const USER_ROLE_ALIASES = {
  'quan tri': 'admin', 'quản trị': 'admin', 'admin': 'admin',
  'quan ly': 'manager', 'quản lý': 'manager', 'manager': 'manager',
  'ke toan': 'accountant', 'kế toán': 'accountant', 'accountant': 'accountant',
  'ban hang': 'sales', 'bán hàng': 'sales', 'nvbh': 'sales', 'sales': 'sales',
  'giao hang': 'delivery', 'giao hàng': 'delivery', 'nvgh': 'delivery', 'delivery': 'delivery',
  'kho': 'warehouse', 'thu kho': 'warehouse', 'thủ kho': 'warehouse', 'warehouse': 'warehouse'
};

function normalizeImportRole(value) {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return '';
  const normalized = normalizeText(raw);
  return USER_ROLE_ALIASES[raw] || USER_ROLE_ALIASES[normalized] || (USER_IMPORT_ROLES.has(raw) ? raw : '');
}

function normalizeImportActive(value) {
  const raw = cleanText(value);
  if (!raw) return true;
  const normalized = normalizeText(raw).toLowerCase();
  if (['0', 'false', 'no', 'n', 'inactive', 'ngung', 'ngung hoat dong', 'khoa', 'lock', 'locked'].includes(normalized)) return false;
  return true;
}

function pickUserImportPayload(row = {}) {
  const username = cleanText(row.username || row['Tên đăng nhập'] || row['Ten dang nhap'] || row['Tài khoản'] || row['Tai khoan'] || row['User'] || row['Username']);
  const staffCode = cleanText(row.staffCode || row.code || row['Mã nhân viên'] || row['Ma nhan vien'] || row['Mã NV'] || row['Ma NV'] || row['Mã Nv'] || row['Ma Nv'] || row['StaffCode']);
  const fullName = cleanText(row.fullName || row.name || row['Họ tên'] || row['Ho ten'] || row['Tên nhân viên'] || row['Ten nhan vien'] || row['Tên NV'] || row['Ten NV']);
  const role = normalizeImportRole(row.role || row['Vai trò'] || row['Vai tro'] || row['Quyền'] || row['Quyen'] || row['Role']);
  const password = cleanText(row.password || row['Mật khẩu'] || row['Mat khau'] || row['Password']);
  return {
    ...rowBase(row),
    username,
    password,
    fullName,
    name: fullName,
    staffCode,
    code: staffCode,
    role,
    phone: cleanText(row.phone || row.mobile || row['SĐT'] || row['SDT'] || row['Điện thoại'] || row['Dien thoai']),
    email: cleanText(row.email || row['Email']),
    area: cleanText(row.area || row['Khu vực'] || row['Khu vuc']),
    route: cleanText(row.route || row['Tuyến'] || row['Tuyen']),
    permissions: cleanText(row.permissions || row.permission || row['Quyền truy cập'] || row['Quyen truy cap']),
    isActive: normalizeImportActive(row.isActive ?? row.status ?? row['Trạng thái'] ?? row['Trang thai'])
  };
}

async function importUsers(rows = [], options = {}) {
  const importMode = normalizeImportMode(options.importMode, 'users');
  const errors = [];
  const warnings = [];
  let imported = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  const seen = new Map();

  rows.forEach((raw, index) => {
    const item = pickUserImportPayload(raw);
    item.raw = raw;
    const rowNo = item.rowNo || item.__rowNo || index + 2;
    const rowErrors = [];
    if (!item.username) rowErrors.push('Thiếu tên đăng nhập');

    if (importMode === IMPORT_MODE_UPDATE) {
      const input = getUserUpdateInput(raw);
      if (input.role.hasValue && !normalizeImportRole(input.role.value)) rowErrors.push('Vai trò không hợp lệ');
    } else {
      if (!item.fullName) rowErrors.push('Thiếu họ tên');
      if (!item.staffCode) rowErrors.push('Thiếu mã nhân viên');
      if (!item.role) rowErrors.push('Vai trò không hợp lệ');
    }

    if (rowErrors.length) {
      skipped += 1;
      errors.push({ row: rowNo, username: item.username, message: rowErrors.join('; ') });
      return;
    }
    const key = item.username.toLowerCase();
    if (seen.has(key)) {
      if (importMode === IMPORT_MODE_UPDATE) {
        skipped += 1;
        errors.push({ row: rowNo, username: item.username, message: 'Trùng tên đăng nhập trong file cập nhật' });
        seen.delete(key);
        return;
      }
      warnings.push({ row: rowNo, username: item.username, warning: 'Trùng tên đăng nhập trong file, hệ thống lấy dòng cuối cùng' });
    }
    seen.set(key, item);
  });

  const validRows = [...seen.values()];
  const usernames = validRows.map((item) => item.username).filter(Boolean);
  const currentRows = usernames.length ? await User.find({ username: { $in: usernames } }).lean() : [];
  const currentMap = new Map(currentRows.map((row) => [String(row.username || '').toLowerCase(), row]));
  const ops = [];

  for (const item of validRows) {
    const current = currentMap.get(item.username.toLowerCase()) || null;

    if (importMode === IMPORT_MODE_UPDATE) {
      if (!current) {
        skipped += 1;
        errors.push({ row: item.rowNo || item.__rowNo || '', username: item.username, message: 'Không tìm thấy tài khoản để cập nhật' });
        continue;
      }
      const { patch } = buildUserSelectiveUpdate(item.raw || item, current, { hashPassword: true });
      if (!Object.keys(patch).length) {
        unchanged += 1;
        continue;
      }
      ops.push({
        updateOne: {
          filter: { username: current.username },
          update: { $set: { ...patch, updatedAt: dateUtil.nowIso() } },
          upsert: false
        }
      });
      updated += 1;
      continue;
    }

    if (!current && !item.password) {
      skipped += 1;
      errors.push({
        row: item.rowNo || item.__rowNo || '',
        username: item.username,
        message: 'Tạo tài khoản mới bắt buộc có mật khẩu'
      });
      continue;
    }

    const password = item.password
      ? (isBcryptHash(item.password) ? item.password : hashPasswordSync(item.password))
      : (current?.password || '');
    const payload = {
      username: item.username,
      password,
      fullName: item.fullName,
      name: item.name || item.fullName,
      staffCode: item.staffCode,
      code: item.code || item.staffCode,
      role: item.role,
      phone: item.phone,
      email: item.email,
      area: item.area,
      route: item.route,
      permissions: item.permissions,
      isActive: item.isActive !== false,
      isSalesman: item.role === 'sales',
      isDelivery: item.role === 'delivery',
      updatedAt: dateUtil.nowIso()
    };
    if (!current) payload.createdAt = dateUtil.nowIso();
    ops.push({
      updateOne: {
        filter: { username: item.username },
        update: { $set: payload, $setOnInsert: { id: item.staffCode || item.username } },
        upsert: true
      }
    });
    if (current) updated += 1; else created += 1;
  }

  const bulk = await bulkWriteInBatches(User, ops);
  skipped += bulk.errors.length;
  errors.push(...bulk.errors.map((e) => ({ row: '', username: '', message: e.message })));
  imported = Math.max(0, ops.length - bulk.errors.length);
  if (bulk.errors.length && importMode === IMPORT_MODE_UPDATE) updated = Math.max(0, updated - bulk.errors.length);

  await addImportLog('users', {
    imported,
    created,
    updated,
    unchanged,
    skipped,
    errors: errors.slice(0, 50),
    warnings: warnings.slice(0, 50),
    mode: importMode === IMPORT_MODE_UPDATE ? 'selective-update' : 'upsert'
  });
  return {
    imported,
    created,
    updated,
    unchanged,
    skipped,
    errors,
    warnings,
    importMode,
    message: importMode === IMPORT_MODE_UPDATE
      ? `Đã cập nhật ${updated} tài khoản${unchanged ? `, giữ nguyên ${unchanged} dòng không thay đổi` : ''}${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}`
      : `Đã import ${imported} tài khoản: tạo mới ${created}, cập nhật ${updated}${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}`
  };
}

async function importPromotionProductRules(rows = []) {
  let skipped = 0;
  const errors = [];
  const warnings = [];
  const now = dateUtil.nowIso();

  const rawPayloads = rows.map(pickPromotionProductRulePayload);
  const productMap = await preloadPromotionProductsByCode(rawPayloads);
  const { rows: payloads, duplicateCount } = dedupePromotionPayloads(rawPayloads, (p) => `${cleanText(p.programCode)}__${cleanText(p.productCode)}`);

  if (duplicateCount) warnings.push({ row: '', productCode: '', warning: `Có ${duplicateCount} dòng trùng mã chương trình + mã sản phẩm trong file. Hệ thống lấy dòng cuối cùng để import nhanh.` });

  const ops = [];
  for (const payload of payloads) {
    const rowNo = payload.__rowNumber || payload.rowNumber || '';
    const programCode = cleanText(payload.programCode);
    const programName = cleanText(payload.programName);
    const productCode = cleanText(payload.productCode);
    const product = productMap.get(productCode);

    if (!programCode) { skipped += 1; errors.push({ row: rowNo, productCode, error: 'Thiếu mã chương trình' }); continue; }
    if (!programName) { skipped += 1; errors.push({ row: rowNo, productCode, error: 'Thiếu nội dung chương trình' }); continue; }
    if (!productCode) { skipped += 1; errors.push({ row: rowNo, productCode, error: 'Thiếu mã sản phẩm' }); continue; }
    if (toNumber(payload.discountPercent) < 0) { skipped += 1; errors.push({ row: rowNo, productCode, error: 'Chiết khấu không được âm' }); continue; }

    const productName = cleanText(product?.name || payload.productName || '');
    if (!product) warnings.push({ row: rowNo, productCode, warning: `Mã sản phẩm ${productCode} chưa có trong danh mục` });

    const id = cleanText(payload.id) || `${programCode}__${productCode}`;
    const doc = {
      ...payload,
      id,
      programCode,
      programName,
      productCode,
      productName,
      discountPercent: promotionService.normalizeDiscountPercent(payload.discountPercent),
      productMatched: Boolean(product),
      missingProduct: !product,
      source: cleanText(payload.source || 'excel-import'),
      isActive: payload.isActive !== false && payload.isActive !== 'false',
      updatedAt: now
    };
    delete doc.errors; delete doc.warnings; delete doc.valid;
    ops.push({ updateOne: { filter: { programCode, productCode }, update: { $set: doc, $setOnInsert: { createdAt: now } }, upsert: true } });
  }

  for (const chunk of promotionBulkChunks(ops)) {
    if (chunk.length) await PromotionProductRule.bulkWrite(chunk, { ordered: false });
  }
  const imported = ops.length;
  await addImportLog('promotionProductRules', { imported, skipped, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) });
  return { imported, skipped, errors, warnings, message: `Đã import nhanh ${imported} dòng CK sản phẩm bằng bulkWrite${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}` };
}

async function importPromotionGroupItems(rows = []) {
  let skipped = 0;
  const errors = [];
  const warnings = [];
  const now = dateUtil.nowIso();

  const rawPayloads = rows.map(pickPromotionGroupItemPayload);
  const productMap = await preloadPromotionProductsByCode(rawPayloads);
  const { rows: payloads, duplicateCount } = dedupePromotionPayloads(rawPayloads, (p) => `${cleanText(p.programCode)}__${cleanText(p.productCode)}`);

  if (duplicateCount) warnings.push({ row: '', productCode: '', warning: `Có ${duplicateCount} dòng trùng mã chương trình + mã sản phẩm trong file. Hệ thống lấy dòng cuối cùng để import nhanh.` });

  const ops = [];
  for (const payload of payloads) {
    const rowNo = payload.__rowNumber || payload.rowNumber || '';
    const programCode = cleanText(payload.programCode);
    const productCode = cleanText(payload.productCode);
    const product = productMap.get(productCode);

    if (!programCode) { skipped += 1; errors.push({ row: rowNo, productCode, error: 'Thiếu mã chương trình KM / mã nhóm' }); continue; }
    if (!productCode) { skipped += 1; errors.push({ row: rowNo, productCode, error: 'Thiếu mã sản phẩm' }); continue; }

    const productName = cleanText(product?.name || payload.productName || '');
    if (!product) warnings.push({ row: rowNo, productCode, warning: `Mã sản phẩm ${productCode} chưa có trong danh mục` });

    const id = cleanText(payload.id) || `${programCode}__${productCode}`;
    const doc = {
      ...payload,
      id,
      programCode,
      productCode,
      productName,
      productMatched: Boolean(product),
      missingProduct: !product,
      source: cleanText(payload.source || 'excel-import'),
      isActive: payload.isActive !== false && payload.isActive !== 'false',
      updatedAt: now
    };
    delete doc.errors; delete doc.warnings; delete doc.valid;
    ops.push({ updateOne: { filter: { programCode, productCode }, update: { $set: doc, $setOnInsert: { createdAt: now } }, upsert: true } });
  }

  for (const chunk of promotionBulkChunks(ops)) {
    if (chunk.length) await PromotionGroupItem.bulkWrite(chunk, { ordered: false });
  }
  const imported = ops.length;
  await addImportLog('promotionGroupItems', { imported, skipped, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) });
  return { imported, skipped, errors, warnings, message: `Đã import nhanh ${imported} dòng nhóm sản phẩm KM bằng bulkWrite${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}` };
}

async function importPromotionGroupRules(rows = []) {
  let skipped = 0;
  const errors = [];
  const now = dateUtil.nowIso();

  const rawPayloads = rows.map(pickPromotionGroupRulePayload);
  const { rows: payloads, duplicateCount } = dedupePromotionPayloads(rawPayloads, (p) => `${cleanText(p.programCode)}__${toNumber(p.minAmount)}`);
  const warnings = duplicateCount ? [{ row: '', programCode: '', warning: `Có ${duplicateCount} dòng trùng mã chương trình + mức doanh số trong file. Hệ thống lấy dòng cuối cùng để import nhanh.` }] : [];

  const ops = [];
  for (const payload of payloads) {
    const rowNo = payload.__rowNumber || payload.rowNumber || '';
    const programCode = cleanText(payload.programCode);
    const programName = cleanText(payload.programName);
    const minAmount = toNumber(payload.minAmount);
    const discountPercent = promotionService.normalizeDiscountPercent(payload.discountPercent);

    if (!programCode) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Thiếu mã nhóm sản phẩm / mã chương trình' }); continue; }
    if (!programName) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Thiếu nội dung chương trình KM' }); continue; }
    if (minAmount <= 0) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Mức doanh số cần lấy phải lớn hơn 0' }); continue; }
    if (discountPercent < 0) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Chiết khấu không được âm' }); continue; }

    const id = cleanText(payload.id) || `${programCode}__${minAmount}`;
    const doc = {
      ...payload,
      id,
      programCode,
      programName,
      minAmount,
      discountPercent,
      source: cleanText(payload.source || 'excel-import'),
      isActive: payload.isActive !== false && payload.isActive !== 'false',
      updatedAt: now
    };
    delete doc.errors; delete doc.warnings; delete doc.valid;
    ops.push({ updateOne: { filter: { programCode, minAmount }, update: { $set: doc, $setOnInsert: { createdAt: now } }, upsert: true } });
  }

  for (const chunk of promotionBulkChunks(ops)) {
    if (chunk.length) await PromotionGroupRule.bulkWrite(chunk, { ordered: false });
  }
  const imported = ops.length;
  await addImportLog('promotionGroupRules', { imported, skipped, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) });
  return { imported, skipped, errors, warnings, message: `Đã import nhanh ${imported} dòng điều kiện nhóm KM bằng bulkWrite${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}` };
}

async function previewMongoNative(type, rows = [], options = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  let result = [];

  if (type === 'products') {
    const importMode = normalizeImportMode(options.importMode, type);
    const payloads = safeRows.map((row) => ({ ...rowBase(row), ...pickProductPayload(row), errors: [], warnings: [], importMode }));
    const codes = Array.from(new Set(payloads.map((p) => cleanText(p.code)).filter(Boolean)));
    const existingRows = codes.length ? await Product.find({ code: { $in: codes } }).lean() : [];
    const existing = new Map(existingRows.map((p) => [normalizeText(p.code), p]));
    const seen = new Set();
    result = payloads.map((item) => {
      const codeKey = normalizeText(item.code);
      const current = existing.get(codeKey) || null;
      if (!item.code) item.errors.push('Thiếu mã sản phẩm');
      if (item.code && seen.has(codeKey)) item.errors.push('Mã sản phẩm bị trùng trong file');
      if (item.code) seen.add(codeKey);

      if (importMode === IMPORT_MODE_UPDATE) {
        if (item.code && !current) item.errors.push('Không tìm thấy sản phẩm để cập nhật');
        const conversion = getProvidedField(item.raw, ['conversionRate', 'Quy đổi', 'Quy doi', 'Tỷ lệ', 'Ty le']);
        const costPrice = getProvidedField(item.raw, ['costPrice', 'importPrice', 'Giá nhập', 'Gia nhap']);
        const salePrice = getProvidedField(item.raw, ['salePrice', 'price', 'Giá bán', 'Gia ban']);
        if (conversion.hasValue && toNumber(conversion.value) < 1) item.errors.push('Quy đổi phải lớn hơn hoặc bằng 1');
        if ((costPrice.hasValue && toNumber(costPrice.value) < 0) || (salePrice.hasValue && toNumber(salePrice.value) < 0)) item.errors.push('Giá không được âm');
        const updateInfo = current ? buildProductSelectiveUpdate(item.raw, current) : { patch: {}, changes: [] };
        item.changes = updateInfo.changes;
        item.changeCount = updateInfo.changes.length;
        item.action = item.errors.length ? 'error' : (item.changeCount ? 'update' : 'no_change');
        item.statusText = item.errors.length ? 'Có lỗi' : (item.changeCount ? `Cập nhật ${item.changeCount} trường` : 'Không thay đổi');
        item.canImport = item.errors.length === 0 && item.changeCount > 0;
      } else {
        if (!item.name) item.errors.push('Thiếu tên sản phẩm');
        if (item.code && current) item.errors.push('Mã sản phẩm đã tồn tại');
        if (toNumber(item.conversionRate) < 1) item.errors.push('Quy đổi phải lớn hơn hoặc bằng 1');
        if (toNumber(item.costPrice) < 0 || toNumber(item.salePrice) < 0) item.errors.push('Giá không được âm');
        item.action = item.errors.length ? 'error' : 'create';
        item.statusText = item.errors.length ? 'Có lỗi' : 'Thêm mới';
      }
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'customers') {
    const importMode = normalizeImportMode(options.importMode, type);
    const salesStaffUserMap = await preloadSalesStaffUsersByCode(safeRows);
    const payloads = safeRows.map((row) => {
      const payload = { ...rowBase(row), ...pickCustomerPayload(row), errors: [], warnings: [], importMode };
      const staffField = getProvidedField(row, ['legacyStaffCode', 'staffCode', 'Mã NVBH', 'Ma NVBH', 'Mã nhân viên', 'Ma nhan vien', 'Mã nhân viên']);
      if (staffField.hasValue) {
        const resolvedStaff = resolveSalesStaffForImportRow(row, salesStaffUserMap);
        payload.resolvedStaff = resolvedStaff;
        if (!resolvedStaff.found) payload.errors.push(`Không tìm thấy mã NVBH ${cleanText(staffField.value)} trong tài khoản hệ thống`);
        else if (!resolvedStaff.validRole) payload.errors.push(`Mã ${cleanText(staffField.value)} không phải nhân viên bán hàng`);
        else {
          payload.staffCode = resolvedStaff.staffCode;
          payload.staffName = resolvedStaff.staffName;
        }
      }
      return payload;
    });
    const codes = Array.from(new Set(payloads.map((c) => cleanText(c.code)).filter(Boolean)));
    const existingRows = codes.length ? await Customer.find({ code: { $in: codes } }).lean() : [];
    const existing = new Map(existingRows.map((c) => [normalizeText(c.code), c]));
    const seen = new Set();
    result = payloads.map((item) => {
      const codeKey = normalizeText(item.code);
      const current = existing.get(codeKey) || null;
      if (!item.code) item.errors.push('Thiếu mã khách hàng');
      if (item.code && seen.has(codeKey)) item.errors.push('Mã khách hàng bị trùng trong file');
      if (item.code) seen.add(codeKey);

      if (importMode === IMPORT_MODE_UPDATE) {
        if (item.code && !current) item.errors.push('Không tìm thấy khách hàng để cập nhật');
        const updateInfo = current ? buildCustomerSelectiveUpdate(item.raw, current, item.resolvedStaff || null) : { patch: {}, changes: [] };
        item.changes = updateInfo.changes;
        item.changeCount = updateInfo.changes.length;
        item.action = item.errors.length ? 'error' : (item.changeCount ? 'update' : 'no_change');
        item.statusText = item.errors.length ? 'Có lỗi' : (item.changeCount ? `Cập nhật ${item.changeCount} trường` : 'Không thay đổi');
        item.canImport = item.errors.length === 0 && item.changeCount > 0;
      } else {
        if (!item.name) item.errors.push('Thiếu tên khách hàng');
        if (item.code && current) item.errors.push('Mã khách hàng đã tồn tại');
        item.action = item.errors.length ? 'error' : 'create';
        item.statusText = item.errors.length ? 'Có lỗi' : 'Thêm mới';
      }
      delete item.resolvedStaff;
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'openingStock') {
    const productMap = await preloadProductsByCode(safeRows);
    result = safeRows.map((row) => {
      const productCode = getProductCodeFromRow(row);
      const product = productMap.get(cleanText(productCode));
      const quantity = getQtyFromRow(row, product);
      const warehouseCode = product ? (STOCK_WAREHOUSE_CODE || 'MAIN') : '';
      const item = {
        ...rowBase(row),
        documentCode: 'AUTO',
        date: getDateFromRow(row),
        productCode,
        productName: product?.name || '',
        warehouseCode,
        warehouseName: product ? (STOCK_WAREHOUSE_NAME || 'Kho chính') : '',
        quantity,
        errors: []
      };
      if (!productCode) item.errors.push('Thiếu mã sản phẩm');
      if (!product) item.errors.push('Không tìm thấy sản phẩm trong danh mục');
      if (quantity < 0) item.errors.push('Tồn đầu không được âm');
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'importOrders') {
    const productMap = await preloadProductsByCode(safeRows);
    const groups = groupRows(safeRows, makeImportOrderGroupKey);
    result = groups.map((group) => {
      const first = group[0] || {};
      const documentCode = getOrderDocumentCode(first);
      const errors = [];
      const detailErrors = [];
      const lineDetails = [];
      const importRows = [];
      let skippedZeroQuantity = 0;
      let totalQuantity = 0;
      let totalAmount = 0;

      for (const row of group) {
        const productCode = getProductCodeFromRow(row);
        const product = productMap.get(cleanText(productCode));
        const quantity = getQtyFromRow(row, product);

        // Phiếu nhập kho: dòng SL = 0 nghĩa là không nhập sản phẩm này.
        // Bỏ qua, không coi là lỗi.
        if (quantity === 0) {
          skippedZeroQuantity += 1;
          continue;
        }

        const costPrice = toNumber(product?.costPrice || 0);
        const amount = quantity * costPrice;
        const lineErrors = [];
        if (!productCode) lineErrors.push('Thiếu mã sản phẩm');
        if (!product) lineErrors.push('Không tìm thấy sản phẩm');
        if (quantity < 0) lineErrors.push('Số lượng nhập không được âm');
        if (lineErrors.length) detailErrors.push({ rowNo: row.__rowNo || row.rowNo || '', productCode, productName: product?.name || '', errors: lineErrors });

        totalQuantity += Math.max(0, quantity);
        totalAmount += Math.max(0, amount);
        lineDetails.push({
          rowNo: row.__rowNo || row.rowNo || '',
          productCode,
          productName: product?.name || cleanText(row.productName || row['Tên sản phẩm'] || row['Ten san pham']),
          quantity,
          price: costPrice,
          amount,
          errors: lineErrors
        });
        importRows.push(row);
      }

      if (!importRows.length) errors.push('Phiếu nhập không có dòng sản phẩm nào có số lượng lớn hơn 0');
      if (detailErrors.length) errors.push(`${detailErrors.length} dòng hàng lỗi`);
      return {
        ...rowBase(first),
        previewMode: 'order',
        documentCode,
        date: getDateFromRow(first),
        supplier: cleanText(first.supplier || first.supplierName || first['Nhà cung cấp'] || first['Nha cung cap']) || 'Import Excel',
        customerCode: '',
        customerName: '',
        lineCount: lineDetails.length,
        sourceLineCount: group.length,
        skippedZeroQuantity,
        totalQuantity,
        totalAmount,
        amount: totalAmount,
        statusText: errors.length ? 'Có lỗi' : 'Hợp lệ',
        hasShortage: false,
        shortageCount: 0,
        shortageReport: [],
        lineDetails,
        detailErrors,
        __importRows: importRows,
        errors,
        valid: errors.length === 0
      };
    });
  } else if (type === 'salesOrders') {
    const productMap = await preloadProductsByCode(safeRows);
    const customerMap = await preloadCustomersByCode(safeRows);
    const importedCustomerCandidates = collectImportedCustomerCandidates(safeRows, customerMap);
    const salesStaffUserMap = await preloadSalesStaffUsersByCode(safeRows);
    const stockMap = await getStockMapByProductCode(safeRows);
    const runningStockMap = new Map(stockMap);
    const groups = groupRows(safeRows, makeSalesOrderGroupKey);

    result = groups.map((group) => {
      const first = group[0] || {};
      const resolvedSalesStaff = resolveSalesStaffForImportRow(first, salesStaffUserMap);
      const documentCode = getOrderDocumentCode(first);
      const customerCode = getCustomerCodeFromRow(first);
      const customerCandidate = importedCustomerCandidates.get(cleanText(customerCode));
      const customer = customerMap.get(cleanText(customerCode)) || buildImportedCustomerPlaceholder(customerCandidate);
      const customerAutoCreate = Boolean(customer?.__autoCreateCustomer);
      const errors = [];
      const warnings = [];
      const detailErrors = [];
      const shortageReport = [];
      const lineDetails = [];
      const adjustedRows = [];
      let totalQuantity = 0;
      let totalAmount = 0;
      let adjustedQuantity = 0;
      let adjustedAmount = 0;

      if (!customerCode) errors.push('Thiếu mã khách hàng / mã cửa hàng');
      if (customerCode && !customer) errors.push(importedCustomerCandidateError(customerCandidate, customerCode));
      if (customerAutoCreate) {
        warnings.push(`Khách hàng mới ${customer.code} - ${customer.name} sẽ được tự tạo với địa chỉ NEW`);
      }
      if (!resolvedSalesStaff.staffCode) errors.push('Thiếu mã NVBH trong file Excel import');
      else if (!resolvedSalesStaff.found) errors.push(`Mã NVBH ${resolvedSalesStaff.staffCode} không tồn tại trong users`);
      else if (!resolvedSalesStaff.validRole) errors.push(`Mã ${resolvedSalesStaff.staffCode} không phải nhân viên bán hàng`);
      else if (!resolvedSalesStaff.hasUserStaffCode) errors.push(`Tài khoản NVBH ${resolvedSalesStaff.staffCode} thiếu mã nhân viên trong users`);

      for (const row of group) {
        const productCode = getProductCodeFromRow(row);
        const product = productMap.get(cleanText(productCode));
        const quantity = getDmsQuantityFromRow(row, product);
        const promoQuantity = getDmsPromoQuantityFromRow(row, product);
        const deliveredQuantity = quantity + promoQuantity;
        const salePrice = getDmsPriceFromRow(row, quantity);
        const amount = getDmsAmountFromRow(row, quantity, salePrice);
        const normalizedProductCode = cleanText(product?.code || productCode);
        const rowProductCode = cleanText(productCode);
        const stockLookupCode = runningStockMap.has(normalizedProductCode)
          ? normalizedProductCode
          : rowProductCode;
        const initialAvailableQuantity = toNumber(stockMap.get(stockLookupCode));
        const availableBefore = toNumber(runningStockMap.get(stockLookupCode));
        const allocatedBeforeQuantity = Math.max(0, initialAvailableQuantity - availableBefore);
        const allocation = allocateStockForSaleAndPromo(quantity, promoQuantity, availableBefore);
        const allowedQuantity = allocation.allowedDeliveredQuantity;
        const missingQuantity = allocation.missingQuantity;
        const lineErrors = [];

        if (!productCode) lineErrors.push('Thiếu mã sản phẩm / mã hàng hóa');
        if (!product) lineErrors.push('Không tìm thấy sản phẩm');
        // Hàng khuyến mại hợp lệ dù số lượng bán = 0. Chỉ bỏ qua/báo lỗi khi cả hàng bán và 4 cột KM đều bằng 0.
        if (deliveredQuantity <= 0) lineErrors.push('Số lượng bán hoặc khuyến mại phải lớn hơn 0');
        if (salePrice < 0) lineErrors.push('Giá bán không được âm');

        totalQuantity += Math.max(0, deliveredQuantity);
        totalAmount += Math.max(0, amount);

        if (product && missingQuantity > 0) {
          shortageReport.push({
            documentCode,
            customerCode,
            customerName: getCustomerNameFromRow(first) || customer?.name || '',
            rowNo: row.__rowNo || row.rowNo || '',
            productCode: product.code,
            productName: product.name,
            unit: product.unit || product.baseUnit || '',
            conversionRate: getPackingFromRow(row, product),
            sourcePackingRate: toNumber(row['Qc'] ?? row['QC'] ?? row.packingQty ?? row.conversionRate),
            requestedQuantity: deliveredQuantity,
            saleQuantity: quantity,
            promoQuantity,
            initialAvailableQuantity,
            allocatedBeforeQuantity,
            availableQuantity: availableBefore,
            importQuantity: allowedQuantity,
            allowedSaleQuantity: allocation.allowedSaleQuantity,
            allowedPromoQuantity: allocation.allowedPromoQuantity,
            missingQuantity,
            missingSaleQuantity: allocation.missingSaleQuantity,
            missingPromoQuantity: allocation.missingPromoQuantity,
            salePrice,
            // Ưu tiên cắt KM trước nên chỉ tính giảm giá trị khi bị cắt cả hàng bán.
            cutAmount: allocation.missingSaleQuantity * salePrice
          });
        }

        if (lineErrors.length) {
          detailErrors.push({ rowNo: row.__rowNo || row.rowNo || '', productCode, productName: product?.name || '', errors: lineErrors });
        }

        const adjustedRow = applyAdjustedQuantityToRow(row, allocation.allowedSaleQuantity, allocation.allowedPromoQuantity, salePrice);
        adjustedRows.push(adjustedRow);
        adjustedQuantity += allowedQuantity;
        adjustedAmount += allocation.allowedSaleQuantity * salePrice;
        if (product) runningStockMap.set(stockLookupCode, Math.max(0, availableBefore - deliveredQuantity));

        lineDetails.push({
          rowNo: row.__rowNo || row.rowNo || '',
          productCode,
          productName: product?.name || cleanText(row.productName || row['Tên sản phẩm'] || row['Ten san pham']),
          unit: product?.unit || product?.baseUnit || '',
          conversionRate: getPackingFromRow(row, product),
          sourcePackingRate: toNumber(row['Qc'] ?? row['QC'] ?? row.packingQty ?? row.conversionRate),
          saleQuantity: quantity,
          promoQuantity,
          requestedQuantity: deliveredQuantity,
          initialAvailableQuantity,
          allocatedBeforeQuantity,
          availableQuantity: availableBefore,
          importQuantity: allowedQuantity,
          allowedSaleQuantity: allocation.allowedSaleQuantity,
          allowedPromoQuantity: allocation.allowedPromoQuantity,
          missingQuantity,
          missingSaleQuantity: allocation.missingSaleQuantity,
          missingPromoQuantity: allocation.missingPromoQuantity,
          salePrice,
          amount,
          adjustedAmount: allocation.allowedSaleQuantity * salePrice,
          lineType: promoQuantity > 0 && quantity <= 0 ? 'PROMO' : 'SALE',
          errors: lineErrors
        });
      }

      const importableAdjustedRows = adjustedRows.filter((r) => !r.__skipImportLine);
      const blockingErrors = [...errors];
      // Lỗi chi tiết từng dòng chỉ để cảnh báo/cắt dòng đó, không khóa cả hóa đơn
      // nếu hóa đơn vẫn còn dòng hợp lệ để import.
      if (detailErrors.length && !importableAdjustedRows.length) {
        blockingErrors.push(`${detailErrors.length} dòng hàng lỗi`);
      }
      const shortageSummary = summarizeOrderShortages(shortageReport);
      const normalStatusText = customerAutoCreate ? 'Hợp lệ - tạo KH mới' : 'Hợp lệ';
      const shortageStatusText = customerAutoCreate ? 'Vượt tồn - tạo KH mới' : 'Vượt tồn';
      return {
        ...rowBase(first),
        previewMode: 'order',
        documentCode,
        date: getDateFromRow(first),
        customerCode,
        customerName: getCustomerNameFromRow(first) || customer?.name || '',
        customerAddress: customer?.address || '',
        customerAutoCreate,
        customerProfileStatus: customerAutoCreate ? 'NEW' : '',
        // Mã NVBH phải lấy từ Excel; tên NVBH sẽ được validate/điền lại từ users Mongo theo mã này.
        staffCode: resolvedSalesStaff.staffCode,
        salesStaffCode: resolvedSalesStaff.salesStaffCode,
        staffName: resolvedSalesStaff.staffName,
        salesStaffName: resolvedSalesStaff.salesStaffName,
        saleMethod: DIRECT_PRICE,
        saleMode: DIRECT_PRICE,
        pricingMode: DIRECT_PRICE,
        orderPricingMode: DIRECT_PRICE,
        priceLocked: true,
        promotionCalculated: false,
        isPromotionSale: false,
        lineCount: group.length,
        totalQuantity,
        totalAmount,
        amount: totalAmount,
        adjustedQuantity,
        adjustedAmount,
        shortageCount: shortageReport.length,
        shortageQuantity: shortageSummary.totalMissingQty,
        shortageAmount: shortageSummary.totalCutAmount,
        hasShortage: shortageReport.length > 0,
        statusText: blockingErrors.length
          ? 'Có lỗi'
          : (detailErrors.length
              ? (customerAutoCreate ? 'Có dòng bị bỏ qua - tạo KH mới' : 'Có dòng bị bỏ qua')
              : (shortageReport.length ? shortageStatusText : normalStatusText)),
        shortageReport,
        stockAllocationPolicy: 'sequential_file_order',
        lineDetails,
        detailErrors,
        __importRows: group,
        __adjustedRows: adjustedRows,
        errors: blockingErrors,
        warnings,
        valid: blockingErrors.length === 0
      };
    });
  } else if (type === 'promotionProductRules') {
    const payloads = safeRows.map(pickPromotionProductRulePayload);
    const productMap = await preloadPromotionProductsByCode(payloads);
    const seen = new Set();
    result = payloads.map((item) => {
      const product = productMap.get(cleanText(item.productCode));
      item.errors = [];
      item.warnings = [];
      if (!item.programCode) item.errors.push('Thiếu mã chương trình');
      if (!item.programName) item.errors.push('Thiếu nội dung chương trình');
      if (!item.productCode) item.errors.push('Thiếu mã sản phẩm');
      if (item.productCode && !product) item.warnings.push('Mã sản phẩm chưa có trong danh mục');
      item.productMatched = Boolean(product);
      item.missingProduct = Boolean(item.productCode && !product);
      item.source = item.source || 'excel-import';
      if (product) item.productName = cleanText(product.name || item.productName);
      if (toNumber(item.discountPercent) < 0) item.errors.push('Chiết khấu không được âm');
      const key = `${item.programCode}__${item.productCode}`;
      if (seen.has(key)) item.errors.push('Trùng mã chương trình + mã sản phẩm trong file');
      seen.add(key);
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'promotionGroupItems') {
    const payloads = safeRows.map(pickPromotionGroupItemPayload);
    const productMap = await preloadPromotionProductsByCode(payloads);
    const seen = new Set();
    result = payloads.map((item) => {
      const product = productMap.get(cleanText(item.productCode));
      item.errors = [];
      item.warnings = [];
      if (!item.programCode) item.errors.push('Thiếu mã chương trình KM / mã nhóm');
      if (!item.productCode) item.errors.push('Thiếu mã sản phẩm');
      if (item.productCode && !product) item.warnings.push('Mã sản phẩm chưa có trong danh mục');
      item.productMatched = Boolean(product);
      item.missingProduct = Boolean(item.productCode && !product);
      item.source = item.source || 'excel-import';
      if (product) item.productName = cleanText(product.name || item.productName);
      const key = `${item.programCode}__${item.productCode}`;
      if (seen.has(key)) item.errors.push('Trùng mã chương trình + mã sản phẩm trong file');
      seen.add(key);
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'promotionGroupRules') {
    const payloads = safeRows.map(pickPromotionGroupRulePayload);
    const seen = new Set();
    result = payloads.map((item) => {
      item.errors = [];
      if (!item.programCode) item.errors.push('Thiếu mã nhóm sản phẩm / mã chương trình');
      if (!item.programName) item.errors.push('Thiếu nội dung chương trình KM');
      if (toNumber(item.minAmount) <= 0) item.errors.push('Mức doanh số cần lấy phải lớn hơn 0');
      if (toNumber(item.discountPercent) < 0) item.errors.push('Chiết khấu không được âm');
      const key = `${item.programCode}__${toNumber(item.minAmount)}`;
      if (seen.has(key)) item.errors.push('Trùng mã chương trình + mức doanh số trong file');
      seen.add(key);
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'users') {
    const importMode = normalizeImportMode(options.importMode, type);
    const usernames = Array.from(new Set(safeRows.map((row) => cleanText(row.username || row['Tên đăng nhập'] || row['Ten dang nhap'] || row['Tài khoản'] || row['Tai khoan'] || row['User'] || row['Username'])).filter(Boolean)));
    const existingRows = usernames.length ? await User.find({ username: { $in: usernames } }).lean() : [];
    const existing = new Map(existingRows.map((row) => [String(row.username || '').toLowerCase(), row]));
    const seen = new Set();
    result = safeRows.map((row) => {
      const item = { ...rowBase(row), ...pickUserImportPayload(row), errors: [], warnings: [], importMode };
      const key = item.username.toLowerCase();
      const current = existing.get(key) || null;
      if (!item.username) item.errors.push('Thiếu tên đăng nhập');
      if (key && seen.has(key)) item.errors.push('Trùng tên đăng nhập trong file');
      if (key) seen.add(key);

      if (importMode === IMPORT_MODE_UPDATE) {
        const input = getUserUpdateInput(row);
        if (item.username && !current) item.errors.push('Không tìm thấy tài khoản để cập nhật');
        if (input.role.hasValue && !normalizeImportRole(input.role.value)) item.errors.push('Vai trò không hợp lệ');
        const updateInfo = current ? buildUserSelectiveUpdate(row, current, { hashPassword: false }) : { changes: [] };
        item.changes = updateInfo.changes;
        item.changeCount = updateInfo.changes.length;
        item.action = item.errors.length ? 'error' : (item.changeCount ? 'update' : 'no_change');
        item.statusText = item.errors.length ? 'Có lỗi' : (item.changeCount ? `Cập nhật ${item.changeCount} trường` : 'Không thay đổi');
        item.canImport = item.errors.length === 0 && item.changeCount > 0;
        item.passwordStatus = input.password.hasValue ? 'Sẽ cập nhật mật khẩu' : 'Không có mật khẩu mới: giữ nguyên';
      } else {
        if (!item.fullName) item.errors.push('Thiếu họ tên');
        if (!item.staffCode) item.errors.push('Thiếu mã nhân viên');
        if (!item.role) item.errors.push('Vai trò không hợp lệ');
        item.action = item.errors.length ? 'error' : (current ? 'update' : 'create');
        item.statusText = item.errors.length ? 'Có lỗi' : (current ? 'Cập nhật toàn bộ' : 'Thêm mới');
        item.passwordStatus = item.password ? 'Có nhập mật khẩu' : 'Để trống: giữ mật khẩu cũ; tạo mới bắt buộc nhập mật khẩu';
      }
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'openingDebt') {
    const customerMap = await preloadCustomersByCode(safeRows);
    result = safeRows.map((row) => {
      const customerCode = getCustomerCodeFromRow(row);
      const customer = customerMap.get(cleanText(customerCode));
      const amount = toNumber(row.amount ?? row['Số tiền'] ?? row['So tien'] ?? row['Công nợ'] ?? row['Cong no']);
      const item = { ...rowBase(row), date: getDateFromRow(row), customerCode, customerName: customer?.name || '', amount, note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']), errors: [] };
      if (!customerCode) item.errors.push('Thiếu mã khách hàng');
      if (!customer) item.errors.push('Không tìm thấy khách hàng');
      if (amount < 0) item.errors.push('Công nợ đầu không được âm');
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'debtCollections') {
    const customerMap = await preloadCustomersByCode(safeRows);
    result = safeRows.map((row) => {
      const customerCode = getCustomerCodeFromRow(row);
      const customer = customerMap.get(cleanText(customerCode));
      const amount = toNumber(row.amount ?? row['Số tiền'] ?? row['So tien'] ?? row['Tiền thu'] ?? row['Tien thu']);
      const item = { ...rowBase(row), date: getDateFromRow(row), customerCode, customerName: customer?.name || '', amount, staffName: cleanText(row.staffName || row['Người thu'] || row['Nguoi thu'] || row['Nhân viên']), note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']), errors: [] };
      if (!customerCode) item.errors.push('Thiếu mã khách hàng');
      if (!customer) item.errors.push('Không tìm thấy khách hàng');
      if (amount <= 0) item.errors.push('Số tiền thu phải lớn hơn 0');
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'cashbook') {
    result = safeRows.map((row) => {
      const typeRaw = normalizeText(row.type || row['Loại'] || row['Loai'] || row['Thu chi'] || 'in');
      const cashType = typeRaw.includes('chi') || typeRaw === 'out' ? 'out' : 'in';
      const amount = toNumber(row.amount ?? row['Số tiền'] ?? row['So tien']);
      const item = { ...rowBase(row), date: getDateFromRow(row), type: cashType, source: cleanText(row.source || row['Nguồn'] || row['Nguon'] || row['Nhóm tiền']) || 'import_excel', staffName: cleanText(row.staffName || row['Người nộp/nhận'] || row['Nguoi nop'] || row['Nhân viên']), amount, note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']), errors: [] };
      if (amount <= 0) item.errors.push('Số tiền phải lớn hơn 0');
      return { ...item, valid: item.errors.length === 0 };
    });
  } else {
    throw new Error('Loại import không hợp lệ');
  }

  return { type, rows: result, total: result.length, valid: result.filter((r) => r.valid).length, invalid: result.filter((r) => !r.valid).length };
}


function normalizeImportFiles({ files = [], buffer = null, fileName = '' } = {}) {
  const list = [];
  if (Array.isArray(files) && files.length) {
    files.forEach((file, index) => {
      if (file && file.buffer) list.push({ buffer: file.buffer, fileName: cleanText(file.originalname || file.filename || file.name || `File ${index + 1}.xlsx`) });
    });
  }
  if (!list.length && buffer) list.push({ buffer, fileName: cleanText(fileName || 'File Excel.xlsx') });
  return list;
}

async function buildPreviewFromRows({ type, rows = [], userName = '', importMode = '' } = {}) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (type === 'salesOrdersS3') type = 'salesOrders';
  if (!Array.isArray(rows) || !rows.length) return { error: 'File Excel không có dữ liệu', status: 400 };

  const normalizedImportMode = normalizeImportMode(importMode, type);
  const result = await previewMongoNative(type, rows, { importMode: normalizedImportMode });

  if (type === 'salesOrders') {
    const validatedRows = await importRules.validateImportBatch(result.rows || []);

    return {
      ...result,
      importMode: normalizedImportMode,
      rows: validatedRows,
      total: validatedRows.length,
      valid: validatedRows.filter((r) => r.valid).length,
      invalid: validatedRows.filter((r) => !r.valid).length
    };
  }

  return { ...result, importMode: normalizedImportMode };
}


async function previewPastedRows({ type, rows = [], userName = '', importMode = '' } = {}) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (type === 'salesOrdersS3') type = 'salesOrders';
  if (!Array.isArray(rows) || !rows.length) return { error: 'Chưa có dữ liệu được dán từ Excel', status: 400 };
  if (rows.length > 5000) return { error: 'Mỗi lần chỉ được dán tối đa 5.000 dòng', status: 413 };

  const normalizedImportMode = normalizeImportMode(importMode, type);
  const safeRows = rows.map((row, index) => {
    const source = row && typeof row === 'object' && !Array.isArray(row) ? row : {};
    const entries = Object.entries(source).slice(0, 100);
    const normalized = Object.fromEntries(entries.map(([key, value]) => [
      String(key || '').slice(0, 200),
      typeof value === 'string' ? value.slice(0, 10000) : value
    ]));
    return {
      ...normalized,
      __rowNo: Number(normalized.__rowNo || normalized.rowNo || index + 1),
      __sourceFile: 'Dán trực tiếp từ Excel'
    };
  });

  const session = await importSessionService.createUploadedSession({
    type,
    fileName: 'clipboard-paste.xlsx',
    fileNames: ['clipboard-paste.xlsx'],
    createdBy: userName,
    importMode: normalizedImportMode
  });

  try {
    await importSessionService.markParsing(session.id);
    const result = await buildPreviewFromRows({
      type,
      rows: safeRows,
      userName,
      importMode: normalizedImportMode
    });

    if (result && result.error) {
      await importSessionService.markFailed(session.id, result.error);
      return {
        ...result,
        sessionId: session.id,
        importSessionId: session.id
      };
    }

    await importSessionService.savePreviewResult(session.id, {
      rows: result.rows || [],
      previewRows: result.rows || [],
      fileNames: ['clipboard-paste.xlsx']
    });

    await auditService.log('IMPORT_PASTE_PREVIEW', {
      refType: 'importSession',
      refId: session.id,
      refCode: session.id,
      userName,
      summary: {
        type,
        importMode: normalizedImportMode,
        totalRows: result.total || result.rows?.length || 0,
        validRows: result.valid || 0,
        invalidRows: result.invalid || 0
      }
    }).catch(() => {});

    return {
      ...result,
      sessionId: session.id,
      importSessionId: session.id,
      importMode: normalizedImportMode,
      status: 'preview_ready',
      source: 'clipboard-paste'
    };
  } catch (err) {
    await importSessionService.markFailed(session.id, err.message || 'Không kiểm tra được dữ liệu đã dán').catch(() => {});
    return {
      error: err.message || 'Không kiểm tra được dữ liệu đã dán',
      status: Number(err.status || err.statusCode || 400),
      sessionId: session.id,
      importSessionId: session.id
    };
  }
}

async function preview({ type, files = [], buffer = null, fileName = '', userName = '', importMode = '' }) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (type === 'salesOrdersS3') type = 'salesOrders';
  const normalizedImportMode = normalizeImportMode(importMode, type);

  const normalizedFiles = normalizeImportFiles({ files, buffer, fileName });
  if (!normalizedFiles.length) return { error: 'Chưa chọn file Excel', status: 400 };

  const session = await importSessionService.createUploadedSession({
    type,
    fileName: normalizedFiles[0]?.fileName || '',
    fileNames: normalizedFiles.map((f) => f.fileName),
    createdBy: userName,
    importMode: normalizedImportMode
  });

  const asyncPreview = process.env.IMPORT_PREVIEW_ASYNC !== 'false';

  if (asyncPreview) {
    const storedFiles = await saveImportFiles(session.id, normalizedFiles);

    await importSessionService.markQueued(session.id, { files: storedFiles });

    let queueResult;
    try {
      queueResult = enqueueImportPreviewJob({
        sessionId: session.id,
        type,
        files: storedFiles,
        userName,
        importMode: normalizedImportMode
      });
    } catch (err) {
      await importSessionService.markFailed(session.id, err.message || 'Không thể đưa file vào hàng đợi import').catch(() => {});
      await cleanupImportFiles(storedFiles).catch(() => {});
      return {
        error: err.message || 'Hàng đợi import đang quá tải',
        status: Number(err.statusCode || err.status || 503),
        sessionId: session.id,
        importSessionId: session.id
      };
    }

    await auditService.log('IMPORT_PREVIEW_QUEUED', {
      refType: 'importSession',
      refId: session.id,
      refCode: session.id,
      userName,
      summary: {
        type,
        importMode: normalizedImportMode,
        totalFiles: storedFiles.length,
        fileNames: storedFiles.map((file) => file.fileName)
      }
    }).catch((err) => {
      console.error('[IMPORT_PREVIEW_QUEUED_AUDIT_ERROR]', err && (err.stack || err.message || err));
    });

    return {
      ok: true,
      accepted: true,
      status: 'queued',
      message: 'File import đã được đưa vào hàng chờ xử lý',
      sessionId: session.id,
      importSessionId: session.id,
      importMode: normalizedImportMode,
      queue: queueResult
    };
  }

  // Fallback inline dùng runner độc lập, tránh vòng phụ thuộc
  // excelImportService -> importExcelJob -> excelImportService.
  const result = await runImportPreviewPipeline({
    sessionId: session.id,
    type,
    files: normalizedFiles,
    userName,
    importMode: normalizedImportMode,
    buildPreviewFromRows
  });

  if (result.error) return { ...result, sessionId: session.id, importSessionId: session.id };

  await auditService.log('IMPORT_PREVIEW', {
    refType: 'importSession',
    refId: session.id,
    refCode: session.id,
    userName,
    summary: {
      type,
      importMode: normalizedImportMode,
      totalRows: result.total || result.rows?.length || 0,
      validRows: result.valid || 0,
      invalidRows: result.invalid || 0
    }
  });

  return {
    ...result,
    sessionId: session.id,
    importSessionId: session.id,
    importMode: normalizedImportMode,
    status: 'preview_ready'
  };
}


async function getSessionStatus(sessionId) {
  const session = await importSessionService.getSession(sessionId);

  if (!session) {
    return {
      error: 'Không tìm thấy phiên import',
      status: 404
    };
  }

  return {
    sessionId: session.sessionId || session.id,
    importSessionId: session.sessionId || session.id,
    type: session.type,
    importMode: normalizeImportMode(session.importMode, session.type),
    status: session.status,
    progress: session.progress || { percent: 0, step: '' },
    totalRows: session.totalRows || 0,
    validRows: session.validRows || 0,
    errorRows: session.errorRows || 0,
    storedRows: session.storedRows || 0,
    previewRows: session.previewRows || [],
    importErrors: session.importErrors || [],
    errorMessage: session.errorMessage || '',
    result: session.result || {},
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    queuedAt: session.queuedAt,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    failedAt: session.failedAt
  };
}


async function getSessionRows(sessionId, { offset = 0, limit = 500 } = {}) {
  const result = await importSessionService.listSessionRows(sessionId, { offset, limit });

  if (!result) {
    return {
      error: 'Không tìm thấy phiên import',
      status: 404
    };
  }

  return result;
}


async function safeMarkImportFailed(sessionId, err, fallbackMessage = 'Import thất bại') {
  const message = err && err.message ? err.message : String(err || fallbackMessage);

  if (!sessionId) return message;

  try {
    await importSessionService.markFailed(sessionId, message);
  } catch (markErr) {
    console.error('[IMPORT_SESSION_MARK_FAILED_ERROR]', {
      sessionId,
      originalError: message,
      markFailedError: markErr && (markErr.stack || markErr.message || markErr)
    });
  }

  return message;
}


async function rebuildSelectedSalesOrderPreviewRows(sourceRows = [], { userName = '', importMode = '' } = {}) {
  const rawRows = flattenCommitRows(sourceRows);
  if (!rawRows.length) return [];

  const rebuilt = await buildPreviewFromRows({
    type: 'salesOrders',
    rows: rawRows,
    userName,
    importMode
  });

  if (rebuilt && rebuilt.error) {
    const err = new Error(rebuilt.error);
    err.status = rebuilt.status || 400;
    throw err;
  }

  return Array.isArray(rebuilt?.rows) ? rebuilt.rows : [];
}

async function commit({ type, rows, shortageMode = '', sessionId = '', selectedOrderCodes = [], userName = '' }) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (type === 'salesOrdersS3') type = 'salesOrders';
  if (!sessionId) return { error: 'Bắt buộc xác nhận bằng importSessionId từ bước preview', status: 400 };

  const session = await importSessionService.markImporting(sessionId);
  if (!session) {
    return { error: 'Phiên import không tồn tại hoặc chưa sẵn sàng xác nhận', status: 400 };
  }

  const currentSessionId = session.sessionId || session.id;
  const importMode = normalizeImportMode(session.importMode, type);

  let sourceRows = [];
  let validRows = [];
  let commitRows = [];
  let result = null;
  let hasShortage = false;

  try {
    if (session.type !== type) {
      await importSessionService.markFailed(currentSessionId, 'Phiên preview không khớp loại import');
      return {
        error: 'Phiên preview không khớp loại import',
        status: 400,
        sessionId: currentSessionId,
        importSessionId: currentSessionId
      };
    }

    sourceRows = await importSessionService.selectRows(session, selectedOrderCodes);
    await importSessionService.updateProgress(currentSessionId, {
      percent: 5,
      step: 'loading_selected_rows'
    });
    if (!sourceRows.length) {
      await importSessionService.markFailed(currentSessionId, 'Không có dòng hợp lệ để import');
      return {
        error: 'Không có dòng hợp lệ để import',
        status: 400,
        sessionId: currentSessionId,
        importSessionId: currentSessionId
      };
    }

    if (type === 'salesOrders') {
      await importSessionService.updateProgress(currentSessionId, {
        percent: 10,
        step: 'reallocating_selected_orders_against_current_stock'
      });
      // Rebuild lại preview từ đúng các đơn người dùng đã chọn và tồn kho hiện tại.
      // Tránh trường hợp đơn bị cắt theo các đơn đã bỏ chọn hoặc theo snapshot tồn cũ.
      sourceRows = await rebuildSelectedSalesOrderPreviewRows(sourceRows, {
        userName,
        importMode
      });
    }

    validRows = sourceRows.filter((r) =>
      r &&
      r.valid !== false &&
      r.canImport !== false &&
      (!Array.isArray(r.errors) || r.errors.length === 0)
    );

    if (!validRows.length) {
      await importSessionService.markFailed(currentSessionId, 'Không có dòng/đơn hợp lệ để import');
      return {
        error: 'Không có dòng/đơn hợp lệ để import',
        status: 400,
        errors: sourceRows.flatMap((r) => r.errors || []).slice(0, 50),
        sessionId: currentSessionId,
        importSessionId: currentSessionId
      };
    }

    hasShortage = validRows.some((r) => r && r.hasShortage);
    commitRows = type === 'salesOrders'
      ? flattenAdjustedCommitRows(validRows)
      : flattenCommitRows(validRows);

    if (!importCommitOrchestrator.supports(type)) {
      await importSessionService.markFailed(currentSessionId, 'Loại import không hợp lệ');
      return {
        error: 'Loại import không hợp lệ',
        status: 400,
        supportedTypes: importCommitOrchestrator.supportedTypes(),
        sessionId: currentSessionId,
        importSessionId: currentSessionId
      };
    }

    await importSessionService.updateProgress(currentSessionId, {
      percent: 18,
      step: 'committing'
    });

    result = await importCommitOrchestrator.commit(type, commitRows, {
      options: {
        importSessionId: currentSessionId,
        sessionId: currentSessionId,
        importMode
      },
      operations: {
        upsertProducts,
        upsertCustomers,
        importUsers,
        importOpeningStock,
        importImportOrders,
        importSalesOrders,
        importOpeningDebt,
        importDebtCollections,
        importCashbook,
        importPromotionProductRules,
        importPromotionGroupItems,
        importPromotionGroupRules
      }
    });

    if (result && result.error) {
      throw new Error(result.error);
    }

    await importSessionService.updateProgress(currentSessionId, {
      percent: 95,
      step: 'finalizing'
    });
  } catch (err) {
    const message = await safeMarkImportFailed(currentSessionId, err, 'Import thất bại');

    return {
      error: 'Import thất bại',
      status: 500,
      detail: message,
      sessionId: currentSessionId,
      importSessionId: currentSessionId
    };
  }

  try {
    await importSessionService.markDone(currentSessionId, result);
  } catch (err) {
    const message = await safeMarkImportFailed(
      currentSessionId,
      err,
      'Import đã ghi dữ liệu nhưng không cập nhật được trạng thái hoàn tất'
    );

    return {
      error: 'Import đã ghi dữ liệu nhưng không cập nhật được trạng thái hoàn tất',
      status: 500,
      detail: message,
      sessionId: currentSessionId,
      importSessionId: currentSessionId
    };
  }

  try {
    await auditService.log('IMPORT_COMMIT', {
      refType: 'importSession',
      refId: currentSessionId,
      refCode: currentSessionId,
      userName,
      summary: {
        type,
        importMode,
        totalSelected: sourceRows.length,
        totalValid: validRows.length,
        totalCommitRows: commitRows.length,
        imported: result.imported || 0,
        skipped: result.skipped || 0,
        errors: (result.errors || []).slice(0, 20)
      }
    });
  } catch (err) {
    console.error('[IMPORT_COMMIT_AUDIT_ERROR]', {
      sessionId: currentSessionId,
      error: err && (err.stack || err.message || err)
    });
  }

  const shortageRows = type === 'salesOrders'
    ? normalizeShortageRows([
        ...validRows.flatMap((r) => r.shortageReport || []),
        ...(result.shortageReport || [])
      ])
    : [];

  let savedShortageReport = null;
  if (type === 'salesOrders' && shortageRows.length) {
    try {
      savedShortageReport = await importShortageReportService.saveFromImport({
        importSessionId: currentSessionId,
        shortageRows,
        userName
      });
    } catch (err) {
      console.error('[IMPORT_SHORTAGE_REPORT_SAVE_ERROR]', {
        sessionId: currentSessionId,
        error: err && (err.stack || err.message || err)
      });
    }
  }

  return {
    ...result,
    source: 'mongo-import-session-confirm',
    ok: true,
    message: result.message || `Đã import ${result.imported || 0} chứng từ`,
    importMode,
    totalRows: sourceRows.length,
    totalCommitRows: commitRows.length,
    hasShortage: type === 'salesOrders' && (hasShortage || shortageRows.length > 0),
    shortageMode: shortageRows.length ? 'cut' : '',
    shortageReport: shortageRows,
    shortageSummary: summarizeOrderShortages(shortageRows),
    shortageReportId: savedShortageReport?._id || '',
    shortageReportCode: savedShortageReport?.code || '',
    shortageReportSaved: Boolean(savedShortageReport),
    sessionId: currentSessionId,
    importSessionId: currentSessionId
  };
}

async function importDirect() {
  return {
    error: 'Import trực tiếp đã bị khóa. Vui lòng preview Excel rồi xác nhận import.',
    status: 410
  };
}

async function logs() {
  const logs = await ImportLog.find({}).sort({ createdAt: -1 }).limit(200).lean().catch(() => []);
  return logs;
}

module.exports = { buildPreviewFromRows, previewPastedRows, preview, getSessionStatus, getSessionRows, commit, importDirect, logs };
