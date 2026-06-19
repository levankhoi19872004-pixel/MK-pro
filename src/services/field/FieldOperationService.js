'use strict';

const VisitPlan = require('../../models/VisitPlan');
const VisitExecution = require('../../models/VisitExecution');
const dateUtil = require('../../utils/date.util');
const { makeId } = require('../../utils/common.util');
const { tenantIdOf, scopeTenant } = require('../../utils/tenant.util');
const CommandPipeline = require('../../application/CommandPipeline');

function text(value) {
  return String(value || '').trim();
}

function actorName(actor = {}) {
  return text(actor.username || actor.fullName || actor.name || actor.code || 'system');
}

function normalizeLocation(location = {}) {
  const lat = Number(location.lat ?? location.latitude);
  const lng = Number(location.lng ?? location.longitude);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    accuracy: Number(location.accuracy || 0) || 0
  };
}

function normalizeStops(stops = []) {
  return (Array.isArray(stops) ? stops : []).map((row, index) => ({
    id: text(row.id || `STOP-${index + 1}`),
    sequence: Number(row.sequence || index + 1),
    customerId: text(row.customerId),
    customerCode: text(row.customerCode || row.code),
    customerName: text(row.customerName || row.name),
    address: text(row.address),
    plannedAt: text(row.plannedAt),
    priority: Number(row.priority || 0),
    status: 'planned'
  })).filter((row) => row.customerCode);
}

async function createPlan(input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  const salesStaffCode = text(input.salesStaffCode || actor.salesStaffCode || actor.staffCode);
  const stops = normalizeStops(input.stops);
  if (!salesStaffCode || !stops.length) throw Object.assign(new Error('Kế hoạch tuyến thiếu NVBH hoặc điểm ghé'), { status: 400 });

  return CommandPipeline.execute({
    name: 'VisitPlan.Create',
    aggregateType: 'VisitPlan',
    tenantId,
    actor,
    input,
    idempotencyKey: input.idempotencyKey,
    handle: async (_, { session }) => {
      const now = dateUtil.nowIso();
      const document = {
        id: text(input.id || makeId('VP')),
        code: text(input.code || `VP${Date.now()}`),
        tenantId,
        planDate: dateUtil.toDateOnly(input.planDate || input.date, dateUtil.todayVN()),
        salesStaffCode,
        salesStaffName: text(input.salesStaffName || actor.salesStaffName || actor.fullName),
        routeCode: text(input.routeCode),
        status: 'planned',
        stops,
        createdAt: now,
        createdBy: actorName(actor),
        updatedAt: now
      };
      const created = await VisitPlan.create([document], { session });
      return created[0].toObject();
    },
    events: (result) => [{
      aggregateType: 'VisitPlan',
      aggregateId: result.id,
      eventType: 'field.visit_plan.created',
      payload: { id: result.id, code: result.code, salesStaffCode: result.salesStaffCode, stopCount: result.stops.length }
    }]
  });
}

async function checkIn(planId, stopId, input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  return CommandPipeline.execute({
    name: 'VisitExecution.CheckIn',
    aggregateType: 'VisitExecution',
    tenantId,
    actor,
    input: { ...input, planId, stopId },
    idempotencyKey: input.idempotencyKey,
    handle: async (_, { session }) => {
      const plan = await VisitPlan.findOne(scopeTenant({ id: text(planId) }, tenantId)).session(session);
      if (!plan) throw Object.assign(new Error('Không tìm thấy kế hoạch tuyến'), { status: 404 });
      const stop = (plan.stops || []).find((row) => text(row.id) === text(stopId));
      if (!stop) throw Object.assign(new Error('Không tìm thấy điểm ghé'), { status: 404 });
      const existed = await VisitExecution.findOne(scopeTenant({
        visitPlanId: plan.id,
        stopId: text(stopId),
        status: { $in: ['checked_in', 'completed', 'no_sale'] }
      }, tenantId)).session(session).lean();
      if (existed) return existed;

      const now = dateUtil.nowIso();
      const document = {
        id: text(input.id || makeId('VE')),
        tenantId,
        visitPlanId: plan.id,
        stopId: text(stopId),
        customerId: text(stop.customerId),
        customerCode: text(stop.customerCode),
        customerName: text(stop.customerName),
        salesStaffCode: text(plan.salesStaffCode),
        status: 'checked_in',
        checkInAt: now,
        checkInLocation: normalizeLocation(input.location),
        checkOutAt: '',
        checkOutLocation: {},
        outcome: {},
        photoUrls: [],
        note: text(input.note),
        createdAt: now,
        updatedAt: now
      };
      const created = await VisitExecution.create([document], { session });
      stop.status = 'checked_in';
      plan.status = 'in_progress';
      plan.markModified('stops');
      plan.updatedAt = now;
      await plan.save({ session });
      return created[0].toObject();
    },
    events: (result) => [{
      aggregateType: 'VisitExecution',
      aggregateId: result.id,
      eventType: 'field.visit.checked_in',
      payload: { id: result.id, customerCode: result.customerCode, salesStaffCode: result.salesStaffCode }
    }]
  });
}

async function complete(executionId, input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  return CommandPipeline.execute({
    name: 'VisitExecution.Complete',
    aggregateType: 'VisitExecution',
    tenantId,
    actor,
    input: { ...input, executionId },
    idempotencyKey: input.idempotencyKey,
    handle: async (_, { session }) => {
      const execution = await VisitExecution.findOne(scopeTenant({
        id: text(executionId),
        status: 'checked_in'
      }, tenantId)).session(session);
      if (!execution) throw Object.assign(new Error('Không tìm thấy lượt ghé đang thực hiện'), { status: 404 });
      execution.status = input.noSale === true ? 'no_sale' : 'completed';
      execution.checkOutAt = dateUtil.nowIso();
      execution.checkOutLocation = normalizeLocation(input.location);
      execution.outcome = {
        orderCode: text(input.orderCode),
        orderAmount: Number(input.orderAmount || 0) || 0,
        noSaleReason: text(input.noSaleReason),
        survey: input.survey || {}
      };
      execution.photoUrls = (Array.isArray(input.photoUrls) ? input.photoUrls : []).map(text).filter(Boolean).slice(0, 20);
      execution.note = text(input.note || execution.note);
      execution.updatedAt = dateUtil.nowIso();
      await execution.save({ session });

      const plan = await VisitPlan.findOne(scopeTenant({ id: execution.visitPlanId }, tenantId)).session(session);
      if (plan) {
        const stop = (plan.stops || []).find((row) => text(row.id) === text(execution.stopId));
        if (stop) stop.status = execution.status;
        const done = (plan.stops || []).every((row) => ['completed', 'no_sale', 'cancelled'].includes(text(row.status)));
        plan.status = done ? 'completed' : 'in_progress';
        plan.markModified('stops');
        plan.updatedAt = dateUtil.nowIso();
        await plan.save({ session });
      }
      return execution.toObject();
    },
    events: (result) => [{
      aggregateType: 'VisitExecution',
      aggregateId: result.id,
      eventType: 'field.visit.completed',
      payload: { id: result.id, status: result.status, customerCode: result.customerCode, outcome: result.outcome }
    }]
  });
}

async function listPlans(query = {}, context = {}) {
  const filter = scopeTenant({}, tenantIdOf({ tenantId: context.tenantId }));
  if (query.date) filter.planDate = dateUtil.toDateOnly(query.date);
  if (query.salesStaffCode) filter.salesStaffCode = text(query.salesStaffCode);
  if (query.status && query.status !== 'all') filter.status = text(query.status);
  return VisitPlan.find(filter).sort({ planDate: -1, salesStaffCode: 1 }).limit(Math.min(Number(query.limit || 200), 500)).lean();
}

module.exports = { createPlan, checkIn, complete, listPlans, normalizeStops, normalizeLocation };
