'use strict';

const service = require('../services/delivery/DeliveryPlanningService');

function context(req) {
  return { tenantId: req.tenantId, actor: req.user || {} };
}

function fail(res, error, fallback) {
  return res.status(error.status || 400).json({ ok: false, success: false, code: error.code, message: error.message || fallback });
}

async function list(req, res) {
  try {
    return res.json({ ok: true, success: true, items: await service.listPlans(req.query, context(req)) });
  } catch (error) {
    return fail(res, error, 'Không tải được kế hoạch giao hàng');
  }
}

async function create(req, res) {
  try {
    return res.status(201).json({ ok: true, success: true, item: await service.createPlan(req.body, context(req)) });
  } catch (error) {
    return fail(res, error, 'Không lập được tuyến giao hàng');
  }
}

async function updateStop(req, res) {
  try {
    return res.json({ ok: true, success: true, item: await service.updateStop(req.params.planId, req.params.stopId, req.body, context(req)) });
  } catch (error) {
    return fail(res, error, 'Không cập nhật được điểm giao');
  }
}

module.exports = { list, create, updateStop };
