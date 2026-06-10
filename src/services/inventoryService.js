'use strict';

const dateUtil = require('../utils/date.util');
const InventorySnapshot = require('../models/Inventory');
const InventoryLegacy = require('../models/InventoryLegacy');
const Product = require('../models/Product');
const StockTransaction = require('../models/StockTransaction');
const stockTransactionRepository = require('../repositories/stockTransaction.repository');
const ImportOrder = require('../models/ImportOrder');
const SalesOrder = require('../models/SalesOrder');
const ReturnOrder = require('../models/ReturnOrder');
const { makeId, toNumber, normalizeText } = require('../utils/common.util');
const { STOCK_WAREHOUSE_CODE, STOCK_WAREHOUSE_NAME } = require('../constants/business.constants');
const inventoryStockService = require('./inventoryStock.service');
const eventLogService = require('./eventLogService');

async function recordInventoryEvent(eventType, entry = {}, options = {}) {
  return eventLogService.recordEvent({
    eventType,
    aggregateType: entry.refType || entry.sourceType || 'STOCK_TRANSACTION',
    aggregateId: entry.refId || entry.sourceId || entry.id,
    aggregateCode: entry.refCode || entry.sourceCode,
    source: 'inventoryService',
    sourceType: entry.type || entry.sourceType || 'stock_transaction',
    sourceId: entry.id,
    sourceCode: entry.idempotencyKey || entry.sourceCode,
    refType: entry.refType,
    refId: entry.refId,
    refCode: entry.refCode,
    payload: {
      productCode: entry.productCode,
      warehouseCode: entry.warehouseCode,
      direction: entry.direction,
      type: entry.type,
      quantity: entry.quantity,
      balanceQty: entry.balanceQty
    }
  }, options);
}

function dateOnly(value) { return dateUtil.toDateOnly(value || dateUtil.todayVN()); }
function isActive(row = {}) { return !['void', 'cancelled', 'canceled', 'deleted'].includes(String(row.status || '').toLowerCase()); }
function stockWarehouseCode() { return STOCK_WAREHOUSE_CODE || 'MAIN'; }
function stockWarehouseName() { return STOCK_WAREHOUSE_NAME || 'Kho chính'; }

function normalizeMovementDirection(value) {
  return String(value || '').trim().toUpperCase() === 'IN' ? 'IN' : 'OUT';
}

function normalizeStockSourceType(movement = {}) {
  return String(movement.sourceType || movement.refType || movement.type || '').trim().toUpperCase() || 'STOCK_MOVEMENT';
}

function buildStockMovementIdempotencyKey({ sourceType, sourceId, sourceCode, productCode, productId, warehouseCode, warehouseId, direction, type } = {}) {
  const sourceKey = String(sourceId || sourceCode || '').trim();
  const productKey = String(productCode || productId || '').trim();
  const warehouseKey = String(warehouseCode || warehouseId || stockWarehouseCode()).trim();
  const movementType = String(type || direction || '').trim().toUpperCase();
  return [
    String(sourceType || '').trim().toUpperCase(),
    sourceKey,
    productKey,
    warehouseKey,
    movementType
  ].join('|');
}

function isDuplicateKeyError(err) {
  return err && (err.code === 11000 || String(err.message || '').includes('E11000'));
}

function withOptionalSession(query, session) {
  return query && typeof query.session === 'function' ? query.session(session || null) : query;
}

async function findStockTransactionByIdempotencyKey(idempotencyKey, session = null) {
  if (!idempotencyKey) return null;
  const query = StockTransaction.findOne({ idempotencyKey });
  const withSession = withOptionalSession(query, session);
  return typeof withSession?.lean === 'function' ? withSession.lean() : withSession;
}

function getProductKey(item = {}) {
  return String(item.productCode || item.code || item.productId || item.id || '').trim();
}

function getQty(item = {}) {
  return toNumber(item.stockQuantity ?? item.deliveredQuantity ?? item.quantity ?? item.qty ?? item.totalQty ?? item.returnQuantity);
}

async function findProduct(item = {}) {
  const key = getProductKey(item);
  if (!key) return null;
  return Product.findOne({
    $or: [
      { code: key },
      { id: key },
      { _id: /^[a-f0-9]{24}$/i.test(key) ? key : undefined }
    ].filter((x) => Object.values(x)[0] !== undefined)
  });
}

async function getSnapshot(productLike = {}) {
  const productCode = String(productLike.productCode || productLike.code || productLike.productId || '').trim();
  const productId = String(productLike.productId || productLike.id || productCode || '').trim();
  if (!productCode && !productId) return null;
  const warehouseCode = stockWarehouseCode();
  return InventorySnapshot.findOne({
    $or: [
      productCode ? { productCode, warehouseCode } : null,
      productId ? { productId, warehouseCode } : null
    ].filter(Boolean)
  });
}

async function normalizeProductInventoryToMain({ productCode, productId } = {}) {
  const code = String(productCode || productId || '').trim();
  const id = String(productId || productCode || '').trim();
  const filters = [
    code ? { productCode: code } : null,
    id ? { productId: id } : null,
    code ? { code } : null,
    id ? { sku: id } : null
  ].filter(Boolean);
  if (!filters.length) return null;

  const rows = await InventoryLegacy.find({ $or: filters }).lean();
  if (!rows.length) return null;

  const whCode = stockWarehouseCode();
  const hasLegacyWarehouse = rows.some((row) => String(row.warehouseCode || '').trim() !== whCode);
  if (!hasLegacyWarehouse && rows.length === 1) return rows[0];

  const groupedQty = rows.reduce((sum, row) => {
    return sum + toNumber(row.onHand ?? row.quantity ?? row.qty ?? row.availableQty);
  }, 0);
  const reservedQty = rows.reduce((sum, row) => sum + toNumber(row.reservedQty ?? row.reserved ?? 0), 0);
  const baseRow = rows.find((row) => String(row.warehouseCode || '').trim() === whCode) || rows[0] || {};

  await InventorySnapshot.deleteMany({ $or: filters });
  const doc = {
    ...baseRow,
    _id: undefined,
    id: baseRow.id || makeId('IV'),
    productId: String(baseRow.productId || id || code).trim(),
    productCode: String(baseRow.productCode || code || id).trim(),
    warehouseId: whCode,
    warehouseCode: whCode,
    warehouseName: stockWarehouseName(),
    qty: groupedQty,
    quantity: groupedQty,
    onHand: groupedQty,
    reservedQty,
    availableQty: groupedQty - reservedQty,
    updatedAt: dateUtil.nowIso()
  };
  await InventorySnapshot.create(doc);
  return doc;
}


async function getLedgerBalance(productCode, productId, session = null) {
  const filters = [
    productCode ? { productCode: String(productCode).trim() } : null,
    productId ? { productId: String(productId).trim() } : null
  ].filter(Boolean);
  if (!filters.length) return 0;
  const query = StockTransaction.find({
    $or: filters,
    status: { $nin: ['void', 'cancelled', 'canceled', 'deleted'] }
  }).select('quantity qty').lean();
  const rows = await withOptionalSession(query, session);
  return (rows || []).reduce((sum, row) => sum + toNumber(row.quantity ?? row.qty), 0);
}

async function upsertInventorySnapshotCache({ productId, productCode, productName, warehouseId, warehouseCode, warehouseName, balanceQty, session = null } = {}) {
  const now = dateUtil.nowIso();
  const filter = { productCode, warehouseCode };
  const update = {
    $set: {
      productId: productId || productCode,
      productCode,
      productName: productName || '',
      warehouseId,
      warehouseCode,
      warehouseName,
      qty: balanceQty,
      quantity: balanceQty,
      onHand: balanceQty,
      availableQty: balanceQty,
      lastTransactionAt: now,
      updatedAt: now
    },
    $setOnInsert: { id: makeId('IV'), reservedQty: 0, createdAt: now }
  };
  const query = InventorySnapshot.updateOne(filter, update, { upsert: true });
  return withOptionalSession(query, session);
}

async function assertStockAvailableBeforeOut({ productCode, productId, productName, requiredQty = 0, session = null } = {}) {
  const code = String(productCode || productId || '').trim();
  const whCode = stockWarehouseCode();
  const required = Math.abs(toNumber(requiredQty));
  if (!code || required <= 0) return { ok: true, availableQty: 0, requiredQty: required };

  const stock = await inventoryStockService.getAvailableStock(productCode || productId);
  const available = toNumber(stock.availableQty);

  if (available < required) {
    const err = new Error(`Không đủ tồn kho: mã SP ${code}${productName ? ` - ${productName}` : ''}, tồn hiện tại ${available}, cần xuất ${required}`);
    err.code = 'INSUFFICIENT_STOCK';
    err.productCode = code;
    err.warehouseCode = whCode;
    err.availableQty = available;
    err.requiredQty = required;
    throw err;
  }
  return { ok: true, availableQty: available, requiredQty: required };
}

async function postStockMovement(document = {}, movement = {}, options = {}) {
  const items = Array.isArray(document.items) ? document.items : [];
  const session = options.session;
  // Tồn kho chỉ có 1 kho chính. HC/PC chỉ là nhóm in/gộp đơn, không ảnh hưởng tồn.
  const warehouseCode = stockWarehouseCode();
  const warehouseId = stockWarehouseCode();
  const warehouseName = stockWarehouseName();
  const direction = normalizeMovementDirection(movement.direction);
  const sign = direction === 'IN' ? 1 : -1;
  const type = String(movement.type || (direction === 'IN' ? 'IMPORT' : 'SALE')).trim().toUpperCase();
  const refType = normalizeStockSourceType({ ...movement, type });
  const refId = String(movement.refId || movement.sourceId || document.id || document._id || document.code || '').trim();
  const refCode = String(movement.refCode || movement.sourceCode || document.code || document.orderCode || document.id || '').trim();
  const txDate = dateOnly(movement.date || document.date || document.orderDate || document.documentDate || document.createdAt);
  const postedAt = dateUtil.nowIso();
  const transactions = [];

  for (const item of items) {
    const rawQty = getQty(item);
    if (!rawQty) continue;
    const product = await findProduct(item);
    const productCode = String(item.productCode || item.code || product?.code || item.productId || '').trim();
    const productId = String(item.productId || product?.id || product?._id || productCode).trim();
    if (!productCode && !productId) continue;
    const productName = String(item.productName || item.name || product?.name || '').trim();
    const absQty = Math.abs(rawQty);
    const movementQty = absQty * sign;
    const idempotencyKey = buildStockMovementIdempotencyKey({
      sourceType: refType,
      sourceId: refId,
      sourceCode: refCode,
      productCode,
      productId,
      warehouseCode,
      warehouseId,
      direction,
      type
    });

    const existingTx = await findStockTransactionByIdempotencyKey(idempotencyKey, session);
    if (existingTx) {
      transactions.push({
        ...existingTx,
        skipped: true,
        reason: 'DUPLICATE_STOCK_MOVEMENT'
      });
      continue;
    }

    const currentQty = await getLedgerBalance(productCode, productId, session);
    const nextQty = currentQty + movementQty;
    if (direction === 'OUT' && nextQty < 0) {
      await assertStockAvailableBeforeOut({
        productCode,
        productId,
        productName,
        requiredQty: absQty,
        session
      });
    }

    let tx;
    try {
      const createdDoc = await stockTransactionRepository.insertOnceByIdempotencyKey({
        id: makeId('ST'),
        idempotencyKey,
        sourceType: refType,
        sourceId: refId,
        sourceCode: refCode,
        date: txDate,
        productId,
        productCode,
        productName,
        warehouseId,
        warehouseCode,
        warehouseName,
        type,
        direction,
        quantity: movementQty,
        qty: movementQty,
        inQty: direction === 'IN' ? absQty : 0,
        outQty: direction === 'OUT' ? absQty : 0,
        balanceQty: nextQty,
        refType,
        refId,
        refCode,
        reversedFrom: movement.reversedFrom || movement.originalMovementId || '',
        note: movement.note || document.note || '',
        createdAt: postedAt,
        updatedAt: postedAt
      }, { session });
      tx = createdDoc;
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const duplicate = await findStockTransactionByIdempotencyKey(idempotencyKey, session);
      transactions.push({
        ...(duplicate || { idempotencyKey }),
        skipped: true,
        reason: 'DUPLICATE_STOCK_MOVEMENT'
      });
      continue;
    }

    await upsertInventorySnapshotCache({
      productId,
      productCode,
      productName,
      warehouseId,
      warehouseCode,
      warehouseName,
      balanceQty: nextQty,
      session
    });

    // Phase 3.4+: không ghi tồn ngược về products.
    // Products chỉ là danh mục; inventorySnapshots chỉ là cache đọc nhanh.
    // Nguồn sự thật của tồn kho là stockTransactions.
    await recordInventoryEvent('INVENTORY_LEDGER_POSTED', tx, options);
    transactions.push(tx);
  }
  return transactions;
}

async function reverseStockMovement(document = {}, movement = {}, options = {}) {
  const direction = movement.direction === 'IN' ? 'OUT' : 'IN';
  return postStockMovement(document, {
    ...movement,
    direction,
    type: movement.reverseType || `${movement.type || 'ADJUST'}_REVERSAL`,
    note: movement.note || `Đảo bút toán ${movement.type || ''}`.trim()
  }, options);
}

async function getCurrentStock(query = {}) {
  const filter = { status: { $nin: ['void', 'cancelled', 'canceled', 'deleted'] } };
  if (query.productCode) filter.productCode = query.productCode;
  const rows = await StockTransaction.find(filter).sort({ productCode: 1, date: 1, createdAt: 1 }).lean();
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.productCode || row.productId || '').trim();
    if (!key) continue;
    const qty = toNumber(row.quantity ?? row.qty);
    if (!grouped.has(key)) {
      grouped.set(key, {
        productId: row.productId || key,
        productCode: key,
        productName: row.productName || '',
        warehouseId: stockWarehouseCode(),
        warehouseCode: stockWarehouseCode(),
        warehouseName: stockWarehouseName(),
        qty: 0,
        quantity: 0,
        onHand: 0,
        availableQty: 0,
        inventorySource: 'stockTransactions',
        updatedAt: row.updatedAt || row.createdAt || ''
      });
    }
    const acc = grouped.get(key);
    acc.qty += qty;
    acc.quantity += qty;
    acc.onHand += qty;
    acc.availableQty += qty;
    if ((row.updatedAt || row.createdAt || '') > (acc.updatedAt || '')) {
      acc.updatedAt = row.updatedAt || row.createdAt || acc.updatedAt;
    }
  }
  return Array.from(grouped.values());
}

async function getStockTransactions(query = {}) {
  const filter = {};
  if (query.productCode) filter.productCode = query.productCode;
  // Không lọc theo HC/PC vì tồn kho là 1 kho chung MAIN.
  if (query.dateFrom || query.dateTo || query.date) {
    filter.date = {};
    if (query.dateFrom) filter.date.$gte = dateUtil.toDateOnly(query.dateFrom);
    if (query.dateTo) filter.date.$lte = dateUtil.toDateOnly(query.dateTo);
    if (query.date) filter.date = dateUtil.toDateOnly(query.date);
  }
  const q = normalizeText(query.q || query.search || query.keyword);
  let rows = await StockTransaction.find(filter).sort({ date: 1, createdAt: 1, productCode: 1 }).lean();
  if (q) rows = rows.filter((row) => [row.productCode, row.productName, row.refCode, row.refType, row.type].some((value) => normalizeText(value).includes(q)));
  return rows;
}


function productIdentityFromItem(item = {}, product = null) {
  const productCode = String(item.productCode || item.code || item.sku || product?.code || item.productId || '').trim();
  const productId = String(item.productId || product?.id || product?._id || productCode).trim();
  const productName = String(item.productName || item.name || product?.name || '').trim();
  return { productId, productCode, productName };
}

async function resolveProductForItem(item = {}) {
  const key = getProductKey(item);
  if (!key) return null;
  return Product.findOne({
    $or: [
      { code: key },
      { sku: key },
      { productCode: key },
      { id: key },
      ...(key.match(/^[a-f0-9]{24}$/i) ? [{ _id: key }] : [])
    ]
  }).lean();
}

function makeStockTx({ date, productId, productCode, productName, quantity, type, direction, refType, refId, refCode, note = '' }) {
  const qty = toNumber(quantity);
  const normalizedDirection = normalizeMovementDirection(direction || (qty >= 0 ? 'IN' : 'OUT'));
  const normalizedType = String(type || normalizedDirection).trim().toUpperCase();
  const normalizedRefType = normalizeStockSourceType({ refType, type: normalizedType });
  const idempotencyKey = buildStockMovementIdempotencyKey({
    sourceType: normalizedRefType,
    sourceId: refId,
    sourceCode: refCode,
    productCode,
    productId,
    warehouseCode: stockWarehouseCode(),
    warehouseId: stockWarehouseCode(),
    direction: normalizedDirection,
    type: normalizedType
  });
  return {
    id: makeId('ST'),
    idempotencyKey,
    sourceType: normalizedRefType,
    sourceId: String(refId || '').trim(),
    sourceCode: String(refCode || refId || '').trim(),
    date: dateOnly(date),
    productId: String(productId || productCode || '').trim(),
    productCode: String(productCode || productId || '').trim(),
    productName: String(productName || '').trim(),
    warehouseId: stockWarehouseCode(),
    warehouseCode: stockWarehouseCode(),
    warehouseName: stockWarehouseName(),
    type: normalizedType,
    direction: normalizedDirection,
    quantity: qty,
    qty,
    inQty: normalizedDirection === 'IN' ? Math.abs(qty) : 0,
    outQty: normalizedDirection === 'OUT' ? Math.abs(qty) : 0,
    balanceQty: 0,
    refType: normalizedRefType,
    refId: String(refId || '').trim(),
    refCode: String(refCode || refId || '').trim(),
    note,
    createdAt: dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
}

async function rebuildSnapshotsFromTransactions() {
  await InventorySnapshot.deleteMany({});
  const rows = await StockTransaction.find({}).sort({ date: 1, createdAt: 1, productCode: 1 }).lean();
  const balances = new Map();
  const lastTxAt = new Map();

  for (const row of rows) {
    const productCode = String(row.productCode || row.productId || '').trim();
    if (!productCode) continue;
    const key = productCode;
    balances.set(key, toNumber(balances.get(key)) + toNumber(row.quantity ?? row.qty));
    lastTxAt.set(key, row.updatedAt || row.createdAt || dateUtil.nowIso());
  }

  const docs = [];
  for (const [productCode, qty] of balances.entries()) {
    const product = await Product.findOne({
      $or: [
        { code: productCode },
        { sku: productCode },
        { productCode },
        { id: productCode }
      ]
    }).lean();
    const productId = String(product?.id || product?._id || productCode).trim();
    docs.push({
      id: makeId('IV'),
      productId,
      productCode,
      productName: String(product?.name || '').trim(),
      warehouseId: stockWarehouseCode(),
      warehouseCode: stockWarehouseCode(),
      warehouseName: stockWarehouseName(),
      qty,
      quantity: qty,
      onHand: qty,
      reservedQty: 0,
      availableQty: qty,
      lastTransactionAt: lastTxAt.get(productCode) || dateUtil.nowIso(),
      updatedAt: dateUtil.nowIso()
    });
  }

  if (docs.length) await InventorySnapshot.insertMany(docs, { ordered: false });
  return getCurrentStock();
}

async function buildTransactionsFromDocuments() {
  const transactions = [];
  const products = await Product.find({ isActive: { $ne: false } }).lean();

  for (const product of products) {
    // Chỉ dùng các field tồn legacy để tạo bút toán OPENING khi migrate/rebuild.
    // Sau rebuild, các field này sẽ bị unset khỏi products.
    const openingQty = toNumber(product.openingStock ?? product.availableStock ?? product.stockQuantity ?? product.availableQty ?? product.stock ?? product.quantity ?? product.qty ?? product.tonKho ?? product.tonDau);
    if (openingQty <= 0) continue;
    const productCode = String(product.code || product.sku || product.productCode || product.id || product._id || '').trim();
    if (!productCode) continue;
    transactions.push(makeStockTx({
      date: product.createdAt || '2000-01-01',
      productId: product.id || product._id || productCode,
      productCode,
      productName: product.name || product.productName || '',
      quantity: openingQty,
      type: 'OPENING',
      direction: 'IN',
      refType: 'PRODUCT_OPENING_STOCK',
      refId: product.id || product._id || productCode,
      refCode: productCode,
      note: 'Migrate tồn legacy từ products sang stockTransactions'
    }));
  }

  const imports = await ImportOrder.find({}).lean();
  for (const doc of imports.filter(isActive)) {
    const items = Array.isArray(doc.items) ? doc.items : [];
    for (const item of items) {
      const qty = Math.abs(getQty(item));
      if (qty <= 0) continue;
      const product = await resolveProductForItem(item);
      const { productId, productCode, productName } = productIdentityFromItem(item, product);
      if (!productCode) continue;
      transactions.push(makeStockTx({
        date: doc.date || doc.importDate || doc.createdAt,
        productId,
        productCode,
        productName,
        quantity: qty,
        type: 'IMPORT',
        direction: 'IN',
        refType: 'IMPORT_ORDER',
        refId: doc.id || doc._id || doc.code,
        refCode: doc.code || doc.id,
        note: 'Rebuild từ phiếu nhập'
      }));
    }
  }

  const sales = await SalesOrder.find({}).lean();
  for (const doc of sales.filter(isActive)) {
    const items = Array.isArray(doc.items) ? doc.items : [];
    for (const item of items) {
      const qty = Math.abs(getQty(item));
      if (qty <= 0) continue;
      const product = await resolveProductForItem(item);
      const { productId, productCode, productName } = productIdentityFromItem(item, product);
      if (!productCode) continue;
      transactions.push(makeStockTx({
        date: doc.date || doc.orderDate || doc.createdAt,
        productId,
        productCode,
        productName,
        quantity: -qty,
        type: 'SALE',
        direction: 'OUT',
        refType: doc.source === 'mobile_sales_app' ? 'MOBILE_SALES_ORDER' : 'SALES_ORDER',
        refId: doc.id || doc._id || doc.code,
        refCode: doc.code || doc.id,
        note: 'Rebuild từ đơn bán'
      }));
    }
  }

  const returns = await ReturnOrder.find({}).lean();
  for (const doc of returns.filter(isActive)) {
    const items = Array.isArray(doc.items) ? doc.items : [];
    for (const item of items) {
      const qty = Math.abs(getQty(item));
      if (qty <= 0) continue;
      const product = await resolveProductForItem(item);
      const { productId, productCode, productName } = productIdentityFromItem(item, product);
      if (!productCode) continue;
      transactions.push(makeStockTx({
        date: doc.date || doc.returnDate || doc.createdAt,
        productId,
        productCode,
        productName,
        quantity: qty,
        type: 'RETURN',
        direction: 'IN',
        refType: 'RETURN_ORDER',
        refId: doc.id || doc._id || doc.code,
        refCode: doc.code || doc.id,
        note: 'Rebuild từ phiếu trả hàng'
      }));
    }
  }

  return transactions;
}

async function rebuildStockLedgerFromDocuments(options = {}) {
  const resetTransactions = options.resetTransactions !== false;
  if (resetTransactions) await StockTransaction.deleteMany({});
  const beforeTxCount = await StockTransaction.countDocuments({});
  let createdTransactions = 0;

  if (resetTransactions || beforeTxCount === 0) {
    const transactions = await buildTransactionsFromDocuments();
    if (transactions.length) {
      await stockTransactionRepository.insertMany(transactions, { ordered: false });
      createdTransactions = transactions.length;
    }
  }

  const stock = await rebuildSnapshotsFromTransactions();

  // Phase 3.4: sau khi đã chuyển tồn legacy thành OPENING transaction,
  // xóa tồn khỏi products để products chỉ còn là danh mục.
  await Product.updateMany({}, {
    $unset: {
      openingStock: 1,
      availableStock: 1,
      stockQuantity: 1,
      availableQty: 1,
      stock: 1,
      quantity: 1,
      qty: 1,
      tonKho: 1,
      tonDau: 1
    }
  });

  return {
    resetTransactions,
    transactionCount: await StockTransaction.countDocuments({}),
    createdTransactions,
    inventoryRows: stock.length,
    totalAvailableQty: stock.reduce((sum, row) => sum + toNumber(row.availableQty ?? row.quantity ?? row.qty), 0)
  };
}

async function normalizeOneWarehouse() {
  const rows = await InventorySnapshot.find({}).lean();
  const grouped = new Map();
  for (const row of rows) {
    const productCode = String(row.productCode || row.productId || '').trim();
    if (!productCode) continue;
    const qty = toNumber(row.onHand ?? row.quantity ?? row.qty ?? row.availableQty);
    if (!grouped.has(productCode)) grouped.set(productCode, { row, qty: 0 });
    grouped.get(productCode).qty += qty;
  }

  await InventorySnapshot.deleteMany({});
  const docs = [];
  for (const [productCode, value] of grouped.entries()) {
    const row = value.row || {};
    const qty = value.qty;
    docs.push({
      ...row,
      _id: undefined,
      id: row.id || makeId('IV'),
      productCode,
      warehouseId: stockWarehouseCode(),
      warehouseCode: stockWarehouseCode(),
      warehouseName: stockWarehouseName(),
      qty,
      quantity: qty,
      onHand: qty,
      availableQty: qty - toNumber(row.reservedQty),
      updatedAt: dateUtil.nowIso()
    });
  }
  if (docs.length) await InventorySnapshot.insertMany(docs, { ordered: false });
  await stockTransactionRepository.updateMany({}, {
    $set: {
      warehouseId: stockWarehouseCode(),
      warehouseCode: stockWarehouseCode(),
      warehouseName: stockWarehouseName(),
      updatedAt: dateUtil.nowIso()
    }
  });
  return {
    normalized: true,
    inventoryRows: docs.length,
    transactionRows: await StockTransaction.countDocuments({})
  };
}


module.exports = {
  postStockMovement,
  assertStockAvailableBeforeOut,
  reverseStockMovement,
  getCurrentStock,
  getStockTransactions,
  rebuildSnapshotsFromTransactions,
  rebuildStockLedgerFromDocuments,
  normalizeOneWarehouse,
  normalizeProductInventoryToMain,
  buildStockMovementIdempotencyKey,
  isActive
};
