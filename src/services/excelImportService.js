'use strict';

const { parseExcelBuffer } = require('../../utils/excelParser');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const ImportOrder = require('../models/ImportOrder');
const SalesOrder = require('../models/SalesOrder');
const StockTransaction = require('../models/StockTransaction');
const Inventory = require('../models/Inventory');
const InventoryLegacy = require('../models/InventoryLegacy');
const Receipt = require('../models/Receipt');
const Cashbook = require('../models/Cashbook');
const Payment = require('../models/Payment');
const ImportLog = require('../models/ImportLog');
const systemService = require('./systemService');
const inventoryService = require('./inventoryService');
const { toNumber, makeId, normalizeText, normalizePacking } = require('../utils/common.util');
const { applyOrderSourceFields, ORDER_SOURCE } = require('../utils/orderSource.util');

function cleanText(value) {
  return String(value ?? '').trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeImportDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const textValue = cleanText(value);
  if (!textValue) return today();

  if (/^\d+(\.\d+)?$/.test(textValue)) return excelSerialToDate(textValue) || textValue.slice(0, 10);

  const iso = textValue.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;

  const parts = textValue.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})/);
  if (parts) {
    let a = Number(parts[1]);
    let b = Number(parts[2]);
    let y = Number(parts[3]);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    let day;
    let month;
    if (b > 12 && a <= 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return textValue.slice(0, 10);
}

function dateOnly(value) {
  return normalizeImportDate(value || today());
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
    staffCode: cleanText(row.staffCode || row.salesmanCode || row['Mã NVBH'] || row['Ma NVBH']),
    staffName: cleanText(row.staffName || row.salesmanName || row['Tên NVBH'] || row['Ten NVBH']),
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
    createdAt: nowIso()
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
  return new Date(utc).toISOString().slice(0, 10);
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

function getDmsQuantityFromRow(row = {}, product = null) {
  const directQty = toNumber(row.quantity ?? row.qty ?? row['Số lượng'] ?? row['So luong'] ?? row.sl ?? number(row, ['quantity', 'qty', 'số lượng', 'so luong', 'sl']));
  const packing = getPackingFromRow(row, product);
  const cartons = getCartonsFromRow(row);
  const units = getUnitsFromRow(row);
  if (cartons || units) return (cartons * packing) + units;
  return directQty;
}

function getDmsPromoQuantityFromRow(row = {}, product = null) {
  const packing = getPackingFromRow(row, product);
  return (getPromoCartonsFromRow(row) * packing) + getPromoUnitsFromRow(row);
}

function getActualAmountFromRow(row = {}) {
  return toNumber(row.actualAmount ?? row.lineAmount ?? row['Doanh số mỗi ngày'] ?? row['Doanh so moi ngay'] ?? row['Thành tiền thực tế'] ?? row['Thanh tien thuc te'] ?? row['Giá trị bán thực tế'] ?? row['Gia tri ban thuc te']);
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
  return cleanText(row.productCode || row.code || row['Mã hàng hóa'] || row['Ma hang hoa'] || row['Mã sản phẩm'] || row['Ma san pham'] || text(row, ['productCode', 'mã hàng hóa', 'ma hang hoa', 'mã sản phẩm', 'ma san pham', 'mã hàng', 'code']));
}

function getCustomerCodeFromRow(row = {}) {
  return cleanText(row.customerCode || row['Mã cửa hàng'] || row['Ma cua hang'] || row['Mã khách hàng'] || row['Ma khach hang'] || text(row, ['customerCode', 'mã cửa hàng', 'ma cua hang', 'mã khách hàng', 'ma khach hang', 'mã khách']));
}

function getCustomerNameFromRow(row = {}) {
  return cleanText(row.customerName || row['Tên cửa hàng'] || row['Ten cua hang'] || row['Tên khách hàng'] || row['Ten khach hang'] || row['Họ'] || row['Họ'] || row['Ho'] || text(row, ['customerName', 'tên cửa hàng', 'ten cua hang', 'tên khách hàng', 'ten khach hang', 'họ', 'ho']));
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
  return toNumber(row.salePrice ?? row.price ?? row['Giá bán'] ?? row['Gia ban'] ?? row['Đơn giá'] ?? row['Don gia'] ?? number(row, ['salePrice', 'giá bán', 'gia ban', 'đơn giá', 'don gia']));
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

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
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
  const now = nowIso();

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
  const now = nowIso();
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
    await bulkWriteInBatches(Inventory, ops);
    // Ghi song song collection inventories cũ để các màn/mobile bản cũ vẫn đọc được tồn.
    await bulkWriteInBatches(InventoryLegacy, ops);
  }
  return { transactionCount: movements.length, inventoryRows: ops.length };
}

async function setOpeningStockSnapshotsBulk(rows = []) {
  const ops = [];
  const now = nowIso();
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
    await bulkWriteInBatches(Inventory, ops);
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

  for (const row of rows) {
    const payload = pickCustomerPayload(row);
    if (!payload.code || !payload.name) {
      skipped += 1;
      errors.push({ code: payload.code, message: 'Thiếu mã hoặc tên khách hàng' });
      continue;
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
    const date = dateOnly(row.date || row.documentDate || row['Ngày'] || row['Ngay'] || today());
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
      createdAt: nowIso(),
      updatedAt: nowIso()
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
  const inventoryResult = await setOpeningStockSnapshotsBulk(snapshotRows);
  await addImportLog('openingStock', {
    imported,
    skipped,
    errors: errors.slice(0, 30),
    mode: 'setOpeningStockSnapshots',
    batchSize: IMPORT_BATCH_SIZE,
    stockTransactions: movements.length,
    inventoryRows: inventoryResult.inventoryRows
  });
  return { imported, skipped, errors };
}

async function importImportOrders(rows = []) {
  let skipped = 0;
  const errors = [];
  const productMap = await preloadProductsByCode(rows);
  const groups = groupRows(rows, (r) => `${cleanText(r.documentCode || r.code || r['Mã phiếu'] || r['Ma phieu']) || 'AUTO'}|${dateOnly(r.date || r['Ngày'] || r['Ngay'] || today())}|${cleanText(r.supplier || r.supplierName || r['Nhà cung cấp'] || r['Nha cung cap']) || 'Import Excel'}`);
  const autoCodes = await buildRunningCodes(ImportOrder, 'PN', groups.length);
  let autoIdx = 0;
  const docs = [];
  const movements = [];
  const inventoryDeltas = new Map();

  for (const group of groups) {
    const first = group[0] || {};
    const items = [];
    for (const row of group) {
      const productCode = getProductCodeFromRow(row);
      const product = productMap.get(cleanText(productCode));
      const quantity = getQtyFromRow(row);
      const costPrice = getCostFromRow(row);
      if (!product || quantity <= 0 || costPrice < 0) {
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
        amount: quantity * costPrice
      });
    }
    if (!items.length) continue;
    const now = nowIso();
    const doc = {
      id: makeId('IM'),
      code: cleanText(first.documentCode || first.code || first['Mã phiếu'] || first['Ma phieu']) || autoCodes[autoIdx++] || makeId('PN'),
      date: dateOnly(first.date || first['Ngày'] || first['Ngay'] || today()),
      supplier: cleanText(first.supplier || first.supplierName || first['Nhà cung cấp'] || first['Nha cung cap']) || 'Import Excel',
      supplierName: cleanText(first.supplier || first.supplierName || first['Nhà cung cấp'] || first['Nha cung cap']) || 'Import Excel',
      warehouseCode: cleanText(first.warehouseCode || first.warehouse || first['Kho']) || 'MAIN',
      warehouseName: cleanText(first.warehouseName || first['Tên kho'] || first['Ten kho']) || 'Kho chính',
      note: cleanText(first.note || first['Ghi chú'] || first['Ghi chu']) || 'Import Excel Mongo-native bulk',
      status: 'posted',
      items,
      totalQuantity: items.reduce((sum, item) => sum + toNumber(item.quantity), 0),
      totalAmount: items.reduce((sum, item) => sum + toNumber(item.amount), 0),
      createdAt: now,
      updatedAt: now
    };
    docs.push(doc);
    for (const item of items) {
      pushInventoryMovement({
        movements,
        inventoryDeltas,
        item,
        direction: 'IN',
        type: 'IMPORT',
        refType: 'IMPORT_ORDER',
        refId: doc.id,
        refCode: doc.code,
        date: doc.date,
        warehouseCode: doc.warehouseCode,
        warehouseName: doc.warehouseName,
        note: doc.note
      });
    }
  }

  const orderResult = await insertManyInBatches(ImportOrder, docs);
  const inventoryResult = await applyInventoryMovementsBulk(movements, inventoryDeltas);
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
    inventoryRows: inventoryResult.inventoryRows
  });
  return { imported, skipped, errors };
}

async function importSalesOrders(rows = []) {
  let skipped = 0;
  const errors = [];
  const customerMap = await preloadCustomersByCode(rows);
  const productMap = await preloadProductsByCode(rows);
  const warehouseCodes = Array.from(new Set(rows.map((r) => cleanText(r.warehouseCode || r.warehouse || r['Kho']) || 'MAIN')));
  const productCodes = Array.from(new Set(rows.map(getProductCodeFromRow).map(cleanText).filter(Boolean)));
  // Lấy tồn kho theo mã sản phẩm. Không khóa cứng warehouseCode ở bước import DMS,
  // vì tồn đầu/import cũ có thể lưu warehouseCode rỗng hoặc thiếu warehouseCode.
  // Nếu chỉ query MAIN thì màn Tồn kho thấy còn hàng nhưng import lại báo còn 0.
  const stockRows = await Inventory.find({
    productCode: { $in: productCodes }
  }).lean().catch(() => []);
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
  const groups = groupRows(rows, (r) => `${cleanText(r.documentCode || r.code || r['Số hóa đơn'] || r['So hoa don'] || r['Mã đơn'] || r['Ma don']) || 'AUTO'}|${getDateFromRow(r)}|${getCustomerCodeFromRow(r)}`);
  const autoOrderCodes = await buildRunningCodes(SalesOrder, 'BH', groups.length);
  let autoOrderIdx = 0;
  const orderDocs = [];
  // ERP/DMS chuẩn: import Excel DMS chỉ tạo đơn con chờ gộp/giao.
  // Không tạo Payment/Cashbook/AR ngay tại bước import, vì công nợ chỉ phát sinh khi giao hàng thành công.
  const paymentDocs = [];
  const cashbookDocs = [];
  const movements = [];
  const inventoryDeltas = new Map();

  for (const group of groups) {
    const first = group[0] || {};
    const customerCode = getCustomerCodeFromRow(first);
    const customer = customerMap.get(cleanText(customerCode));
    if (!customer) {
      skipped += group.length;
      errors.push({ customerCode, message: 'Không tìm thấy khách hàng' });
      continue;
    }

    const items = [];
    let groupInvalid = false;
    for (const row of group) {
      const productCode = getProductCodeFromRow(row);
      const product = productMap.get(cleanText(productCode));
      const quantity = getDmsQuantityFromRow(row, product);
      const promoQuantity = getDmsPromoQuantityFromRow(row, product);
      const deliveredQuantity = quantity + promoQuantity;
      const salePrice = getDmsPriceFromRow(row, quantity);
      const lineAmount = getDmsAmountFromRow(row, quantity, salePrice);
      const warehouseCode = cleanText(row.warehouseCode || row.warehouse || first.warehouseCode || first.warehouse || first['Kho']) || 'MAIN';
      const normalizedProductCode = cleanText(product?.code || productCode);
      const stockKey = `${normalizedProductCode}|${warehouseCode}`;
      const availableQty = stockMap.has(stockKey) ? stockMap.get(stockKey) : toNumber(productStockMap.get(normalizedProductCode));
      if (!product || quantity <= 0 || salePrice < 0 || availableQty < deliveredQuantity) {
        skipped += 1;
        groupInvalid = true;
        errors.push({ productCode, message: !product ? 'Không tìm thấy sản phẩm' : availableQty < deliveredQuantity ? `Không đủ tồn kho: còn ${availableQty}` : 'Dòng bán hàng không hợp lệ' });
        continue;
      }
      if (stockMap.has(stockKey)) stockMap.set(stockKey, availableQty - deliveredQuantity);
      productStockMap.set(normalizedProductCode, toNumber(productStockMap.get(normalizedProductCode)) - deliveredQuantity);
      const listPriceBeforeVat = getListPriceBeforeVatFromRow(row);
      items.push({
        productId: String(product.id || product._id || product.code),
        productCode: product.code,
        productName: product.name,
        unit: product.unit,
        packingQty: getPackingFromRow(row, product),
        cartons: getCartonsFromRow(row),
        units: getUnitsFromRow(row),
        quantity,
        promoCartons: getPromoCartonsFromRow(row),
        promoUnits: getPromoUnitsFromRow(row),
        promoQuantity,
        deliveredQuantity,
        stockQuantity: deliveredQuantity,
        soldQuantity: quantity,
        salePrice,
        price: salePrice,
        listPriceBeforeVat,
        listPriceAfterVat: listPriceBeforeVat ? listPriceBeforeVat * 1.08 : 0,
        gsvAmount: toNumber(row.gsvAmount ?? row['GSV bán ra'] ?? row['GSV ban ra']),
        nivAmount: toNumber(row.nivAmount ?? row['NIV bán ra'] ?? row['NIV ban ra']),
        vatAmount: getVatAmountFromRow(row),
        amount: lineAmount
      });
    }
    if (!items.length || groupInvalid) continue;

    const totalQuantity = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
    const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const paidAmount = Math.min(toNumber(first.paidAmount ?? first['Đã thu'] ?? first['Da thu']), totalAmount);
    const now = nowIso();
    const doc = {
      id: makeId('SO'),
      code: cleanText(first.documentCode || first.code || first['Số hóa đơn'] || first['So hoa don'] || first['Mã đơn'] || first['Ma don']) || autoOrderCodes[autoOrderIdx++] || makeId('BH'),
      date: getDateFromRow(first),
      orderDate: getDateFromRow(first),
      deliveryDate: getDateFromRow(first),
      customerId: String(customer.id || customer._id || customer.code),
      customerCode: customer.code,
      customerName: getCustomerNameFromRow(first) || customer.name,
      customerPhone: customer.phone || '',
      customerAddress: customer.address || '',
      staffCode: cleanText(first.staffCode || first['Mã nhân viên'] || first['Mã nhân viên'] || first['Ma nhan vien'] || first['Mã NVBH'] || first['Ma NVBH']),
      staffName: cleanText(first.staffName || first['Tên NVTT'] || first['Ten NVTT'] || first['Tên NVBH'] || first['Ten NVBH']),
      routeCode: getRouteCodeFromRow(first),
      note: cleanText(first.note || first['Ghi chú'] || first['Ghi chu']) || 'Import Excel DMS bulk',
      source: 'DMS',
      sourceType: 'dms_import',
      orderSource: 'DMS',
      orderSourceName: 'Từ DMS',
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
      warehouseCode: cleanText(first.warehouseCode || first.warehouse || first['Kho']) || 'MAIN',
      warehouseName: cleanText(first.warehouseName || first['Tên kho'] || first['Ten kho']) || 'Kho chính',
      createdAt: now,
      updatedAt: now
    };
    Object.assign(doc, applyOrderSourceFields(doc, ORDER_SOURCE.DMS));
    orderDocs.push(doc);
    for (const item of items) {
      pushInventoryMovement({
        movements,
        inventoryDeltas,
        item,
        direction: 'OUT',
        type: 'SALE',
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
  const paymentResult = { errors: [] };
  const cashResult = { errors: [] };
  const inventoryResult = await applyInventoryMovementsBulk(movements, inventoryDeltas);

  skipped += orderResult.errors.length + paymentResult.errors.length + cashResult.errors.length;
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
    stockTransactions: inventoryResult.transactionCount,
    inventoryRows: inventoryResult.inventoryRows
  });
  return { imported, skipped, errors };
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
    const now = nowIso();
    docs.push({
      id: makeId('PM'),
      date: dateOnly(row.date || today()),
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

  const result = await insertManyInBatches(Payment, docs);
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
    const now = nowIso();
    const code = cleanText(row.code || row.receiptCode || row['Mã phiếu'] || row['Ma phieu']) || receiptCodes[codeIdx++] || `TH${Date.now()}${codeIdx}`;
    const receipt = {
      id: makeId('RC'),
      code,
      date: dateOnly(row.date || today()),
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
    const now = nowIso();
    docs.push({
      id: makeId('CB'),
      code: cleanText(row.code || row['Mã phiếu'] || row['Ma phieu']) || (type === 'out' ? outCodes[outIdx++] : inCodes[inIdx++]),
      date: dateOnly(row.date || row['Ngày'] || row['Ngay'] || today()),
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
  return {
    rowNo,
    sourceRowNo: rowNo,
    raw: row
  };
}

async function getStockMapByProductCode(rows = []) {
  const codes = Array.from(new Set(rows.map(getProductCodeFromRow).map(cleanText).filter(Boolean)));
  const inventoryRows = codes.length ? await Inventory.find({ productCode: { $in: codes } }).lean() : [];
  const map = new Map();
  for (const row of inventoryRows) {
    const code = cleanText(row.productCode || row.productId);
    if (!code) continue;
    const qty = toNumber(row.availableQty ?? row.quantity ?? row.qty ?? row.onHand);
    map.set(code, toNumber(map.get(code)) + qty);
  }
  return map;
}


function getOrderDocumentCode(row = {}) {
  return cleanText(
    row.documentCode ||
    row.code ||
    row.orderCode ||
    row.invoiceCode ||
    row['Số hóa đơn'] ||
    row['So hoa don'] ||
    row['Mã đơn'] ||
    row['Ma don'] ||
    row['Mã phiếu'] ||
    row['Ma phieu']
  ) || 'AUTO';
}

function makeImportOrderGroupKey(row = {}) {
  return [
    getOrderDocumentCode(row),
    getDateFromRow(row),
    cleanText(row.supplier || row.supplierName || row['Nhà cung cấp'] || row['Nha cung cap']) || 'Import Excel'
  ].join('|');
}

function makeSalesOrderGroupKey(row = {}) {
  return [
    getOrderDocumentCode(row),
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
        result.push(raw);
      }
    } else {
      const raw = cloneRawRowForImport(row);
      if (!raw.__skipImportLine) result.push(raw);
    }
  }
  return result;
}

function applyAdjustedQuantityToRow(row = {}, allowedQuantity = 0, salePrice = 0) {
  const adjusted = { ...(row.raw || row) };
  adjusted.quantity = allowedQuantity;
  adjusted.qty = allowedQuantity;
  adjusted.stockQuantity = allowedQuantity;
  adjusted.deliveredQuantity = allowedQuantity;
  adjusted.soldQuantity = allowedQuantity;
  adjusted.cartons = 0;
  adjusted.units = allowedQuantity;
  adjusted.promoCartons = 0;
  adjusted.promoUnits = 0;
  adjusted.promoQuantity = 0;
  adjusted.actualAmount = allowedQuantity * salePrice;
  adjusted.amount = allowedQuantity * salePrice;
  adjusted.lineAmount = allowedQuantity * salePrice;
  adjusted.__autoCutByStock = true;
  if (allowedQuantity <= 0) adjusted.__skipImportLine = true;
  return adjusted;
}

function summarizeOrderShortages(shortages = []) {
  const totalMissingQty = shortages.reduce((sum, item) => sum + toNumber(item.missingQuantity), 0);
  const totalCutAmount = shortages.reduce((sum, item) => sum + toNumber(item.cutAmount), 0);
  return { totalMissingQty, totalCutAmount };
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
    const payloads = safeRows.map((row) => ({ ...rowBase(row), ...pickCustomerPayload(row), errors: [] }));
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
      const errors = [];
      const detailErrors = [];
      const lineDetails = [];
      let totalQuantity = 0;
      let totalAmount = 0;

      for (const row of group) {
        const productCode = getProductCodeFromRow(row);
        const product = productMap.get(cleanText(productCode));
        const quantity = getQtyFromRow(row);
        const costPrice = getCostFromRow(row);
        const amount = quantity * costPrice;
        const lineErrors = [];
        if (!productCode) lineErrors.push('Thiếu mã sản phẩm');
        if (!product) lineErrors.push('Không tìm thấy sản phẩm');
        if (quantity <= 0) lineErrors.push('Số lượng nhập phải lớn hơn 0');
        if (costPrice < 0) lineErrors.push('Giá nhập không được âm');
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
        documentCode: getOrderDocumentCode(first),
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
        const allowedQuantity = Math.max(0, Math.min(availableBefore, deliveredQuantity));
        const missingQuantity = Math.max(0, deliveredQuantity - availableBefore);
        const lineErrors = [];

        if (!productCode) lineErrors.push('Thiếu mã sản phẩm / mã hàng hóa');
        if (!product) lineErrors.push('Không tìm thấy sản phẩm');
        if (quantity <= 0) lineErrors.push('Số lượng bán phải lớn hơn 0');
        if (salePrice < 0) lineErrors.push('Giá bán không được âm');

        totalQuantity += Math.max(0, deliveredQuantity);
        totalAmount += Math.max(0, amount);

        if (product && missingQuantity > 0) {
          shortageReport.push({
            rowNo: row.__rowNo || row.rowNo || '',
            productCode: product.code,
            productName: product.name,
            requestedQuantity: deliveredQuantity,
            availableQuantity: availableBefore,
            importQuantity: allowedQuantity,
            missingQuantity,
            salePrice,
            cutAmount: missingQuantity * salePrice
          });
        }

        if (lineErrors.length) {
          detailErrors.push({ rowNo: row.__rowNo || row.rowNo || '', productCode, productName: product?.name || '', errors: lineErrors });
        }

        const adjustedRow = applyAdjustedQuantityToRow(row, allowedQuantity, salePrice);
        adjustedRows.push(adjustedRow);
        adjustedQuantity += allowedQuantity;
        adjustedAmount += allowedQuantity * salePrice;
        if (product) runningStockMap.set(normalizedProductCode, Math.max(0, availableBefore - deliveredQuantity));

        lineDetails.push({
          rowNo: row.__rowNo || row.rowNo || '',
          productCode,
          productName: product?.name || cleanText(row.productName || row['Tên sản phẩm'] || row['Ten san pham']),
          requestedQuantity: deliveredQuantity,
          availableQuantity: availableBefore,
          importQuantity: allowedQuantity,
          missingQuantity,
          salePrice,
          amount,
          adjustedAmount: allowedQuantity * salePrice,
          errors: lineErrors
        });
      }

      if (detailErrors.length) errors.push(`${detailErrors.length} dòng hàng lỗi`);
      const shortageSummary = summarizeOrderShortages(shortageReport);
      return {
        ...rowBase(first),
        previewMode: 'order',
        documentCode: getOrderDocumentCode(first),
        date: getDateFromRow(first),
        customerCode,
        customerName: getCustomerNameFromRow(first) || customer?.name || '',
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
        statusText: errors.length ? 'Có lỗi' : (shortageReport.length ? 'Vượt tồn' : 'Hợp lệ'),
        shortageReport,
        lineDetails,
        detailErrors,
        __importRows: group,
        __adjustedRows: adjustedRows,
        errors,
        valid: errors.length === 0
      };
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

async function preview({ type, buffer }) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (!buffer) return { error: 'Chưa chọn file Excel', status: 400 };
  const rows = parseExcelBuffer(buffer);
  if (!rows.length) return { error: 'File Excel không có dữ liệu', status: 400 };

  return previewMongoNative(type, rows);
}

async function commit({ type, rows, shortageMode = '' }) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (!Array.isArray(rows) || !rows.length) return { error: 'Chưa có dòng nào để import', status: 400 };
  const validRows = rows.filter((r) => r && r.valid !== false && (!Array.isArray(r.errors) || r.errors.length === 0));
  if (!validRows.length) return { error: 'Không có dòng hợp lệ để import', status: 400 };

  const hasShortage = validRows.some((r) => r && r.hasShortage);
  if (type === 'salesOrders' && hasShortage && shortageMode !== 'cut') {
    return {
      error: 'Có đơn vượt tồn. Vui lòng chọn Dừng hoặc Tiếp tục import theo tồn thực tế.',
      status: 409,
      hasShortage: true,
      shortageReport: validRows.flatMap((r) => r.shortageReport || [])
    };
  }

  const commitRows = type === 'salesOrders' && shortageMode === 'cut'
    ? flattenAdjustedCommitRows(validRows)
    : flattenCommitRows(validRows);

  let result;
  if (type === 'products') result = await upsertProducts(commitRows);
  else if (type === 'customers') result = await upsertCustomers(commitRows);
  else if (type === 'openingStock') result = await importOpeningStock(commitRows);
  else if (type === 'importOrders') result = await importImportOrders(commitRows);
  else if (type === 'salesOrders') result = await importSalesOrders(commitRows);
  else if (type === 'openingDebt') result = await importOpeningDebt(commitRows);
  else if (type === 'debtCollections') result = await importDebtCollections(commitRows);
  else if (type === 'cashbook') result = await importCashbook(commitRows);
  else return { error: 'Loại import không hợp lệ', status: 400 };

  const shortageRows = validRows.flatMap((r) => r.shortageReport || []);
  const shortageSummary = summarizeOrderShortages(shortageRows);
  return {
    source: 'mongo-native',
    ok: true,
    message: `Đã import Mongo-native ${result.imported || 0} dòng/chứng từ`,
    totalRows: rows.length,
    totalCommitRows: commitRows.length,
    hasShortage,
    shortageMode: hasShortage ? (shortageMode === 'cut' ? 'cut' : 'stop') : '',
    shortageReport: shortageRows,
    shortageSummary,
    ...result
  };
}

async function logs() {
  const logs = await ImportLog.find({}).sort({ createdAt: -1 }).limit(200).lean().catch(() => []);
  return logs;
}

module.exports = { preview, commit, logs };
