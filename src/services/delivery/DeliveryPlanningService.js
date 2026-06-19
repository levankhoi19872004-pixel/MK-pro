'use strict';

const DeliveryRoutePlan = require('../../models/DeliveryRoutePlan');
const MasterOrder = require('../../models/MasterOrder');
const dateUtil = require('../../utils/date.util');
const { makeId, toNumber } = require('../../utils/common.util');
const { tenantIdOf, scopeTenant } = require('../../utils/tenant.util');
const CommandPipeline = require('../../application/CommandPipeline');

function text(value) {
  return String(value || '').trim();
}

function actorName(actor = {}) {
  return text(actor.username || actor.fullName || actor.name || actor.code || 'system');
}

function routeScore(order = {}) {
  const priority = Number(order.priority || order.deliveryPriority || 0);
  const area = text(order.areaCode || order.area || order.routeCode || order.route || 'ZZZ');
  const window = text(order.deliveryWindow || order.timeWindow || '99:99');
  const customer = text(order.customerName || order.customerCode);
  return { priority, area, window, customer };
}

function compareStops(left, right) {
  const a = routeScore(left);
  const b = routeScore(right);
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.area.localeCompare(b.area) || a.window.localeCompare(b.window) || a.customer.localeCompare(b.customer);
}

function buildStops(orders = []) {
  return (Array.isArray(orders) ? orders : []).slice().sort(compareStops).map((order, index) => ({
    id: text(order.id || order._id || order.code),
    sequence: index + 1,
    orderId: text(order.id || order._id),
    orderCode: text(order.code || order.masterOrderCode || order.id),
    customerCode: text(order.customerCode),
    customerName: text(order.customerName),
    address: text(order.address || order.customerAddress),
    areaCode: text(order.areaCode || order.area || order.routeCode || order.route),
    deliveryWindow: text(order.deliveryWindow || order.timeWindow),
    priority: Number(order.priority || order.deliveryPriority || 0),
    amount: toNumber(order.totalAmount || order.amount),
    weight: toNumber(order.totalWeight || order.weight),
    status: 'planned'
  }));
}

async function loadOrders(input, tenantId, session) {
  if (Array.isArray(input.orders) && input.orders.length) return input.orders;
  const filter = {
    deliveryDate: dateUtil.toDateOnly(input.deliveryDate || input.date, dateUtil.todayVN()),
    deliveryStaffCode: text(input.deliveryStaffCode),
    status: { $nin: ['cancelled', 'canceled', 'deleted'] }
  };
  if (String(process.env.TENANT_MODE || 'single').toLowerCase() === 'multi') filter.tenantId = tenantId;
  return MasterOrder.find(filter).session(session).lean();
}

async function createPlan(input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  if (!text(input.deliveryStaffCode)) throw Object.assign(new Error('Thiếu nhân viên giao hàng'), { status: 400 });
  return CommandPipeline.execute({
    name: 'DeliveryRoutePlan.Create',
    aggregateType: 'DeliveryRoutePlan',
    tenantId,
    actor,
    input,
    idempotencyKey: input.idempotencyKey,
    handle: async (_, { session }) => {
      const orders = await loadOrders(input, tenantId, session);
      const stops = buildStops(orders);
      if (!stops.length) throw Object.assign(new Error('Không có đơn phù hợp để lập tuyến'), { status: 404 });
      const capacity = Math.max(0, Number(input.capacity || 0));
      const totalWeight = stops.reduce((sum, row) => sum + toNumber(row.weight), 0);
      if (capacity > 0 && totalWeight > capacity && input.allowOverCapacity !== true) {
        throw Object.assign(new Error(`Tổng tải ${totalWeight} vượt tải trọng ${capacity}`), { status: 409, code: 'VEHICLE_CAPACITY_EXCEEDED' });
      }
      const now = dateUtil.nowIso();
      const document = {
        id: text(input.id || makeId('DRP')),
        code: text(input.code || `DRP${Date.now()}`),
        tenantId,
        deliveryDate: dateUtil.toDateOnly(input.deliveryDate || input.date, dateUtil.todayVN()),
        deliveryStaffCode: text(input.deliveryStaffCode),
        deliveryStaffName: text(input.deliveryStaffName),
        vehicleCode: text(input.vehicleCode),
        capacity,
        status: 'draft',
        stops,
        summary: {
          stopCount: stops.length,
          totalAmount: stops.reduce((sum, row) => sum + toNumber(row.amount), 0),
          totalWeight,
          overCapacity: capacity > 0 && totalWeight > capacity
        },
        createdAt: now,
        createdBy: actorName(actor),
        updatedAt: now
      };
      const created = await DeliveryRoutePlan.create([document], { session });
      return created[0].toObject();
    },
    events: (result) => [{
      aggregateType: 'DeliveryRoutePlan',
      aggregateId: result.id,
      eventType: 'delivery.route.planned',
      payload: { id: result.id, code: result.code, deliveryStaffCode: result.deliveryStaffCode, summary: result.summary }
    }]
  });
}

async function updateStop(planId, stopId, input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  const status = text(input.status);
  if (!['planned', 'delivered', 'failed', 'rescheduled'].includes(status)) {
    throw Object.assign(new Error('Trạng thái điểm giao không hợp lệ'), { status: 400 });
  }

  return CommandPipeline.execute({
    name: 'DeliveryRoutePlan.UpdateStop',
    aggregateType: 'DeliveryRoutePlan',
    tenantId,
    actor,
    input: { ...input, planId, stopId },
    idempotencyKey: input.idempotencyKey,
    handle: async (_, { session }) => {
      const plan = await DeliveryRoutePlan.findOne(scopeTenant({ id: text(planId) }, tenantId)).session(session);
      if (!plan) throw Object.assign(new Error('Không tìm thấy kế hoạch giao hàng'), { status: 404 });
      const stop = (plan.stops || []).find((row) => text(row.id) === text(stopId) || text(row.orderCode) === text(stopId));
      if (!stop) throw Object.assign(new Error('Không tìm thấy điểm giao'), { status: 404 });
      stop.status = status;
      stop.note = text(input.note);
      stop.completedAt = ['delivered', 'failed'].includes(status) ? dateUtil.nowIso() : '';
      const done = (plan.stops || []).every((row) => ['delivered', 'failed', 'rescheduled'].includes(text(row.status)));
      plan.status = done ? 'completed' : 'in_progress';
      plan.markModified('stops');
      plan.updatedAt = dateUtil.nowIso();
      await plan.save({ session });
      return plan.toObject();
    },
    events: (result) => [{
      aggregateType: 'DeliveryRoutePlan',
      aggregateId: result.id,
      eventType: 'delivery.route.stop_updated',
      payload: { id: result.id, stopId: text(stopId), status }
    }]
  });
}

async function listPlans(query = {}, context = {}) {
  const filter = scopeTenant({}, tenantIdOf({ tenantId: context.tenantId }));
  if (query.date) filter.deliveryDate = dateUtil.toDateOnly(query.date);
  if (query.deliveryStaffCode) filter.deliveryStaffCode = text(query.deliveryStaffCode);
  if (query.status && query.status !== 'all') filter.status = text(query.status);
  return DeliveryRoutePlan.find(filter).sort({ deliveryDate: -1, createdAt: -1 }).limit(Math.min(Number(query.limit || 100), 500)).lean();
}

module.exports = { createPlan, updateStop, listPlans, buildStops, compareStops };
