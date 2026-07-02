'use strict';

const { normalizeSearchText } = require('../../../utils/search.util');
const dateUtil = require('../../../utils/date.util');
const Product = require('../../../models/Product');
const Customer = require('../../../models/Customer');
const { addImportLog } = require('./importLogging.util');
const { toNumber, makeId, normalizeText, normalizePacking } = require('../../../utils/common.util');
const { extractCustomerTaxProfile } = require('../../../utils/customerTaxProfile.util');
const { extractCustomerBusinessProfile } = require('../../../utils/customerBusinessProfile.util');
const {
  IMPORT_MODE_CREATE,
  IMPORT_MODE_UPDATE,
  normalizeImportMode,
  getProvidedField,
  parseImportBoolean,
  buildChanges,
  omitUnchanged
} = require('../selectiveUpdate.util');
const { normalizePickingZone, pickingZoneFrom, legacyPrintGroupCode, pickingZoneLabel, PICKING_ZONES } = require('../../../utils/pickingZone.util');
const {
  pickSalesStaffCode,
  pickSalesStaffName,
  buildSalesStaffSnapshot,
  SALES_STAFF_CODE_FIELDS,
  USER_ACCOUNT_SALES_STAFF_CODE_FIELDS,
  pickUserAccountSalesStaffCode
} = require('../../../domain/staff/staffIdentity');
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

async function buildRunningCode(Model, prefix, field = 'code') {
  const rows = await Model.find({ [field]: new RegExp(`^${prefix}`) }).select(field).lean();
  const max = rows.reduce((result, row) => {
    const match = String(row[field] || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}${String(max + 1).padStart(5, '0')}`;
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

module.exports = {
  makeReturnDraftItemFromImportItem,
  buildReturnDraftFromImportedOrder,
  cleanText,
  isValidDateParts,
  formatDateOnly,
  normalizeImportDate,
  dateOnly,
  isObjectIdLike,
  get,
  text,
  number,
  normalizeProductPickingZone,
  productPickingZoneName,
  normalizeProductWarehouseCode,
  productWarehouseName,
  pickProductPayload,
  pickCustomerPayload,
  applyTextPatch,
  applyNumberPatch,
  applyBooleanPatch,
  buildProductSelectiveUpdate,
  buildCustomerSelectiveUpdate,
  buildRunningCode,
  addImportLog,
  findProductByAny,
  findCustomerByAny,
  excelSerialToDate,
  getDateFromRow,
  getPackingFromRow,
  hasAnyQuantityColumn,
  hasCartonUnitQuantityColumns,
  getCartonsFromRow,
  getUnitsFromRow,
  getCartonUnitQuantityFromRow,
  getPromoCartonsFromRow,
  getPromoUnitsFromRow,
  getPromoCartons2FromRow,
  getPromoUnits2FromRow,
  isPromoLineFromRow,
  hasOwnImportValue,
  getRawDmsQuantityValue,
  hasExplicitDmsAmount,
  getExplicitDmsAmount,
  isZeroAmountPromoLineFromRow,
  getDmsQuantityFromRow,
  getDmsPromoQuantityFromRow,
  allocateStockForSaleAndPromo,
  getActualAmountFromRow,
  getListPriceBeforeVatFromRow,
  getVatAmountFromRow,
  getGsvAmountFromRow,
  getNivAmountFromRow,
  getDmsCatalogPriceAfterVatFromRow,
  getDmsVatAmountForLine,
  getDmsPriceFromRow,
  getDmsAmountFromRow,
  getProductCodeFromRow,
  getCustomerCodeFromRow,
  getCustomerNameFromRow,
  getRouteCodeFromRow,
  getQtyFromRow,
  getCostFromRow,
  getSalePriceFromRow,
  productSearchText,
  customerSearchText
};