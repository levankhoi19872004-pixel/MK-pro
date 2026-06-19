'use strict';

const InternalSaleAllocation = require('../models/InternalSaleAllocation');
const InternalSaleAllocationLedger = require('../models/InternalSaleAllocationLedger');
const DmsInventoryImport = require('../models/DmsInventoryImport');
const DmsInventorySnapshot = require('../models/DmsInventorySnapshot');
const { makeId, toNumber } = require('../utils/common.util');
const dateUtil = require('../utils/date.util');
const inventoryStockService = require('./inventoryStock.service');

function isQuotaEnabled() {
  return String(process.env.ENABLE_DMS_APP_SALE_QUOTA || 'true').trim().toLowerCase() !== 'false';
}

function cleanCode(value = '') {
  return inventoryStockService.normalizeProductCode(value);
}

function aggregateItems(items = []) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const productCode = cleanCode(item.productCode || item.code || item.sku || item.productId);
    const quantity = Math.abs(toNumber(item.quantity ?? item.qty ?? item.stockQuantity));
    if (!productCode || quantity <= 0) continue;
    map.set(productCode, toNumber(map.get(productCode)) + quantity);
  }
  return map;
}

function invalidateMobileCatalogCache() {
  try {
    const catalog = require('./mobile/catalog.service');
    if (typeof catalog.invalidateMobileCatalogProductsCache === 'function') {
      catalog.invalidateMobileCatalogProductsCache();
    }
  } catch (_) {
    // Cache chỉ là tối ưu đọc; lỗi invalidate không được làm hỏng giao dịch.
  }
}

async function getActiveAllocations(productCodes = [], options = {}) {
  const codes = Array.from(new Set((productCodes || []).map(cleanCode).filter(Boolean)));
  if (!codes.length) return new Map();
  let query = InternalSaleAllocation.find({
    productCode: { $in: codes },
    status: 'active'
  }).lean();
  if (options.session) query = query.session(options.session);
  const rows = await query;
  return new Map((rows || []).map((row) => [cleanCode(row.productCode), row]));
}

async function consumeForOrder({ orderId, orderCode, items, actorCode = '', actorName = '' } = {}, options = {}) {
  if (!isQuotaEnabled()) return new Map();
  const session = options.session;
  if (!session) {
    const err = new Error('Trừ hạn mức bán App cần chạy trong Mongo transaction');
    err.code = 'DMS_QUOTA_SESSION_REQUIRED';
    throw err;
  }

  const requiredByCode = aggregateItems(items);
  if (!requiredByCode.size) return new Map();
  const consumed = new Map();
  const now = dateUtil.nowIso();

  for (const [productCode, requiredQty] of requiredByCode.entries()) {
    const allocation = await InternalSaleAllocation.findOneAndUpdate(
      {
        productCode,
        status: 'active',
        remainingQty: { $gte: requiredQty }
      },
      {
        $inc: {
          consumedQty: requiredQty,
          remainingQty: -requiredQty
        },
        $set: { updatedAt: now }
      },
      { new: true, session, lean: true }
    );

    if (!allocation) {
      const current = await InternalSaleAllocation.findOne({ productCode, status: 'active' })
        .session(session)
        .lean();
      const err = new Error(current
        ? `Sản phẩm ${productCode} chỉ còn được bán qua App ${Math.max(0, toNumber(current.remainingQty))} đơn vị`
        : `Sản phẩm ${productCode} chưa có hạn mức bán qua App. Vui lòng cập nhật file tồn DMS buổi sáng.`);
      err.code = 'DMS_APP_QUOTA_EXCEEDED';
      err.productCode = productCode;
      err.availableQuota = Math.max(0, toNumber(current?.remainingQty));
      err.requiredQty = requiredQty;
      throw err;
    }

    const eventKey = `CONSUME:${String(orderId || orderCode)}:${productCode}`;
    await InternalSaleAllocationLedger.create([{
      id: makeId('ISAL'),
      eventKey,
      allocationId: String(allocation.id || allocation._id || ''),
      productCode,
      direction: 'OUT',
      type: 'ORDER_CONSUME',
      quantity: requiredQty,
      sourceOrderId: String(orderId || ''),
      sourceOrderCode: String(orderCode || orderId || ''),
      actorCode: String(actorCode || ''),
      actorName: String(actorName || ''),
      note: `Trừ hạn mức bán App theo đơn ${orderCode || orderId || ''}`,
      createdAt: now
    }], { session });

    consumed.set(productCode, allocation);
  }

  invalidateMobileCatalogCache();
  return consumed;
}


function quotaConsumedItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => String(item.saleAllocationType || '').toUpperCase() === 'INTERNAL_APP_QUOTA'
      || toNumber(item.allocationConsumedQty ?? item.quotaConsumedQty) > 0
      || String(item.internalSaleAllocationId || '').trim())
    .map((item) => ({
      ...item,
      quantity: item.allocationConsumedQty ?? item.quotaConsumedQty ?? item.quantity ?? item.qty
    }));
}


function buildQuotaEditPlan(previousItems = [], nextItems = []) {
  const previousAllByCode = aggregateItems(previousItems);
  const previousQuotaByCode = aggregateItems(quotaConsumedItems(previousItems));
  const nextByCode = aggregateItems(nextItems);
  const productCodes = Array.from(new Set([...previousAllByCode.keys(), ...nextByCode.keys()])).sort();

  return productCodes.map((productCode) => {
    const previousQty = Math.max(0, toNumber(previousAllByCode.get(productCode)));
    const previousQuotaQty = Math.max(0, toNumber(previousQuotaByCode.get(productCode)));
    const nextQty = Math.max(0, toNumber(nextByCode.get(productCode)));
    const deltaQty = nextQty - previousQty;
    const releaseQty = deltaQty < 0 ? Math.min(Math.abs(deltaQty), previousQuotaQty) : 0;
    const consumeQty = Math.max(0, deltaQty);
    const nextQuotaQty = Math.max(0, previousQuotaQty + consumeQty - releaseQty);
    return {
      productCode,
      previousQty,
      previousQuotaQty,
      nextQty,
      deltaQty,
      consumeQty,
      releaseQty,
      nextQuotaQty
    };
  });
}

function safeEventPart(value = '') {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, '_')
    .slice(0, 120);
}

async function adjustForOrderEdit({
  orderId,
  orderCode,
  previousItems = [],
  nextItems = [],
  commandId = '',
  actorCode = '',
  actorName = ''
} = {}, options = {}) {
  if (!isQuotaEnabled()) return { allocations: new Map(), consumedQtyByCode: new Map(), deltas: [] };
  const session = options.session;
  if (!session) {
    const err = new Error('Điều chỉnh hạn mức bán App cần chạy trong Mongo transaction');
    err.code = 'DMS_QUOTA_SESSION_REQUIRED';
    throw err;
  }

  const plan = buildQuotaEditPlan(previousItems, nextItems);
  const nextByCode = aggregateItems(nextItems);
  const allocations = new Map();
  const consumedQtyByCode = new Map();
  const deltas = [];
  const now = dateUtil.nowIso();
  const sourceOrderId = String(orderId || orderCode || '');
  const sourceOrderCode = String(orderCode || orderId || '');
  const commandKey = safeEventPart(commandId || makeId('EDIT'));

  for (const row of plan) {
    const { productCode, previousQty, previousQuotaQty, nextQty, nextQuotaQty, deltaQty, consumeQty, releaseQty } = row;
    consumedQtyByCode.set(productCode, nextQuotaQty);
    deltas.push(row);

    if (consumeQty > 0) {
      const eventKey = `EDIT_CONSUME:${commandKey}:${safeEventPart(sourceOrderId || sourceOrderCode)}:${productCode}`;
      const existing = await InternalSaleAllocationLedger.findOne({ eventKey }).session(session).lean();
      if (existing) {
        const existingAllocation = await InternalSaleAllocation.findOne({
          $or: [
            { id: existing.allocationId },
            { _id: /^[a-f0-9]{24}$/i.test(String(existing.allocationId || '')) ? existing.allocationId : undefined }
          ].filter((row) => Object.values(row)[0] !== undefined)
        }).session(session).lean();
        if (existingAllocation) allocations.set(productCode, existingAllocation);
        continue;
      }

      const allocation = await InternalSaleAllocation.findOneAndUpdate(
        {
          productCode,
          status: 'active',
          remainingQty: { $gte: consumeQty }
        },
        {
          $inc: {
            consumedQty: consumeQty,
            remainingQty: -consumeQty
          },
          $set: { updatedAt: now }
        },
        { new: true, session, lean: true }
      );

      if (!allocation) {
        const current = await InternalSaleAllocation.findOne({ productCode, status: 'active' })
          .session(session)
          .lean();
        const err = new Error(current
          ? `Sản phẩm ${productCode} chỉ còn được bán qua App ${Math.max(0, toNumber(current.remainingQty))} đơn vị`
          : `Sản phẩm ${productCode} chưa có hạn mức bán qua App. Vui lòng cập nhật file tồn DMS buổi sáng.`);
        err.code = 'DMS_APP_QUOTA_EXCEEDED';
        err.productCode = productCode;
        err.availableQuota = Math.max(0, toNumber(current?.remainingQty));
        err.requiredQty = consumeQty;
        throw err;
      }

      await InternalSaleAllocationLedger.create([{
        id: makeId('ISAL'),
        eventKey,
        allocationId: String(allocation.id || allocation._id || ''),
        productCode,
        direction: 'OUT',
        type: 'ORDER_EDIT_CONSUME',
        quantity: consumeQty,
        sourceOrderId,
        sourceOrderCode,
        actorCode: String(actorCode || ''),
        actorName: String(actorName || ''),
        note: `Trừ thêm hạn mức do sửa đơn ${sourceOrderCode || sourceOrderId}`,
        createdAt: now
      }], { session });

      allocations.set(productCode, allocation);
      continue;
    }

    if (deltaQty < 0 && releaseQty > 0) {
      const eventKey = `EDIT_RELEASE:${commandKey}:${safeEventPart(sourceOrderId || sourceOrderCode)}:${productCode}`;
      const existing = await InternalSaleAllocationLedger.findOne({ eventKey }).session(session).lean();
      if (existing) {
        const current = await InternalSaleAllocation.findOne({ productCode, status: 'active' }).session(session).lean();
        if (current) allocations.set(productCode, current);
        continue;
      }

      let allocation = await InternalSaleAllocation.findOneAndUpdate(
        { productCode, status: 'active' },
        {
          $inc: { releasedQty: releaseQty, remainingQty: releaseQty },
          $set: { updatedAt: now }
        },
        { new: true, session, lean: true }
      );
      if (!allocation) allocation = await createReleaseAllocation(productCode, releaseQty, { id: sourceOrderId, code: sourceOrderCode }, { session });
      if (!allocation) continue;

      await InternalSaleAllocationLedger.create([{
        id: makeId('ISAL'),
        eventKey,
        allocationId: String(allocation.id || allocation._id || ''),
        productCode,
        direction: 'IN',
        type: 'ORDER_EDIT_RELEASE',
        quantity: releaseQty,
        sourceOrderId,
        sourceOrderCode,
        actorCode: String(actorCode || ''),
        actorName: String(actorName || ''),
        note: `Hoàn hạn mức do giảm số lượng khi sửa đơn ${sourceOrderCode || sourceOrderId}`,
        createdAt: now
      }], { session });

      allocations.set(productCode, allocation);
    }
  }

  const nextCodes = Array.from(nextByCode.keys());
  if (nextCodes.length) {
    const active = await getActiveAllocations(nextCodes, { session });
    for (const [productCode, allocation] of active.entries()) allocations.set(productCode, allocation);
  }

  invalidateMobileCatalogCache();
  return { allocations, consumedQtyByCode, deltas };
}

async function createReleaseAllocation(productCode, quantity, order = {}, options = {}) {
  const session = options.session;
  const latestImport = await DmsInventoryImport.findOne({ status: 'completed' })
    .sort({ committedAt: -1, createdAt: -1 })
    .session(session)
    .lean();
  if (!latestImport) return null;

  const snapshot = await DmsInventorySnapshot.findOne({
    importId: String(latestImport.id || latestImport._id || ''),
    productCode
  }).session(session).lean();

  const now = dateUtil.nowIso();
  const created = await InternalSaleAllocation.create([{
    id: makeId('ISA'),
    code: makeId('ISA'),
    importId: String(latestImport.id || latestImport._id || ''),
    importCode: String(latestImport.code || ''),
    snapshotId: String(snapshot?.id || snapshot?._id || ''),
    snapshotDate: String(latestImport.snapshotDate || dateUtil.todayVN()),
    snapshotAt: String(latestImport.snapshotAt || latestImport.committedAt || now),
    productId: String(snapshot?.productId || ''),
    productCode,
    productName: String(snapshot?.productName || ''),
    dmsSnapshotQty: toNumber(snapshot?.dmsBaseQty),
    internalSnapshotQty: toNumber(snapshot?.internalBaseQty),
    openingQty: 0,
    consumedQty: 0,
    releasedQty: quantity,
    remainingQty: quantity,
    status: 'active',
    source: 'ORDER_RELEASE_AFTER_SNAPSHOT',
    activatedAt: now,
    supersededAt: '',
    supersededByImportId: '',
    createdAt: now,
    updatedAt: now
  }], { session });

  return created[0] && typeof created[0].toObject === 'function' ? created[0].toObject() : created[0];
}

async function releaseForDeletedOrder(order = {}, actor = {}, options = {}) {
  if (!isQuotaEnabled()) return { released: 0, rows: [] };
  const session = options.session;
  if (!session) {
    const err = new Error('Hoàn hạn mức bán App cần chạy trong Mongo transaction');
    err.code = 'DMS_QUOTA_SESSION_REQUIRED';
    throw err;
  }

  const quotaItems = (Array.isArray(order.items) ? order.items : [])
    .filter((item) => String(item.saleAllocationType || '').toUpperCase() === 'INTERNAL_APP_QUOTA')
    .map((item) => ({
      productCode: item.productCode || item.code || item.sku,
      quantity: item.allocationConsumedQty ?? item.quotaConsumedQty ?? item.quantity ?? item.qty,
      internalSaleAllocationId: item.internalSaleAllocationId || ''
    }));
  const releaseByCode = aggregateItems(quotaItems);
  if (!releaseByCode.size) return { released: 0, rows: [] };

  const orderId = String(order.id || order._id || order.code || '');
  const orderCode = String(order.code || order.orderCode || order.id || '');
  const now = dateUtil.nowIso();
  const releasedRows = [];

  for (const [productCode, quantity] of releaseByCode.entries()) {
    const eventKey = `RELEASE:${orderId || orderCode}:${productCode}`;
    const existing = await InternalSaleAllocationLedger.findOne({ eventKey }).session(session).lean();
    if (existing) continue;

    let allocation = await InternalSaleAllocation.findOneAndUpdate(
      { productCode, status: 'active' },
      {
        $inc: { releasedQty: quantity, remainingQty: quantity },
        $set: { updatedAt: now }
      },
      { new: true, session, lean: true }
    );

    if (!allocation) allocation = await createReleaseAllocation(productCode, quantity, order, { session });
    if (!allocation) continue;

    await InternalSaleAllocationLedger.create([{
      id: makeId('ISAL'),
      eventKey,
      allocationId: String(allocation.id || allocation._id || ''),
      productCode,
      direction: 'IN',
      type: 'ORDER_DELETE_RELEASE',
      quantity,
      sourceOrderId: orderId,
      sourceOrderCode: orderCode,
      sourceAllocationId: String(quotaItems.find((item) => cleanCode(item.productCode) === productCode)?.internalSaleAllocationId || ''),
      actorCode: String(actor.actorCode || ''),
      actorName: String(actor.actorName || ''),
      note: `Hoàn hạn mức do xóa đơn ${orderCode || orderId}`,
      createdAt: now
    }], { session });

    releasedRows.push({ productCode, quantity, allocationId: String(allocation.id || allocation._id || '') });
  }

  invalidateMobileCatalogCache();
  return {
    released: releasedRows.reduce((sum, row) => sum + toNumber(row.quantity), 0),
    rows: releasedRows
  };
}

module.exports = {
  isQuotaEnabled,
  aggregateItems,
  buildQuotaEditPlan,
  getActiveAllocations,
  consumeForOrder,
  adjustForOrderEdit,
  releaseForDeletedOrder,
  invalidateMobileCatalogCache
};
