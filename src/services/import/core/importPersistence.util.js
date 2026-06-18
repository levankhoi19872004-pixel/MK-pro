'use strict';

const { normalizeSearchText } = require('../../../utils/search.util');
const dateUtil = require('../../../utils/date.util');
const Product = require('../../../models/Product');
const Customer = require('../../../models/Customer');
const StockTransaction = require('../../../models/StockTransaction');
const InventoryLegacy = require('../../../models/InventoryLegacy');
const inventoryStockService = require('../../inventoryStock.service');
const { toNumber, makeId, normalizeText, normalizePacking } = require('../../../utils/common.util');
const { STOCK_WAREHOUSE_CODE, STOCK_WAREHOUSE_NAME } = require('../../../constants/business.constants');
const IMPORT_BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE || 1000);
const AUTO_CREATED_CUSTOMER_ADDRESS = 'NEW';

const {
  cleanText,
  dateOnly,
  getCustomerCodeFromRow,
  getCustomerNameFromRow
} = require('./importValue.util');

function groupRows(rows = [], keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return Array.from(map.values());
}

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

module.exports = {
  groupRows,
  chunkArray,
  bulkWriteInBatches,
  insertManyInBatches,
  buildRunningCodes,
  preloadProductsByCode,
  preloadCustomersByCode,
  collectImportedCustomerCandidates,
  buildImportedCustomerPlaceholder,
  importedCustomerCandidateError,
  ensureImportedCustomersForOrderChunk,
  pushInventoryMovement,
  applyInventoryMovementsBulk,
  setOpeningStockInventoriesBulk
};