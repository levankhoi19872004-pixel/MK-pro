'use strict';

const InventoryReservation = require('../../models/InventoryReservation');
const StockCount = require('../../models/StockCount');
const Inventory = require('../../models/InventoryLegacy');
const InventoryPostingService = require('../../domain/posting/InventoryPostingService');
const CommandPipeline = require('../../application/CommandPipeline');
const dateUtil = require('../../utils/date.util');
const { makeId, toNumber } = require('../../utils/common.util');
const { tenantIdOf, scopeTenant } = require('../../utils/tenant.util');

function text(value) {
  return String(value || '').trim();
}

function qty(value) {
  return Math.max(0, toNumber(value));
}

function actorName(actor = {}) {
  return text(actor.username || actor.fullName || actor.name || actor.code || 'system');
}

function normalizeItems(items = []) {
  const grouped = new Map();
  for (const row of Array.isArray(items) ? items : []) {
    const productCode = text(row.productCode || row.code || row.sku || row.productId);
    const quantity = qty(row.quantity ?? row.qty);
    if (!productCode || quantity <= 0) continue;
    const current = grouped.get(productCode) || {
      productId: text(row.productId || productCode),
      productCode,
      productName: text(row.productName || row.name),
      quantity: 0
    };
    current.quantity += quantity;
    grouped.set(productCode, current);
  }
  return Array.from(grouped.values());
}

async function reserve(input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  const items = normalizeItems(input.items);
  if (!items.length) throw Object.assign(new Error('Yêu cầu giữ tồn chưa có dòng hàng'), { status: 400 });
  const referenceId = text(input.referenceId || input.orderId);
  if (!referenceId) throw Object.assign(new Error('Thiếu chứng từ cần giữ tồn'), { status: 400 });

  return CommandPipeline.execute({
    name: 'InventoryReservation.Create',
    aggregateType: 'InventoryReservation',
    tenantId,
    actor,
    input,
    idempotencyKey: input.idempotencyKey || `reserve:${tenantId}:${referenceId}`,
    handle: async (_, { session }) => {
      const existed = await InventoryReservation.findOne(scopeTenant({
        referenceType: text(input.referenceType || 'SALES_ORDER'),
        referenceId,
        status: 'active'
      }, tenantId)).session(session).lean();
      if (existed) return existed;

      const warehouseCode = text(input.warehouseCode || 'MAIN');
      for (const item of items) {
        const updated = await Inventory.findOneAndUpdate({
          productCode: item.productCode,
          warehouseCode,
          availableQty: { $gte: item.quantity }
        }, {
          $inc: { reservedQty: item.quantity, availableQty: -item.quantity },
          $set: { updatedAt: dateUtil.nowIso() }
        }, { new: true, session }).lean();
        if (!updated) {
          throw Object.assign(new Error(`Không đủ tồn khả dụng cho ${item.productCode}`), {
            status: 409,
            code: 'INSUFFICIENT_AVAILABLE_STOCK'
          });
        }
      }

      const now = dateUtil.nowIso();
      const document = {
        id: text(input.id || makeId('RSV')),
        tenantId,
        referenceType: text(input.referenceType || 'SALES_ORDER'),
        referenceId,
        referenceCode: text(input.referenceCode || input.orderCode),
        warehouseCode,
        status: 'active',
        items,
        expiresAt: input.expiresAt || new Date(Date.now() + Math.max(5, Number(input.ttlMinutes || 120)) * 60000).toISOString(),
        createdAt: now,
        createdBy: actorName(actor),
        releasedAt: '',
        releasedBy: '',
        updatedAt: now
      };
      const created = await InventoryReservation.create([document], { session });
      return created[0].toObject();
    },
    events: (result) => [{
      aggregateType: 'InventoryReservation',
      aggregateId: result.id,
      eventType: 'inventory.reserved',
      payload: { id: result.id, referenceId: result.referenceId, items: result.items }
    }]
  });
}

async function release(idOrReference, input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  return CommandPipeline.execute({
    name: 'InventoryReservation.Release',
    aggregateType: 'InventoryReservation',
    tenantId,
    actor,
    input: { ...input, idOrReference },
    idempotencyKey: input.idempotencyKey,
    handle: async (_, { session }) => {
      const value = text(idOrReference);
      const reservation = await InventoryReservation.findOne(scopeTenant({
        $or: [{ id: value }, { referenceId: value }, { referenceCode: value }],
        status: 'active'
      }, tenantId)).session(session);
      if (!reservation) throw Object.assign(new Error('Không tìm thấy giữ tồn đang hoạt động'), { status: 404 });

      for (const item of reservation.items || []) {
        const restored = await Inventory.findOneAndUpdate({
          productCode: item.productCode,
          warehouseCode: reservation.warehouseCode,
          reservedQty: { $gte: qty(item.quantity) }
        }, {
          $inc: { reservedQty: -qty(item.quantity), availableQty: qty(item.quantity) },
          $set: { updatedAt: dateUtil.nowIso() }
        }, { new: true, session }).lean();
        if (!restored) {
          throw Object.assign(new Error(`Giữ tồn ${item.productCode} đã lệch, cần đối soát trước khi giải phóng`), {
            status: 409,
            code: 'RESERVATION_BALANCE_MISMATCH'
          });
        }
      }
      reservation.status = 'released';
      reservation.releasedAt = dateUtil.nowIso();
      reservation.releasedBy = actorName(actor);
      reservation.updatedAt = dateUtil.nowIso();
      await reservation.save({ session });
      return reservation.toObject();
    },
    events: (result) => [{
      aggregateType: 'InventoryReservation',
      aggregateId: result.id,
      eventType: 'inventory.reservation.released',
      payload: { id: result.id, referenceId: result.referenceId }
    }]
  });
}

function normalizeCountItems(items = []) {
  return (Array.isArray(items) ? items : []).map((row) => ({
    productId: text(row.productId || row.productCode),
    productCode: text(row.productCode || row.code || row.sku || row.productId),
    productName: text(row.productName || row.name),
    countedQty: qty(row.countedQty ?? row.quantity ?? row.qty)
  })).filter((row) => row.productCode);
}

async function postStockCount(input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  const requested = normalizeCountItems(input.items);
  if (!requested.length) throw Object.assign(new Error('Phiếu kiểm kê chưa có dòng hàng'), { status: 400 });

  return CommandPipeline.execute({
    name: 'StockCount.Post',
    aggregateType: 'StockCount',
    tenantId,
    actor,
    input,
    idempotencyKey: input.idempotencyKey,
    handle: async (_, { session }) => {
      const warehouseCode = text(input.warehouseCode || 'MAIN');
      const currentRows = await Inventory.find({
        productCode: { $in: requested.map((row) => row.productCode) },
        warehouseCode
      }).session(session).lean();
      const currentMap = new Map(currentRows.map((row) => [text(row.productCode), row]));
      const items = requested.map((row) => {
        const current = currentMap.get(row.productCode) || {};
        const systemQty = toNumber(current.onHand ?? current.qty ?? current.quantity ?? current.availableQty);
        const varianceQty = row.countedQty - systemQty;
        return { ...row, systemQty, varianceQty };
      });

      const now = dateUtil.nowIso();
      const document = {
        id: text(input.id || makeId('SC')),
        code: text(input.code || `SC${Date.now()}`),
        tenantId,
        warehouseCode,
        countDate: dateUtil.toDateOnly(input.countDate || input.date, dateUtil.todayVN()),
        status: 'posted',
        items,
        totalVarianceQty: items.reduce((sum, row) => sum + Math.abs(row.varianceQty), 0),
        note: text(input.note),
        createdAt: now,
        createdBy: actorName(actor),
        postedAt: now,
        postedBy: actorName(actor),
        updatedAt: now
      };
      const created = await StockCount.create([document], { session });

      const positive = items.filter((row) => row.varianceQty > 0).map((row) => ({
        ...row,
        quantity: row.varianceQty,
        qty: row.varianceQty,
        warehouseCode
      }));
      const negative = items.filter((row) => row.varianceQty < 0).map((row) => ({
        ...row,
        quantity: Math.abs(row.varianceQty),
        qty: Math.abs(row.varianceQty),
        warehouseCode
      }));

      if (positive.length) {
        await InventoryPostingService.postAdjustment({ ...document, id: `${document.id}:IN`, items: positive }, 'IN', { session });
      }
      if (negative.length) {
        await InventoryPostingService.postAdjustment({ ...document, id: `${document.id}:OUT`, items: negative }, 'OUT', { session });
      }
      return created[0].toObject();
    },
    events: (result) => [{
      aggregateType: 'StockCount',
      aggregateId: result.id,
      eventType: 'inventory.stock_count.posted',
      payload: { id: result.id, code: result.code, totalVarianceQty: result.totalVarianceQty }
    }]
  });
}

async function listReservations(query = {}, context = {}) {
  const filter = scopeTenant({}, tenantIdOf({ tenantId: context.tenantId }));
  if (query.status && query.status !== 'all') filter.status = text(query.status);
  if (query.referenceId) filter.referenceId = text(query.referenceId);
  return InventoryReservation.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(query.limit || 200), 500)).lean();
}

async function listStockCounts(query = {}, context = {}) {
  const filter = scopeTenant({}, tenantIdOf({ tenantId: context.tenantId }));
  if (query.status && query.status !== 'all') filter.status = text(query.status);
  return StockCount.find(filter).sort({ countDate: -1, createdAt: -1 }).limit(Math.min(Number(query.limit || 100), 500)).lean();
}

module.exports = {
  normalizeItems,
  reserve,
  release,
  postStockCount,
  listReservations,
  listStockCounts
};
