'use strict';

const { parseExcelBuffer } = require('../../utils/excelParser');
const { previewImport } = require('../../services/importService');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const ImportOrder = require('../models/ImportOrder');
const SalesOrder = require('../models/SalesOrder');
const StockTransaction = require('../models/StockTransaction');
const Inventory = require('../models/Inventory');
const Receipt = require('../models/Receipt');
const Cashbook = require('../models/Cashbook');
const Payment = require('../models/Payment');
const ImportLog = require('../models/ImportLog');
const systemService = require('./systemService');
const inventoryService = require('./inventoryService');
const { toNumber, makeId, normalizeText, normalizePacking } = require('../utils/common.util');

function cleanText(value) {
  return String(value ?? '').trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function dateOnly(value) {
  return String(value || today()).slice(0, 10);
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

function pickProductPayload(row = {}) {
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

function getProductCodeFromRow(row = {}) {
  return cleanText(row.productCode || row.code || row['Mã sản phẩm'] || row['Ma san pham'] || text(row, ['productCode', 'mã sản phẩm', 'ma san pham', 'mã hàng', 'code']));
}

function getCustomerCodeFromRow(row = {}) {
  return cleanText(row.customerCode || row['Mã khách hàng'] || row['Ma khach hang'] || text(row, ['customerCode', 'mã khách hàng', 'ma khach hang', 'mã khách']));
}

function getQtyFromRow(row = {}) {
  return toNumber(row.quantity ?? row.qty ?? row['Số lượng'] ?? row['So luong'] ?? row.sl ?? number(row, ['quantity', 'qty', 'số lượng', 'so luong', 'sl']));
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
  for (const row of rows) {
    const productCode = getProductCodeFromRow(row);
    const quantity = getQtyFromRow(row);
    const product = productMap.get(cleanText(productCode)) || await findProductByAny(productCode);
    if (!product || quantity < 0) {
      skipped += 1;
      errors.push({ productCode, message: !product ? 'Không tìm thấy sản phẩm' : 'Tồn đầu không được âm' });
      continue;
    }
    const date = dateOnly(row.date || row.documentDate || row['Ngày'] || row['Ngay'] || today());
    const doc = {
      id: makeId('OS'),
      code: cleanText(row.documentCode || row.code || row['Mã phiếu'] || row['Ma phieu']) || await buildRunningCode(StockTransaction, 'TD'),
      date,
      items: [{
        productId: String(product.id || product._id || product.code),
        productCode: product.code,
        productName: product.name,
        unit: product.unit,
        quantity
      }],
      warehouseCode: cleanText(row.warehouseCode || row.warehouse || row['Kho']) || 'MAIN',
      warehouseName: cleanText(row.warehouseName || row['Tên kho'] || row['Ten kho']) || 'Kho chính',
      note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']) || 'Import tồn đầu Excel'
    };
    await inventoryService.postStockMovement(doc, {
      direction: 'IN',
      type: 'OPENING',
      refType: 'OPENING_STOCK_IMPORT',
      refId: doc.id,
      refCode: doc.code,
      date: doc.date,
      note: doc.note
    });
    imported += 1;
  }
  await addImportLog('openingStock', { imported, skipped, errors: errors.slice(0, 30) });
  return { imported, skipped, errors };
}

async function importImportOrders(rows = []) {
  let imported = 0;
  let skipped = 0;
  const errors = [];
  const productMap = await preloadProductsByCode(rows);
  const groups = groupRows(rows, (r) => `${cleanText(r.documentCode || r.code || r['Mã phiếu'] || r['Ma phieu']) || 'AUTO'}|${dateOnly(r.date || r['Ngày'] || r['Ngay'] || today())}|${cleanText(r.supplier || r.supplierName || r['Nhà cung cấp'] || r['Nha cung cap']) || 'Import Excel'}`);

  for (const group of groups) {
    const first = group[0] || {};
    const items = [];
    for (const row of group) {
      const productCode = getProductCodeFromRow(row);
      const product = productMap.get(cleanText(productCode)) || await findProductByAny(productCode);
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
      code: cleanText(first.documentCode || first.code || first['Mã phiếu'] || first['Ma phieu']) || await buildRunningCode(ImportOrder, 'PN'),
      date: dateOnly(first.date || first['Ngày'] || first['Ngay'] || today()),
      supplier: cleanText(first.supplier || first.supplierName || first['Nhà cung cấp'] || first['Nha cung cap']) || 'Import Excel',
      supplierName: cleanText(first.supplier || first.supplierName || first['Nhà cung cấp'] || first['Nha cung cap']) || 'Import Excel',
      warehouseCode: cleanText(first.warehouseCode || first.warehouse || first['Kho']) || 'MAIN',
      warehouseName: cleanText(first.warehouseName || first['Tên kho'] || first['Ten kho']) || 'Kho chính',
      note: cleanText(first.note || first['Ghi chú'] || first['Ghi chu']) || 'Import Excel Mongo-native',
      status: 'posted',
      items,
      totalQuantity: items.reduce((s, i) => s + toNumber(i.quantity), 0),
      totalAmount: items.reduce((s, i) => s + toNumber(i.amount), 0),
      createdAt: now,
      updatedAt: now
    };
    await ImportOrder.create(doc);
    await inventoryService.postStockMovement(doc, {
      direction: 'IN',
      type: 'IMPORT',
      refType: 'IMPORT_ORDER',
      refId: doc.id,
      refCode: doc.code,
      date: doc.date,
      note: doc.note
    });
    imported += 1;
  }
  await addImportLog('importOrders', { imported, skipped, errors: errors.slice(0, 30) });
  return { imported, skipped, errors };
}

async function importSalesOrders(rows = []) {
  let imported = 0;
  let skipped = 0;
  const errors = [];
  const customerMap = await preloadCustomersByCode(rows);
  const productMap = await preloadProductsByCode(rows);
  const warehouseCodes = Array.from(new Set(rows.map((r) => cleanText(r.warehouseCode || r.warehouse || r['Kho']) || 'MAIN')));
  const stockRows = await Inventory.find({
    productCode: { $in: Array.from(new Set(rows.map(getProductCodeFromRow).filter(Boolean))) },
    warehouseCode: { $in: warehouseCodes }
  }).lean().catch(() => []);
  const stockMap = new Map(stockRows.map((stock) => [`${cleanText(stock.productCode)}|${cleanText(stock.warehouseCode || 'MAIN')}`, stock]));
  const groups = groupRows(rows, (r) => `${cleanText(r.documentCode || r.code || r['Mã đơn'] || r['Ma don']) || 'AUTO'}|${dateOnly(r.date || r['Ngày'] || r['Ngay'] || today())}|${getCustomerCodeFromRow(r)}`);

  for (const group of groups) {
    const first = group[0] || {};
    const customerCode = getCustomerCodeFromRow(first);
    const customer = customerMap.get(cleanText(customerCode)) || await findCustomerByAny(customerCode);
    if (!customer) {
      skipped += group.length;
      errors.push({ customerCode, message: 'Không tìm thấy khách hàng' });
      continue;
    }
    const items = [];
    let groupInvalid = false;
    for (const row of group) {
      const productCode = getProductCodeFromRow(row);
      const product = productMap.get(cleanText(productCode)) || await findProductByAny(productCode);
      const quantity = getQtyFromRow(row);
      const salePrice = getSalePriceFromRow(row);
      const warehouseCode = cleanText(row.warehouseCode || row.warehouse || first.warehouseCode || first.warehouse) || 'MAIN';
      const stock = product ? stockMap.get(`${cleanText(product.code)}|${warehouseCode}`) : null;
      const availableQty = toNumber(stock?.availableQty ?? stock?.quantity ?? stock?.qty ?? stock?.onHand);
      if (!product || quantity <= 0 || salePrice < 0 || availableQty < quantity) {
        skipped += 1;
        groupInvalid = true;
        errors.push({ productCode, message: !product ? 'Không tìm thấy sản phẩm' : availableQty < quantity ? `Không đủ tồn kho: còn ${availableQty}` : 'Dòng bán hàng không hợp lệ' });
        continue;
      }
      items.push({
        productId: String(product.id || product._id || product.code),
        productCode: product.code,
        productName: product.name,
        unit: product.unit,
        quantity,
        salePrice,
        price: salePrice,
        amount: quantity * salePrice
      });
    }
    if (!items.length || groupInvalid) continue;
    const totalQuantity = items.reduce((s, i) => s + toNumber(i.quantity), 0);
    const totalAmount = items.reduce((s, i) => s + toNumber(i.amount), 0);
    const paidAmount = Math.min(toNumber(first.paidAmount ?? first['Đã thu'] ?? first['Da thu']), totalAmount);
    const now = nowIso();
    const doc = {
      id: makeId('SO'),
      code: cleanText(first.documentCode || first.code || first['Mã đơn'] || first['Ma don']) || await buildRunningCode(SalesOrder, 'BH'),
      date: dateOnly(first.date || first['Ngày'] || first['Ngay'] || today()),
      orderDate: dateOnly(first.date || first['Ngày'] || first['Ngay'] || today()),
      customerId: String(customer.id || customer._id || customer.code),
      customerCode: customer.code,
      customerName: customer.name,
      customerPhone: customer.phone || '',
      customerAddress: customer.address || '',
      staffCode: cleanText(first.staffCode || first['Mã NVBH'] || first['Ma NVBH']),
      staffName: cleanText(first.staffName || first['Tên NVBH'] || first['Ten NVBH']),
      note: cleanText(first.note || first['Ghi chú'] || first['Ghi chu']) || 'Import Excel Mongo-native',
      source: 'excel_import',
      orderSource: 'excel_import',
      isChildOrder: true,
      masterOrderId: '',
      masterOrderCode: '',
      mergeStatus: 'unmerged',
      deliveryStatus: 'unassigned',
      items,
      totalQuantity,
      totalAmount,
      paidAmount,
      debtAmount: totalAmount - paidAmount,
      status: 'posted',
      warehouseCode: cleanText(first.warehouseCode || first.warehouse || first['Kho']) || 'MAIN',
      warehouseName: cleanText(first.warehouseName || first['Tên kho'] || first['Ten kho']) || 'Kho chính',
      createdAt: now,
      updatedAt: now
    };
    await SalesOrder.create(doc);
    await inventoryService.postStockMovement(doc, {
      direction: 'OUT',
      type: 'SALE',
      refType: 'SALES_ORDER',
      refId: doc.id,
      refCode: doc.code,
      date: doc.date,
      note: doc.note
    });
    await Payment.create({
      id: makeId('PM'),
      date: doc.date,
      type: 'sale_debt',
      refType: 'salesOrder',
      refId: doc.id,
      refCode: doc.code,
      customerId: doc.customerId,
      customerCode: doc.customerCode,
      customerName: doc.customerName,
      debit: totalAmount,
      credit: paidAmount,
      amount: totalAmount,
      note: `Import Excel từ đơn bán ${doc.code}`,
      status: 'posted',
      createdAt: now,
      updatedAt: now
    });
    if (paidAmount > 0) {
      const cash = {
        id: makeId('CB'),
        code: await buildRunningCode(Cashbook, 'PT'),
        date: doc.date,
        type: 'in',
        source: 'sales_payment_import',
        refType: 'salesOrder',
        refId: doc.id,
        refCode: doc.code,
        customerId: doc.customerId,
        customerCode: doc.customerCode,
        customerName: doc.customerName,
        amount: paidAmount,
        note: `Thu tiền import từ đơn bán ${doc.code}`,
        status: 'posted',
        createdAt: now,
        updatedAt: now
      };
      await Cashbook.create(cash);
    }
    imported += 1;
  }
  await addImportLog('salesOrders', { imported, skipped, errors: errors.slice(0, 30) });
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
  const paymentResult = await insertManyInBatches(Payment, paymentDocs);
  const cashResult = await insertManyInBatches(Cashbook, cashbookDocs);
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

async function preview({ type, buffer }) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (!buffer) return { error: 'Chưa chọn file Excel', status: 400 };
  const rows = parseExcelBuffer(buffer);
  if (!rows.length) return { error: 'File Excel không có dữ liệu', status: 400 };

  // Preview vẫn dùng bộ kiểm tra cũ để giữ tương thích UI, nhưng commit bên dưới đã Mongo-native.
  const data = await systemService.getDataSnapshot();
  return previewImport(type, rows, data);
}

async function commit({ type, rows }) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (!Array.isArray(rows) || !rows.length) return { error: 'Chưa có dòng nào để import', status: 400 };
  const validRows = rows.filter((r) => r && r.valid !== false && (!Array.isArray(r.errors) || r.errors.length === 0));
  if (!validRows.length) return { error: 'Không có dòng hợp lệ để import', status: 400 };

  let result;
  if (type === 'products') result = await upsertProducts(validRows);
  else if (type === 'customers') result = await upsertCustomers(validRows);
  else if (type === 'openingStock') result = await importOpeningStock(validRows);
  else if (type === 'importOrders') result = await importImportOrders(validRows);
  else if (type === 'salesOrders') result = await importSalesOrders(validRows);
  else if (type === 'openingDebt') result = await importOpeningDebt(validRows);
  else if (type === 'debtCollections') result = await importDebtCollections(validRows);
  else if (type === 'cashbook') result = await importCashbook(validRows);
  else return { error: 'Loại import không hợp lệ', status: 400 };

  return {
    source: 'mongo-native',
    ok: true,
    message: `Đã import Mongo-native ${result.imported || 0} dòng/chứng từ`,
    totalRows: rows.length,
    ...result
  };
}

async function logs() {
  const logs = await ImportLog.find({}).sort({ createdAt: -1 }).limit(200).lean().catch(() => []);
  return logs;
}

module.exports = { preview, commit, logs };
