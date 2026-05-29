'use strict';

const masterOrderService = require('../services/masterOrderService');

function handleServiceResult(res, result, successStatus = 200, successPayload = {}) {
  if (result && result.error) {
    return res.status(result.status || 400).json({ ok: false, message: result.error });
  }
  return res.status(successStatus).json({ ok: true, source: 'mongo-route', ...successPayload(result) });
}

async function listUnmergedChildOrders(req, res) {
  try {
    const orders = await masterOrderService.listUnmergedChildOrders(req.query || {});
    res.json({ ok: true, source: 'mongo-route', orders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được đơn con chưa gộp từ MongoDB', error: err.message });
  }
}

async function list(req, res) {
  try {
    const masterOrders = await masterOrderService.listMasterOrders(req.query || {});
    res.json({ ok: true, source: 'mongo-route', masterOrders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được đơn tổng từ MongoDB', error: err.message });
  }
}

async function get(req, res) {
  try {
    const result = await masterOrderService.getMasterOrder(req.params.id);
    return handleServiceResult(res, result, 200, (r) => ({ masterOrder: r.masterOrder }));
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được chi tiết đơn tổng', error: err.message });
  }
}

async function create(req, res) {
  try {
    const result = await masterOrderService.createMasterOrder(req.body || {});
    return handleServiceResult(res, result, 201, (r) => ({ message: `Đã tạo đơn tổng ${r.masterOrder.code}`, masterOrder: r.masterOrder }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được đơn tổng' });
  }
}

async function update(req, res) {
  try {
    const result = await masterOrderService.updateMasterOrder(req.params.id, req.body || {});
    return handleServiceResult(res, result, 200, (r) => ({ message: `Đã cập nhật đơn tổng ${r.masterOrder.code}`, masterOrder: r.masterOrder }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không cập nhật được đơn tổng' });
  }
}

async function cancel(req, res) {
  try {
    const result = await masterOrderService.cancelMasterOrder(req.params.id, req.body || {});
    return handleServiceResult(res, result, 200, (r) => ({ message: `Đã hủy gộp đơn tổng ${r.masterOrder.code}`, masterOrder: r.masterOrder }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không hủy được đơn tổng' });
  }
}

async function remove(req, res) {
  try {
    const result = await masterOrderService.deleteMasterOrder(req.params.id, req.body || {});
    return handleServiceResult(res, result, 200, (r) => ({ message: `Đã xóa mềm đơn tổng ${r.masterOrder.code}`, masterOrder: r.masterOrder }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không xóa được đơn tổng' });
  }
}

module.exports = { listUnmergedChildOrders, list, get, create, update, cancel, remove };
