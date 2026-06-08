'use strict';

const dateUtil = require('../utils/date.util');
const InventoryLegacy = require('../models/InventoryLegacy');
const Product = require('../models/Product');
const StockTransaction = require('../models/StockTransaction');
const ImportOrder = require('../models/ImportOrder');
const SalesOrder = require('../models/SalesOrder');
const ReturnOrder = require('../models/ReturnOrder');
const { makeId, toNumber, normalizeText } = require('../utils/common.util');
const { STOCK_WAREHOUSE_CODE, STOCK_WAREHOUSE_NAME } = require('../constants/business.constants');

function dateOnly(value) { return dateUtil.toDateOnly(value || dateUtil.todayVN()); }
function isActive(row = {}) { return !['void', 'cancelled', 'canceled', 'deleted'].includes(String(row.status || '').toLowerCase()); }
function stockWarehouseCode() { return STOCK_WAREHOUSE_CODE || 'MAIN'; }
function stockWarehouseName() { return STOCK_WAREHOUSE_NAME || 'Kho chính'; }

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
  return InventoryLegacy.findOne({
    $or: [
      productCode ? { productCode, warehouseCode } : null,
      productId ? { productId, warehouseCode } : null
    ].filter(Boolean)
  });
}

async function assertStockAvailableBeforeOut({ productCode, productId, productName, requiredQty = 0, session = null } = {}) {
  const code = String(productCode || productId || '').trim();
  const whCode = stockWarehouseCode();
  const required = Math.abs(toNumber(requiredQty));
  if (!code || required <= 0) return { ok: true, availableQty: 0, requiredQty: required };

  const query = {
    $or: [
      productCode ? { productCode: String(productCode).trim(), warehouseCode: whCode } : null,
      productId ? { productId: String(productId).trim(), warehouseCode: whCode } : null
    ].filter(Boolean)
  };
  const snapshotQuery = InventoryLegacy.findOne(query);
  const snapshot = session ? await snapshotQuery.session(session) : await snapshotQuery;
  const available = toNumber(snapshot?.availableQty ?? snapshot?.quantity ?? snapshot?.qty ?? snapshot?.onHand);
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
  const direction = movement.direction === 'IN' ? 'IN' : 'OUT';
  const sign = direction === 'IN' ? 1 : -1;
  const type = movement.type || (direction === 'IN' ? 'IMPORT' : 'SALE');
  const refType = movement.refType || type;
  const refId = String(movement.refId || document.id || document._id || document.code || '').trim();
  const refCode = String(movement.refCode || document.code || document.orderCode || document.id || '').trim();
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
    const movementQty = Math.abs(rawQty) * sign;

    let snapshot = await InventoryLegacy.findOne({ productCode, warehouseCode }).session(session || null);
    if (!snapshot) {
      snapshot = new InventoryLegacy({
        id: makeId('IV'),
        productId,
        productCode,
        productName,
        warehouseId,
        warehouseCode,
        warehouseName,
        qty: 0,
        quantity: 0,
        onHand: 0,
        reservedQty: 0,
        availableQty: 0,
        updatedAt: postedAt
      });
    }

    const currentQty = toNumber(snapshot.quantity ?? snapshot.qty ?? snapshot.onHand ?? snapshot.availableQty);
    const nextQty = currentQty + movementQty;
    if (direction === 'OUT' && nextQty < 0) {
      await assertStockAvailableBeforeOut({
        productCode,
        productId,
        productName,
        requiredQty: Math.abs(rawQty),
        session
      });
    }
    snapshot.productId = snapshot.productId || productId;
    snapshot.productCode = snapshot.productCode || productCode;
    snapshot.productName = productName || snapshot.productName || '';
    snapshot.warehouseId = snapshot.warehouseId || warehouseId;
    snapshot.warehouseCode = snapshot.warehouseCode || warehouseCode;
    snapshot.warehouseName = snapshot.warehouseName || warehouseName;
    snapshot.qty = nextQty;
    snapshot.quantity = nextQty;
    snapshot.onHand = nextQty;
    snapshot.availableQty = nextQty - toNumber(snapshot.reservedQty);
    snapshot.lastTransactionAt = postedAt;
    snapshot.updatedAt = postedAt;
    await snapshot.save({ session });

    // Phase 3.4: không ghi tồn ngược về products.
    // Products chỉ là danh mục; tồn hiện tại nằm ở inventories.

    const tx = await StockTransaction.create([{
      id: makeId('ST'),
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
      inQty: direction === 'IN' ? Math.abs(rawQty) : 0,
      outQty: direction === 'OUT' ? Math.abs(rawQty) : 0,
      balanceQty: nextQty,
      refType,
      refId,
      refCode,
      note: movement.note || document.note || '',
      createdAt: postedAt,
      updatedAt: postedAt
    }], { session });
    transactions.push(tx[0]);
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
  const filter = {};
  if (query.productCode) filter.productCode = query.productCode;
  const rows = await InventoryLegacy.find(filter).sort({ productCode: 1 }).lean();
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.productCode || row.productId || '').trim();
    if (!key) continue;
    const qty = toNumber(row.onHand ?? row.quantity ?? row.qty ?? row.availableQty);
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...row,
        warehouseId: stockWarehouseCode(),
        warehouseCode: stockWarehouseCode(),
        warehouseName: stockWarehouseName(),
        qty: 0,
        quantity: 0,
        onHand: 0,
        availableQty: 0
      });
    }
    const acc = grouped.get(key);
    acc.qty += qty;
    acc.quantity += qty;
    acc.onHand += qty;
    acc.availableQty += qty;
    if ((row.updatedAt || row.createdAt || '') > (acc.updatedAt || acc.createdAt || '')) {
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
  return {
    id: makeId('ST'),
    date: dateOnly(date),
    productId: String(productId || productCode || '').trim(),
    productCode: String(productCode || productId || '').trim(),
    productName: String(productName || '').trim(),
    warehouseId: stockWarehouseCode(),
    warehouseCode: stockWarehouseCode(),
    warehouseName: stockWarehouseName(),
    type,
    direction,
    quantity: qty,
    qty,
    inQty: qty > 0 ? Math.abs(qty) : 0,
    outQty: qty < 0 ? Math.abs(qty) : 0,
    balanceQty: 0,
    refType,
    refId: String(refId || '').trim(),
    refCode: String(refCode || refId || '').trim(),
    note,
    createdAt: dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
}

async function rebuildSnapshotsFromTransactions() {
  await InventoryLegacy.deleteMany({});
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

  if (docs.length) await InventoryLegacy.insertMany(docs, { ordered: false });
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
      await StockTransaction.insertMany(transactions, { ordered: false });
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
  const rows = await InventoryLegacy.find({}).lean();
  const grouped = new Map();
  for (const row of rows) {
    const productCode = String(row.productCode || row.productId || '').trim();
    if (!productCode) continue;
    const qty = toNumber(row.onHand ?? row.quantity ?? row.qty ?? row.availableQty);
    if (!grouped.has(productCode)) grouped.set(productCode, { row, qty: 0 });
    grouped.get(productCode).qty += qty;
  }

  await InventoryLegacy.deleteMany({});
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
  if (docs.length) await InventoryLegacy.insertMany(docs, { ordered: false });
  await StockTransaction.updateMany({}, {
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
  isActive
};
