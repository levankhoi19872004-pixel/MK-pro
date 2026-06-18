'use strict';

const service = require('../services/warehouse/WarehouseService');

function context(req) {
  return { tenantId: req.tenantId, actor: req.user || {} };
}

function fail(res, error, fallback) {
  return res.status(error.status || 400).json({
    ok: false,
    success: false,
    code: error.code,
    message: error.message || fallback
  });
}

async function reserve(req, res) {
  try {
    return res.status(201).json({ ok: true, success: true, reservation: await service.reserve(req.body, context(req)) });
  } catch (error) {
    return fail(res, error, 'Không giữ được tồn kho');
  }
}

async function release(req, res) {
  try {
    return res.json({ ok: true, success: true, reservation: await service.release(req.params.id, req.body, context(req)) });
  } catch (error) {
    return fail(res, error, 'Không giải phóng được tồn kho');
  }
}

async function reservations(req, res) {
  try {
    return res.json({ ok: true, success: true, items: await service.listReservations(req.query, context(req)) });
  } catch (error) {
    return fail(res, error, 'Không tải được giữ tồn');
  }
}

async function stockCounts(req, res) {
  try {
    return res.json({ ok: true, success: true, items: await service.listStockCounts(req.query, context(req)) });
  } catch (error) {
    return fail(res, error, 'Không tải được phiếu kiểm kê');
  }
}

async function postStockCount(req, res) {
  try {
    return res.status(201).json({ ok: true, success: true, stockCount: await service.postStockCount(req.body, context(req)) });
  } catch (error) {
    return fail(res, error, 'Không ghi nhận được kiểm kê');
  }
}

module.exports = { reserve, release, reservations, stockCounts, postStockCount };
