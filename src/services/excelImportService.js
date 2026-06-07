'use strict';

const { normalizeSearchText } = require('../utils/search.util');
const bcrypt = require('bcryptjs');

const dateUtil = require('../utils/date.util');
const { parseExcelBuffer } = require('../../utils/excelParser');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const ImportOrder = require('../models/ImportOrder');
const SalesOrder = require('../models/SalesOrder');
const StockTransaction = require('../models/StockTransaction');
const InventoryLegacy = require('../models/InventoryLegacy');
const Receipt = require('../models/Receipt');
const Cashbook = require('../models/Cashbook');
const ArLedger = require('../models/ArLedger');
const ImportLog = require('../models/ImportLog');
const User = require('../models/User');
const PromotionProductRule = require('../models/PromotionProductRule');
const PromotionGroupItem = require('../models/PromotionGroupItem');
const PromotionGroupRule = require('../models/PromotionGroupRule');
const systemService = require('./systemService');
const inventoryService = require('./inventoryService');
const { toNumber, makeId, normalizeText, normalizePacking } = require('../utils/common.util');
const { applyOrderSourceFields, ORDER_SOURCE } = require('../utils/orderSource.util');
const { DIRECT_PRICE } = require('../constants/pricingModes');
const importRules = require('../rules/importRules');
const importSessionService = require('./importSessionService');
const auditService = require('./auditService');
const promotionService = require('./promotionService');

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
    salesStaffId: order.salesStaffId || order.staffId || '',
    salesStaffCode: order.salesStaffCode || order.staffCode || '',
    salesStaffName: order.salesStaffName || order.staffName || '',
    staffCode: order.salesStaffCode || order.staffCode || '',
    staffName: order.salesStaffName || order.staffName || '',
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

function normalizeProductWarehouseCode(value) {
  const raw = cleanText(value).toUpperCase().replace(/[\s-]+/g, '_');
  if (raw === 'KHO_PC' || raw === 'PC') return 'KHO_PC';
  if (raw === 'KHO_HC' || raw === 'HC') return 'KHO_HC';
  return 'KHO_HC';
}

function productWarehouseName(code) {
  return normalizeProductWarehouseCode(code) === 'KHO_PC' ? 'KHO PC' : 'KHO HC';
}

function pickProductPayload(row = {}) {
  const warehouseCode = normalizeProductWarehouseCode(row.warehouseCode || row.warehouse || row.kho || row['Kho'] || row['Kho mặc định'] || row['Kho mac dinh']);
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
    warehouseCode,
    warehouseName: productWarehouseName(warehouseCode),
    salePrice: toNumber(row.salePrice || row.price || row['Giá bán'] || row['Gia ban']),
    costPrice: toNumber(row.costPrice || row.importPrice || row['Giá nhập'] || row['Gia nhap']),
    minStock: toNumber(row.minStock || row['Tồn tối thiểu'] || row['Ton toi thieu']),
    maxStock: toNumber(row.maxStock || row['Tồn tối đa'] || row['Ton toi da']),
    isActive: row.isActive !== false
  };
}

function pickCustomerPayload(row = {}) {
  const code = cleanText(row.code || row.customerCode || row['Mã khách hàng'] || row['Ma khach hang']);
  return {
    code,
    name: cleanText(row.name || row.customerName || row['Tên khách hàng'] || row['Ten khach hang']),
    phone: cleanText(row.phone || row.customerPhone || row['Số điện thoại'] || row['So dien thoai']),
    address: cleanText(row.address || row.customerAddress || row['Địa chỉ'] || row['Dia chi']),
    area: cleanText(row.area || row['Khu vực'] || row['Khu vuc']),
    route: cleanText(row.route || row['Tuyến'] || row['Tuyen']),
    staffCode: cleanText(row.staffCode || row.salesStaffCode || row.salesmanCode || row['Mã NVBH'] || row['Ma NVBH'] || row['Mã nhân viên'] || row['Ma nhan vien'] || row['Mã nhân viên'] || getSalesStaffCodeFromRow(row)),
    staffName: cleanText(row.staffName || row.salesStaffName || row.salesmanName || row['Tên NVBH'] || row['Ten NVBH']),
    openingDebt: toNumber(row.openingDebt || row['Công nợ đầu kỳ'] || row['Cong no dau ky']),
    debtLimit: toNumber(row.debtLimit || row['Hạn mức nợ'] || row['Han muc no']),
    isActive: row.isActive !== false
  };
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
  return Math.max(1, toNumber(product?.conversionRate ?? product?.packingQty ?? row.packingQty ?? row.conversionRate ?? row['Đóng gói'] ?? row['Dong goi'] ?? row['Quy cách'] ?? row['Quy cach']));
}

function getCartonsFromRow(row = {}) {
  return toNumber(row.cartons ?? row.cartonQty ?? row['Số lượng thùng'] ?? row['So luong thung'] ?? row['SL thùng'] ?? row['SL thung'] ?? row['Thùng'] ?? row['Thung']);
}

function getUnitsFromRow(row = {}) {
  return toNumber(row.units ?? row.unitQty ?? row['Số lượng SU'] ?? row['So luong SU'] ?? row['SL lẻ'] ?? row['SL le'] ?? row['Lẻ'] ?? row['Le']);
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
  const directQty = getRawDmsQuantityValue(row);
  const packing = getPackingFromRow(row, product);
  const cartons = getCartonsFromRow(row);
  const units = getUnitsFromRow(row);
  if (cartons || units) return (cartons * packing) + units;
  return directQty;
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
  return toNumber(row.vatAmount ?? row.taxAmount ?? row['Thuế'] ?? row['Thue']);
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

function getQtyFromRow(row = {}) {
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
  if (directQty > 0 || Object.prototype.hasOwnProperty.call(row, 'quantity') || Object.prototype.hasOwnProperty.call(row, 'Số lượng')) {
    return directQty;
  }
  return getDmsQuantityFromRow(row);
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
    payload.phone,
    payload.address,
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


function pushInventoryMovement({ movements, inventoryDeltas, item, direction, type, refType, refId, refCode, date, warehouseCode, warehouseName, note }) {
  const rawQty = toNumber(item.stockQuantity ?? item.deliveredQuantity ?? item.quantity ?? item.qty);
  if (!rawQty) return;
  const productCode = cleanText(item.productCode || item.code || item.productId);
  if (!productCode) return;
  const productId = String(item.productId || productCode);
  const productName = cleanText(item.productName || item.name);
  const whCode = cleanText(warehouseCode) || 'MAIN';
  const whName = cleanText(warehouseName) || 'Kho chính';
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

  const key = `${productCode}|${whCode}`;
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
  if (movements.length) await insertManyInBatches(StockTransaction, movements);
  const ops = [];
  const now = dateUtil.nowIso();
  for (const delta of inventoryDeltas.values()) {
    const qty = toNumber(delta.qty);
    if (!qty) continue;
    ops.push({
      updateOne: {
        filter: { productCode: delta.productCode, warehouseCode: delta.warehouseCode },
        update: {
          $setOnInsert: {
            id: makeId('IV'),
            productId: delta.productId,
            productCode: delta.productCode,
            warehouseId: delta.warehouseId,
            warehouseCode: delta.warehouseCode,
            reservedQty: 0,
            createdAt: now
          },
          $set: {
            productId: delta.productId,
            productCode: delta.productCode,
            productName: delta.productName,
            warehouseId: delta.warehouseId,
            warehouseCode: delta.warehouseCode,
            warehouseName: delta.warehouseName,
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
        filter: { productCode: row.productCode, warehouseCode: row.warehouseCode || 'MAIN' },
        update: {
          $setOnInsert: {
            id: makeId('IV'),
            createdAt: now
          },
          $set: {
            productId: row.productId || row.productCode,
            productCode: row.productCode,
            productName: row.productName || '',
            warehouseId: row.warehouseId || row.warehouseCode || 'MAIN',
            warehouseCode: row.warehouseCode || 'MAIN',
            warehouseName: row.warehouseName || 'Kho chính',
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

async function upsertProducts(rows = []) {
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
  return { imported, skipped, errors };
}

async function upsertCustomers(rows = []) {
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
  return { imported, skipped, errors };
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
    const quantity = getQtyFromRow(row);
    const product = productMap.get(cleanText(productCode)) || null;
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
    const warehouseCode = cleanText(product.warehouseCode || product.defaultWarehouseCode) || 'KHO_HC';
    const warehouseName = cleanText(product.warehouseName || product.defaultWarehouseName) || productWarehouseName(warehouseCode);
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
      const quantity = getQtyFromRow(row);
      const costPrice = toNumber(product?.costPrice || 0);
      if (!product || quantity <= 0) {
        skipped += 1;
        errors.push({ productCode, message: !product ? 'Không tìm thấy sản phẩm' : 'Dòng nhập kho không hợp lệ' });
        continue;
      }
      items.push({
        productId: String(product.id || product._id || product.code),
        productCode: product.code,
        productName: product.name,
        unit: product.unit,
        quantity,
        costPrice,
        amount: quantity * costPrice,
        warehouseCode: cleanText(row.warehouseCode || row.warehouse || row['Mã Kho'] || row['Ma Kho'] || row['Mã kho'] || row['Ma kho'] || row['Kho']) || cleanText(product.warehouseCode || product.defaultWarehouse) || 'KHO_HC',
        warehouseName: cleanText(row.warehouseName || row['Tên kho'] || row['Ten kho']) || cleanText(product.warehouseName) || ((cleanText(row.warehouseCode || row.warehouse || row['Kho'] || product.warehouseCode || product.defaultWarehouse) === 'KHO_PC') ? 'KHO PC' : 'KHO HC')
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
      warehouseCode: cleanText(first.warehouseCode || first.warehouse || first['Mã Kho'] || first['Ma Kho'] || first['Mã kho'] || first['Ma kho'] || first['Kho']) || 'KHO_HC',
      warehouseName: cleanText(first.warehouseName || first['Tên kho'] || first['Ten kho']) || 'Kho HC',
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
  const autoCutStock = Boolean(options.autoCutStock);
  let skipped = 0;
  const errors = [];
  const customerMap = await preloadCustomersByCode(rows);
  const productMap = await preloadProductsByCode(rows);
  const salesStaffUserMap = await preloadSalesStaffUsersByCode(rows);
  const warehouseCodes = Array.from(new Set(rows.map((r) => cleanText(r.warehouseCode || r.warehouse || r['Kho']) || 'MAIN')));
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
  const stockRows = await InventoryLegacy.find({ productCode: { $in: productCodes } }).lean().catch(() => []);
  const stockMap = new Map();
  const productStockMap = new Map();
  for (const stock of stockRows) {
    const code = cleanText(stock.productCode);
    if (!code) continue;
    const wh = cleanText(stock.warehouseCode || 'MAIN') || 'MAIN';
    const qty = toNumber(stock.availableQty ?? stock.quantity ?? stock.qty ?? stock.onHand);
    const exactKey = `${code}|${wh}`;
    stockMap.set(exactKey, toNumber(stockMap.get(exactKey)) + qty);
    productStockMap.set(code, toNumber(productStockMap.get(code)) + qty);
  }
  const groups = groupRows(rows, makeSalesOrderGroupKey);
  const autoOrderCodes = await buildRunningCodes(SalesOrder, 'BH', groups.length);
  let autoOrderIdx = 0;
  const orderDocs = [];
  // ERP/DMS chuẩn: import Excel DMS chỉ tạo đơn con chờ gộp/giao.
  // Không tạo Payment/Cashbook/AR ngay tại bước import, vì công nợ chỉ phát sinh khi giao hàng thành công.
  const paymentDocs = [];
  const cashbookDocs = [];
  const movements = [];
  const inventoryDeltas = new Map();
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
    const customer = customerMap.get(cleanText(customerCode));
    if (!customer) {
      skipped += group.length;
      errors.push({ customerCode, message: 'Không tìm thấy khách hàng' });
      continue;
    }
    if (!resolvedSalesStaff.staffCode) {
      skipped += group.length;
      errors.push({ documentCode: docCodeCheck, message: 'Thiếu mã NVBH trong file Excel import' });
      continue;
    }
    if (!salesStaffUserMap.get(resolvedSalesStaff.staffCode)) {
      skipped += group.length;
      errors.push({ documentCode: docCodeCheck, staffCode: resolvedSalesStaff.staffCode, message: `Mã NVBH ${resolvedSalesStaff.staffCode} không tồn tại trong users` });
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
      const warehouseCode = cleanText(row.warehouseCode || row.warehouse || row['Mã Kho'] || row['Ma Kho'] || row['Mã kho'] || row['Ma kho'] || first.warehouseCode || first.warehouse || first['Mã Kho'] || first['Ma Kho'] || first['Kho'] || product?.warehouseCode) || 'MAIN';
      const normalizedProductCode = cleanText(product?.code || productCode);
      const stockKey = `${normalizedProductCode}|${warehouseCode}`;
      let availableQty = stockMap.has(stockKey) ? stockMap.get(stockKey) : toNumber(productStockMap.get(normalizedProductCode));
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
        shortageReport.push({
          documentCode: docCodeCheck === 'AUTO' ? '' : docCodeCheck,
          customerCode,
          customerName: getCustomerNameFromRow(first) || customer?.name || '',
          productCode: normalizedProductCode,
          productName: product.name,
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

      if (stockMap.has(stockKey)) stockMap.set(stockKey, Math.max(0, availableQty - deliveredQuantity));
      productStockMap.set(normalizedProductCode, Math.max(0, toNumber(productStockMap.get(normalizedProductCode)) - deliveredQuantity));
      const listPriceBeforeVat = getListPriceBeforeVatFromRow(row);
      const baseItem = {
        productId: String(product.id || product._id || product.code),
        productCode: product.code,
        productName: product.name,
        unit: product.unit,
        packingQty: getPackingFromRow(row, product),
        listPriceBeforeVat,
        listPriceAfterVat: listPriceBeforeVat ? listPriceBeforeVat * 1.08 : 0,
        gsvAmount: toNumber(row.gsvAmount ?? row['GSV bán ra'] ?? row['GSV ban ra']),
        nivAmount: toNumber(row.nivAmount ?? row['NIV bán ra'] ?? row['NIV ban ra']),
        vatAmount: getVatAmountFromRow(row),
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
          price: 0,
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
      saleMethod: DIRECT_PRICE,
      saleMode: DIRECT_PRICE,
      pricingMode: DIRECT_PRICE,
      orderPricingMode: DIRECT_PRICE,
      priceLocked: true,
      promotionCalculated: false,
      isPromotionSale: false,
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
      warehouseCode: cleanText(first.warehouseCode || first.warehouse || first['Mã Kho'] || first['Ma Kho'] || first['Mã kho'] || first['Ma kho'] || first['Kho']) || 'KHO_HC',
      warehouseName: cleanText(first.warehouseName || first['Tên kho'] || first['Ten kho']) || 'Kho HC',
      createdAt: now,
      updatedAt: now
    };
    Object.assign(doc, applyOrderSourceFields(doc, ORDER_SOURCE.DMS));
    orderDocs.push(doc);
    if (doc.documentCode) importedDocumentSet.add(cleanText(doc.documentCode));
    for (const item of items) {
      pushInventoryMovement({
        movements,
        inventoryDeltas,
        item,
        direction: 'OUT',
        type: item.lineType === 'PROMO' || item.isPromo ? 'PROMO_OUT' : 'SALE',
        refType: 'SALES_ORDER',
        refId: doc.id,
        refCode: doc.code,
        date: doc.date,
        warehouseCode: doc.warehouseCode,
        warehouseName: doc.warehouseName,
        note: doc.note
      });
    }
  }

  const orderResult = await insertManyInBatches(SalesOrder, orderDocs);
  // V45 lazy return-order: import/tạo đơn bán không sinh RO-DRAFT rỗng.
  // Phiếu trả chỉ được tạo khi có phát sinh returnQty > 0 từ app/phần mềm giao hàng.
  const returnDraftResult = { errors: [] };
  const paymentResult = { errors: [] };
  const cashResult = { errors: [] };
  const inventoryResult = await applyInventoryMovementsBulk(movements, inventoryDeltas);

  skipped += orderResult.errors.length + returnDraftResult.errors.length + paymentResult.errors.length + cashResult.errors.length;
  errors.push(...orderResult.errors.map((error) => ({ customerCode: '', message: error.message })));
  errors.push(...paymentResult.errors.map((error) => ({ customerCode: '', message: `Payment: ${error.message}` })));
  errors.push(...cashResult.errors.map((error) => ({ customerCode: '', message: `Cashbook: ${error.message}` })));
  const imported = Math.max(0, orderDocs.length - orderResult.errors.length);
  await addImportLog('salesOrders', {
    imported,
    skipped,
    errors: errors.slice(0, 30),
    mode: 'bulkSalesOrders',
    batchSize: IMPORT_BATCH_SIZE,
    payments: paymentDocs.length,
    cashbook: cashbookDocs.length,
    returnDrafts: 0,
    stockTransactions: inventoryResult.transactionCount,
    inventoryRows: inventoryResult.inventoryRows,
    shortageCount: shortageReport.length,
    shortageReport: shortageReport.slice(0, 100)
  });
  return { imported, skipped, errors, shortageReport };
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

async function importDebtCollections(rows = []) {
  let skipped = 0;
  const errors = [];
  const customerMap = await preloadCustomersByCode(rows);
  const receiptDocs = [];
  const paymentDocs = [];
  const cashbookDocs = [];
  const receiptCodes = await buildRunningCodes(Receipt, 'TH', rows.length);
  const cashCodes = await buildRunningCodes(Cashbook, 'PT', rows.length);
  let codeIdx = 0;
  let cashCodeIdx = 0;

  for (const row of rows) {
    const customerCode = getCustomerCodeFromRow(row);
    const customer = customerMap.get(cleanText(customerCode)) || await findCustomerByAny(customerCode);
    const amount = toNumber(row.amount ?? row['Số tiền'] ?? row['So tien'] ?? row['Tiền thu'] ?? row['Tien thu'] ?? number(row, ['amount', 'số tiền', 'so tien', 'tiền thu', 'tien thu']));
    if (!customer || amount <= 0) {
      skipped += 1;
      errors.push({ customerCode, message: !customer ? 'Không tìm thấy khách hàng' : 'Số tiền thu phải lớn hơn 0' });
      continue;
    }
    const now = dateUtil.nowIso();
    const code = cleanText(row.code || row.receiptCode || row['Mã phiếu'] || row['Ma phieu']) || receiptCodes[codeIdx++] || `TH${Date.now()}${codeIdx}`;
    const receipt = {
      id: makeId('RC'),
      code,
      date: dateOnly(row.date || dateUtil.todayVN()),
      customerId: String(customer.id || customer._id || customer.code),
      customerCode: customer.code,
      customerName: customer.name,
      method: 'cash',
      amount,
      staffName: cleanText(row.staffName || row['Người thu'] || row['Nguoi thu'] || row['Nhân viên']),
      note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']) || 'Import thu công nợ Excel',
      refType: 'receipt',
      refId: '',
      refCode: code,
      status: 'posted',
      createdAt: now,
      updatedAt: now
    };
    receiptDocs.push(receipt);
    paymentDocs.push({
      id: makeId('PM'),
      date: receipt.date,
      type: 'debt',
      refType: 'receipt',
      refId: receipt.id,
      refCode: receipt.code,
      customerId: receipt.customerId,
      customerCode: receipt.customerCode,
      customerName: receipt.customerName,
      debit: 0,
      credit: amount,
      amount,
      note: receipt.note,
      status: 'posted',
      createdAt: now,
      updatedAt: now
    });
    cashbookDocs.push({
      id: makeId('CB'),
      code: cashCodes[cashCodeIdx++] || `PT${Date.now()}${cashCodeIdx}`,
      date: receipt.date,
      type: 'in',
      source: 'debt_collection_import',
      refType: 'receipt',
      refId: receipt.id,
      refCode: receipt.code,
      customerId: receipt.customerId,
      customerCode: receipt.customerCode,
      customerName: receipt.customerName,
      staffName: receipt.staffName,
      amount,
      note: receipt.note,
      status: 'posted',
      createdAt: now,
      updatedAt: now
    });
  }

  const receiptResult = await insertManyInBatches(Receipt, receiptDocs);
  const paymentResult = { errors: [] };
  const cashResult = { errors: [] };
  const insertErrors = [...receiptResult.errors, ...paymentResult.errors, ...cashResult.errors];
  skipped += insertErrors.length;
  errors.push(...insertErrors.map((e) => ({ customerCode: '', message: e.message })));
  const imported = Math.max(0, receiptDocs.length - receiptResult.errors.length);
  await addImportLog('debtCollections', { imported, skipped, errors: errors.slice(0, 30), mode: 'insertMany', batchSize: IMPORT_BATCH_SIZE });
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
  return cleanText(user.fullName || user.name || user.staffName || user.username || '');
}

function getUserStaffCode(user = {}) {
  return cleanText(user.staffCode || user.code || user.username || user.id || user._id || '');
}

function isSalesStaffUser(user = {}) {
  const role = cleanText(user.role).toLowerCase();
  return ['sales', 'admin', 'nvbh'].includes(role);
}

async function preloadSalesStaffUsersByCode(rows = []) {
  const codes = Array.from(new Set((rows || []).map(getSalesStaffCodeFromRow).map(cleanText).filter(Boolean)));
  if (!codes.length) return new Map();
  const users = await User.find({
    isActive: { $ne: false },
    $or: [
      { staffCode: { $in: codes } },
      { code: { $in: codes } },
      { employeeCode: { $in: codes } },
      { salesStaffCode: { $in: codes } },
      { username: { $in: codes } },
      { maNhanVien: { $in: codes } },
      { employeeId: { $in: codes } },
      { staffId: { $in: codes } }
    ]
  }).select('id staffCode code employeeCode salesStaffCode username maNhanVien employeeId staffId fullName name staffName phone role isActive').lean().catch(() => []);

  const map = new Map();
  for (const user of users || []) {
    [user.staffCode, user.code, user.employeeCode, user.salesStaffCode, user.username, user.maNhanVien, user.employeeId, user.staffId, String(user._id || '')]
      .forEach((value) => addUserStaffAlias(map, value, user));
  }
  return map;
}

function resolveSalesStaffForImportRow(row = {}, salesStaffUserMap = new Map()) {
  // Quy tắc chuẩn: mã NVBH lấy trực tiếp từ file Excel import.
  // Tên NVBH không lấy từ khách hàng và không tin tên Excel; chỉ tra từ users Mongo theo mã Excel.
  const excelStaffCode = cleanText(getSalesStaffCodeFromRow(row));
  const user = excelStaffCode ? salesStaffUserMap.get(excelStaffCode) : null;
  return {
    staffCode: user ? (getUserStaffCode(user) || excelStaffCode) : excelStaffCode,
    salesStaffCode: user ? (getUserStaffCode(user) || excelStaffCode) : excelStaffCode,
    staffName: user ? getUserStaffName(user) : '',
    salesStaffName: user ? getUserStaffName(user) : '',
    user,
    found: !!user,
    validRole: !user || isSalesStaffUser(user)
  };
}

async function getStockMapByProductCode(rows = []) {
  const codes = Array.from(new Set(rows.map(getProductCodeFromRow).map(cleanText).filter(Boolean)));
  if (!codes.length) return new Map();
  const inventoryRows = await InventoryLegacy.find({ productCode: { $in: codes } }).lean().catch(() => []);
  const buildMap = (inventoryRows = []) => {
    const map = new Map();
    for (const row of inventoryRows) {
      const code = cleanText(row.productCode || row.productId);
      if (!code) continue;
      const qty = toNumber(row.availableQty ?? row.quantity ?? row.qty ?? row.onHand);
      map.set(code, toNumber(map.get(code)) + qty);
    }
    return map;
  };
  return buildMap(inventoryRows);
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
        raw.staffCode = row.staffCode || row.salesStaffCode || raw.staffCode;
        raw.salesStaffCode = row.salesStaffCode || row.staffCode || raw.salesStaffCode;
        raw.staffName = row.staffName || row.salesStaffName || raw.staffName;
        raw.salesStaffName = row.salesStaffName || row.staffName || raw.salesStaffName;
        result.push(raw);
      }
    } else {
      const raw = cloneRawRowForImport(row);
      raw.staffCode = row.staffCode || row.salesStaffCode || raw.staffCode;
      raw.salesStaffCode = row.salesStaffCode || row.staffCode || raw.salesStaffCode;
      raw.staffName = row.staffName || row.salesStaffName || raw.staffName;
      raw.salesStaffName = row.salesStaffName || row.staffName || raw.salesStaffName;
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

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || ''));
}

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

async function importUsers(rows = []) {
  const errors = [];
  const warnings = [];
  let imported = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);
  const validRows = [];
  const seen = new Map();

  rows.forEach((raw, index) => {
    const item = pickUserImportPayload(raw);
    const rowNo = item.rowNo || item.__rowNo || index + 2;
    const rowErrors = [];
    if (!item.username) rowErrors.push('Thiếu tên đăng nhập');
    if (!item.fullName) rowErrors.push('Thiếu họ tên');
    if (!item.staffCode) rowErrors.push('Thiếu mã nhân viên');
    if (!item.role) rowErrors.push('Vai trò không hợp lệ');
    if (rowErrors.length) {
      skipped += 1;
      errors.push({ row: rowNo, username: item.username, message: rowErrors.join('; ') });
      return;
    }
    const key = item.username.toLowerCase();
    if (seen.has(key)) warnings.push({ row: rowNo, username: item.username, warning: 'Trùng tên đăng nhập trong file, hệ thống lấy dòng cuối cùng' });
    seen.set(key, item);
  });

  validRows.push(...seen.values());
  for (const item of validRows) {
    const current = await User.findOne({ username: item.username }).lean();
    const password = item.password
      ? (isBcryptHash(item.password) ? item.password : bcrypt.hashSync(item.password, BCRYPT_ROUNDS))
      : (current?.password || bcrypt.hashSync('123456', BCRYPT_ROUNDS));
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
    await User.updateOne({ username: item.username }, { $set: payload, $setOnInsert: { id: item.staffCode || item.username } }, { upsert: true });
    imported += 1;
    if (current) updated += 1; else created += 1;
  }

  await addImportLog('users', { imported, created, updated, skipped, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50), mode: 'upsert' });
  return { imported, created, updated, skipped, errors, warnings, message: `Đã import ${imported} tài khoản: tạo mới ${created}, cập nhật ${updated}${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}` };
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

async function previewMongoNative(type, rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  let result = [];

  if (type === 'products') {
    const payloads = safeRows.map((row) => ({ ...rowBase(row), ...pickProductPayload(row), errors: [] }));
    const codes = Array.from(new Set(payloads.map((p) => cleanText(p.code)).filter(Boolean)));
    const existingRows = codes.length ? await Product.find({ code: { $in: codes } }).select('code').lean() : [];
    const existing = new Set(existingRows.map((p) => cleanText(p.code)));
    const seen = new Set();
    result = payloads.map((item) => {
      if (!item.code) item.errors.push('Thiếu mã sản phẩm');
      if (!item.name) item.errors.push('Thiếu tên sản phẩm');
      if (item.code && existing.has(cleanText(item.code))) item.errors.push('Mã sản phẩm đã tồn tại');
      if (item.code && seen.has(cleanText(item.code))) item.errors.push('Mã sản phẩm bị trùng trong file');
      if (item.code) seen.add(cleanText(item.code));
      if (toNumber(item.conversionRate) < 1) item.errors.push('Quy đổi phải lớn hơn hoặc bằng 1');
      if (toNumber(item.costPrice) < 0 || toNumber(item.salePrice) < 0) item.errors.push('Giá không được âm');
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'customers') {
    const salesStaffUserMap = await preloadSalesStaffUsersByCode(safeRows);
    const payloads = safeRows.map((row) => {
      const payload = { ...rowBase(row), ...pickCustomerPayload(row), errors: [] };
      if (payload.staffCode) {
        const resolvedStaff = resolveSalesStaffForImportRow(row, salesStaffUserMap);
        if (!resolvedStaff.found) payload.errors.push(`Không tìm thấy mã NVBH ${payload.staffCode} trong tài khoản hệ thống`);
        else if (!resolvedStaff.validRole) payload.errors.push(`Mã ${payload.staffCode} không phải nhân viên bán hàng`);
        else {
          payload.staffCode = resolvedStaff.staffCode;
          payload.staffName = resolvedStaff.staffName;
        }
      }
      return payload;
    });
    const codes = Array.from(new Set(payloads.map((c) => cleanText(c.code)).filter(Boolean)));
    const existingRows = codes.length ? await Customer.find({ code: { $in: codes } }).select('code').lean() : [];
    const existing = new Set(existingRows.map((c) => cleanText(c.code)));
    const seen = new Set();
    result = payloads.map((item) => {
      if (!item.code) item.errors.push('Thiếu mã khách hàng');
      if (!item.name) item.errors.push('Thiếu tên khách hàng');
      if (item.code && existing.has(cleanText(item.code))) item.errors.push('Mã khách hàng đã tồn tại');
      if (item.code && seen.has(cleanText(item.code))) item.errors.push('Mã khách hàng bị trùng trong file');
      if (item.code) seen.add(cleanText(item.code));
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'openingStock') {
    const productMap = await preloadProductsByCode(safeRows);
    result = safeRows.map((row) => {
      const productCode = getProductCodeFromRow(row);
      const product = productMap.get(cleanText(productCode));
      const quantity = getQtyFromRow(row);
      const warehouseCode = product ? (cleanText(product.warehouseCode || product.defaultWarehouseCode) || 'KHO_HC') : '';
      const item = {
        ...rowBase(row),
        documentCode: 'AUTO',
        date: getDateFromRow(row),
        productCode,
        productName: product?.name || '',
        warehouseCode,
        warehouseName: product ? (cleanText(product.warehouseName || product.defaultWarehouseName) || productWarehouseName(warehouseCode)) : '',
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
      let totalQuantity = 0;
      let totalAmount = 0;

      for (const row of group) {
        const productCode = getProductCodeFromRow(row);
        const product = productMap.get(cleanText(productCode));
        const quantity = getQtyFromRow(row);
        const costPrice = toNumber(product?.costPrice || 0);
        const amount = quantity * costPrice;
        const lineErrors = [];
        if (!productCode) lineErrors.push('Thiếu mã sản phẩm');
        if (!product) lineErrors.push('Không tìm thấy sản phẩm');
        if (quantity <= 0) lineErrors.push('Số lượng nhập phải lớn hơn 0');
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
      }

      if (detailErrors.length) errors.push(`${detailErrors.length} dòng hàng lỗi`);
      return {
        ...rowBase(first),
        previewMode: 'order',
        documentCode,
        date: getDateFromRow(first),
        supplier: cleanText(first.supplier || first.supplierName || first['Nhà cung cấp'] || first['Nha cung cap']) || 'Import Excel',
        customerCode: '',
        customerName: '',
        lineCount: group.length,
        totalQuantity,
        totalAmount,
        amount: totalAmount,
        statusText: errors.length ? 'Có lỗi' : 'Hợp lệ',
        hasShortage: false,
        shortageCount: 0,
        shortageReport: [],
        lineDetails,
        detailErrors,
        __importRows: group,
        errors,
        valid: errors.length === 0
      };
    });
  } else if (type === 'salesOrders') {
    const productMap = await preloadProductsByCode(safeRows);
    const customerMap = await preloadCustomersByCode(safeRows);
    const stockMap = await getStockMapByProductCode(safeRows);
    const runningStockMap = new Map(stockMap);
    const groups = groupRows(safeRows, makeSalesOrderGroupKey);

    result = groups.map((group) => {
      const first = group[0] || {};
      const documentCode = getOrderDocumentCode(first);
      const customerCode = getCustomerCodeFromRow(first);
      const customer = customerMap.get(cleanText(customerCode));
      const errors = [];
      const detailErrors = [];
      const shortageReport = [];
      const lineDetails = [];
      const adjustedRows = [];
      let totalQuantity = 0;
      let totalAmount = 0;
      let adjustedQuantity = 0;
      let adjustedAmount = 0;

      if (!customerCode) errors.push('Thiếu mã khách hàng / mã cửa hàng');
      if (!customer) errors.push('Không tìm thấy khách hàng');

      for (const row of group) {
        const productCode = getProductCodeFromRow(row);
        const product = productMap.get(cleanText(productCode));
        const quantity = getDmsQuantityFromRow(row, product);
        const promoQuantity = getDmsPromoQuantityFromRow(row, product);
        const deliveredQuantity = quantity + promoQuantity;
        const salePrice = getDmsPriceFromRow(row, quantity);
        const amount = getDmsAmountFromRow(row, quantity, salePrice);
        const normalizedProductCode = cleanText(product?.code || productCode);
        const availableBefore = toNumber(runningStockMap.get(normalizedProductCode));
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
            requestedQuantity: deliveredQuantity,
            saleQuantity: quantity,
            promoQuantity,
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
        if (product) runningStockMap.set(normalizedProductCode, Math.max(0, availableBefore - deliveredQuantity));

        lineDetails.push({
          rowNo: row.__rowNo || row.rowNo || '',
          productCode,
          productName: product?.name || cleanText(row.productName || row['Tên sản phẩm'] || row['Ten san pham']),
          saleQuantity: quantity,
          promoQuantity,
          requestedQuantity: deliveredQuantity,
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
      return {
        ...rowBase(first),
        previewMode: 'order',
        documentCode,
        date: getDateFromRow(first),
        customerCode,
        customerName: getCustomerNameFromRow(first) || customer?.name || '',
        // Mã NVBH phải lấy từ Excel; tên NVBH sẽ được validate/điền lại từ users Mongo theo mã này.
        staffCode: getSalesStaffCodeFromRow(first),
        salesStaffCode: getSalesStaffCodeFromRow(first),
        staffName: '',
        salesStaffName: '',
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
        statusText: blockingErrors.length ? 'Có lỗi' : (detailErrors.length ? 'Có dòng bị bỏ qua' : (shortageReport.length ? 'Vượt tồn' : 'Hợp lệ')),
        shortageReport,
        lineDetails,
        detailErrors,
        __importRows: group,
        __adjustedRows: adjustedRows,
        errors: blockingErrors,
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
    const seen = new Set();
    result = safeRows.map((row) => {
      const item = pickUserImportPayload(row);
      item.errors = [];
      item.warnings = [];
      if (!item.username) item.errors.push('Thiếu tên đăng nhập');
      if (!item.fullName) item.errors.push('Thiếu họ tên');
      if (!item.staffCode) item.errors.push('Thiếu mã nhân viên');
      if (!item.role) item.errors.push('Vai trò không hợp lệ');
      const key = item.username.toLowerCase();
      if (key && seen.has(key)) item.warnings.push('Trùng tên đăng nhập trong file; khi import hệ thống lấy dòng cuối cùng');
      if (key) seen.add(key);
      item.passwordStatus = item.password ? 'Có nhập mật khẩu' : 'Để trống: giữ mật khẩu cũ hoặc dùng 123456 nếu tạo mới';
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
  if (!list.length && buffer) list.push({ buffer, fileName: cleanText(fileName || 'File Excel') });
  return list;
}

function parseExcelFiles({ files = [], buffer = null, fileName = '' } = {}) {
  const normalizedFiles = normalizeImportFiles({ files, buffer, fileName });
  const rows = [];
  const fileReports = [];
  for (const file of normalizedFiles) {
    const fileRows = parseExcelBuffer(file.buffer).map((row, index) => ({
      ...row,
      __sourceFile: file.fileName,
      sourceFile: file.fileName,
      fileName: file.fileName,
      __fileIndex: fileReports.length,
      __rowNo: row.__rowNo || row.rowNo || index + 2
    }));
    fileReports.push({
      fileName: file.fileName,
      totalRows: fileRows.length,
      totalOrders: 0,
      errors: []
    });
    rows.push(...fileRows);
  }
  return { rows, fileReports, totalFiles: normalizedFiles.length };
}

async function preview({ type, files = [], buffer = null, fileName = '', userName = '' }) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (type === 'salesOrdersS3') type = 'salesOrders';
  const parsed = parseExcelFiles({ files, buffer, fileName });
  if (!parsed.totalFiles) return { error: 'Chưa chọn file Excel', status: 400 };
  const rows = parsed.rows;
  if (!rows.length) return { error: 'File Excel không có dữ liệu', status: 400 };

  const result = await previewMongoNative(type, rows);
  result.files = parsed.fileReports;
  result.totalFiles = parsed.totalFiles;
  if (type === 'salesOrders') {
    const validatedRows = await importRules.validateImportBatch(result.rows || []);
    const session = importSessionService.createSession({ type, rows: validatedRows, rawRows: rows, createdBy: userName });
    await auditService.log('IMPORT_PREVIEW', {
      refType: 'importSession',
      refId: session.id,
      refCode: session.id,
      userName,
      summary: {
        type,
        totalOrders: validatedRows.length,
        validOrders: validatedRows.filter((r) => r.valid).length,
        invalidOrders: validatedRows.filter((r) => !r.valid).length
      }
    });
    const orderCountByFile = new Map();
    validatedRows.forEach((row) => {
      const name = cleanText(row.sourceFile || row.fileName || '');
      if (!name) return;
      orderCountByFile.set(name, Number(orderCountByFile.get(name) || 0) + 1);
    });
    const fileReports = (parsed.fileReports || []).map((report) => ({
      ...report,
      totalOrders: Number(orderCountByFile.get(report.fileName) || 0),
      errors: validatedRows.filter((row) => cleanText(row.sourceFile || row.fileName) === report.fileName && row.valid === false).flatMap((row) => row.errors || []).slice(0, 20)
    }));
    return {
      ...result,
      files: fileReports,
      rows: validatedRows,
      total: validatedRows.length,
      valid: validatedRows.filter((r) => r.valid).length,
      invalid: validatedRows.filter((r) => !r.valid).length,
      sessionId: session.id,
      importSessionId: session.id
    };
  }

  return result;
}

async function commit({ type, rows, shortageMode = '', sessionId = '', selectedOrderCodes = [], userName = '' }) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (type === 'salesOrdersS3') type = 'salesOrders';

  let sourceRows = Array.isArray(rows) ? rows : [];
  let session = null;
  if (sessionId) {
    session = importSessionService.getSession(sessionId);
    if (!session) return { error: 'Phiên preview import đã hết hạn, vui lòng preview lại file Excel', status: 400 };
    if (session.type !== type) return { error: 'Phiên preview không khớp loại import', status: 400 };
    sourceRows = importSessionService.selectRows(session, selectedOrderCodes);
    if (!sourceRows.length) return { error: 'Chưa chọn đơn hợp lệ trong phiên preview', status: 400 };
  }

  if (!Array.isArray(sourceRows) || !sourceRows.length) return { error: 'Chưa có dòng nào để import', status: 400 };

  // Backend validate lần 2. Không tin hoàn toàn dữ liệu frontend.
  if (type === 'salesOrders') {
    sourceRows = await importRules.validateImportBatch(sourceRows);
  }

  const validRows = sourceRows.filter((r) => r && r.valid !== false && r.canImport !== false && (!Array.isArray(r.errors) || r.errors.length === 0));
  if (!validRows.length) {
    return {
      error: 'Không có dòng/đơn hợp lệ để import',
      status: 400,
      errors: sourceRows.flatMap((r) => r.errors || []).slice(0, 50)
    };
  }

  const hasShortage = validRows.some((r) => r && r.hasShortage);
  const commitRows = type === 'salesOrders'
    ? flattenAdjustedCommitRows(validRows)
    : flattenCommitRows(validRows);

  let result;
  if (type === 'products') result = await upsertProducts(commitRows);
  else if (type === 'customers') result = await upsertCustomers(commitRows);
  else if (type === 'users') result = await importUsers(commitRows);
  else if (type === 'openingStock') result = await importOpeningStock(commitRows);
  else if (type === 'importOrders') result = await importImportOrders(commitRows);
  else if (type === 'salesOrders') result = await importSalesOrders(commitRows, { autoCutStock: true });
  else if (type === 'openingDebt') result = await importOpeningDebt(commitRows);
  else if (type === 'debtCollections') result = await importDebtCollections(commitRows);
  else if (type === 'cashbook') result = await importCashbook(commitRows);
  else if (type === 'promotionProductRules') result = await importPromotionProductRules(commitRows);
  else if (type === 'promotionGroupItems') result = await importPromotionGroupItems(commitRows);
  else if (type === 'promotionGroupRules') result = await importPromotionGroupRules(commitRows);
  else return { error: 'Loại import không hợp lệ', status: 400 };

  if (session) importSessionService.updateSession(session.id, { status: 'committed', selectedOrderCodes, committedAt: dateUtil.nowIso() });
  await auditService.log('IMPORT_COMMIT', {
    refType: 'importSession',
    refId: session?.id || '',
    refCode: session?.id || '',
    userName,
    summary: {
      type,
      totalSelected: sourceRows.length,
      totalValid: validRows.length,
      totalCommitRows: commitRows.length,
      imported: result.imported || 0,
      skipped: result.skipped || 0,
      errors: (result.errors || []).slice(0, 20)
    }
  });

  const shortageRows = type === 'salesOrders'
    ? normalizeShortageRows([
        ...validRows.flatMap((r) => r.shortageReport || []),
        ...(result.shortageReport || [])
      ])
    : [];
  const shortageSummary = summarizeOrderShortages(shortageRows);
  return {
    ...result,
    source: session ? 'mongo-native-session-commit' : 'mongo-native-direct',
    ok: true,
    message: `Đã import ${result.imported || 0} chứng từ`,
    totalRows: sourceRows.length,
    totalCommitRows: commitRows.length,
    hasShortage: type === 'salesOrders' && (hasShortage || shortageRows.length > 0),
    shortageMode: shortageRows.length ? 'cut' : '',
    shortageReport: shortageRows,
    shortageSummary
  };
}

async function importDirect({ type, files = [], buffer = null, fileName = '' }) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (type === 'salesOrdersS3') type = 'salesOrders';
  const parsed = parseExcelFiles({ files, buffer, fileName });
  if (!parsed.totalFiles) return { error: 'Chưa chọn file Excel', status: 400 };
  const rows = parsed.rows;
  if (!rows.length) return { error: 'File Excel không có dữ liệu', status: 400 };

  let result;
  if (type === 'products') result = await upsertProducts(rows);
  else if (type === 'customers') result = await upsertCustomers(rows);
  else if (type === 'openingStock') result = await importOpeningStock(rows);
  else if (type === 'importOrders') result = await importImportOrders(rows);
  else if (type === 'salesOrders') result = await importSalesOrders(rows, { autoCutStock: true });
  else if (type === 'openingDebt') result = await importOpeningDebt(rows);
  else if (type === 'debtCollections') result = await importDebtCollections(rows);
  else if (type === 'cashbook') result = await importCashbook(rows);
  else if (type === 'promotionProductRules') result = await importPromotionProductRules(rows);
  else if (type === 'promotionGroupItems') result = await importPromotionGroupItems(rows);
  else if (type === 'promotionGroupRules') result = await importPromotionGroupRules(rows);
  else return { error: 'Loại import không hợp lệ', status: 400 };

  const shortageRows = type === 'salesOrders' ? normalizeShortageRows(result.shortageReport || []) : [];
  const shortageSummary = summarizeOrderShortages(shortageRows);
  return {
    ...result,
    source: 'mongo-native-direct',
    ok: true,
    message: `Đã import ${result.imported || 0} chứng từ`,
    totalRows: rows.length,
    totalCommitRows: rows.length,
    hasShortage: shortageRows.length > 0,
    shortageMode: shortageRows.length ? 'cut' : '',
    shortageReport: shortageRows,
    shortageSummary
  };
}

async function logs() {
  const logs = await ImportLog.find({}).sort({ createdAt: -1 }).limit(200).lean().catch(() => []);
  return logs;
}

module.exports = { preview, commit, importDirect, logs };
