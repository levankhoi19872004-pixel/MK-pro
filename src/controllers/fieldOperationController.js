'use strict';

const service = require('../services/field/FieldOperationService');

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
    return fail(res, error, 'Không tải được kế hoạch tuyến');
  }
}

async function create(req, res) {
  try {
    return res.status(201).json({ ok: true, success: true, item: await service.createPlan(req.body, context(req)) });
  } catch (error) {
    return fail(res, error, 'Không tạo được kế hoạch tuyến');
  }
}

async function checkIn(req, res) {
  try {
    return res.status(201).json({ ok: true, success: true, execution: await service.checkIn(req.params.planId, req.params.stopId, req.body, context(req)) });
  } catch (error) {
    return fail(res, error, 'Không check-in được điểm bán');
  }
}

async function complete(req, res) {
  try {
    return res.json({ ok: true, success: true, execution: await service.complete(req.params.executionId, req.body, context(req)) });
  } catch (error) {
    return fail(res, error, 'Không hoàn thành được lượt ghé');
  }
}

module.exports = { list, create, checkIn, complete };
