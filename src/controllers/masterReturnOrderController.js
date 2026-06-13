'use strict';

const masterReturnOrderService = require('../services/masterReturnOrderService');

function handleServiceResult(res, result, successStatus = 200, successPayload = {}) {
  if (result && result.error) {
    return res.status(result.status || 400).json({ ok: false, message: result.error });
  }
  return res.status(successStatus).json({ ok: true, source: 'mongo-route', ...successPayload(result) });
}

async function listUnmerged(req, res) {
  try {
    const returnOrders = await masterReturnOrderService.listUnmergedReturnOrders(req.query || {});
    res.json({ ok: true, source: 'mongo-route', returnOrders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được phiếu trả hàng chưa gộp', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function list(req, res) {
  try {
    const masterReturnOrders = await masterReturnOrderService.listMasterReturnOrders(req.query || {});
    res.json({ ok: true, source: 'mongo-route', masterReturnOrders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được đơn tổng trả hàng', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function get(req, res) {
  try {
    const result = await masterReturnOrderService.getMasterReturnOrder(req.params.id);
    return handleServiceResult(res, result, 200, (r) => ({ masterReturnOrder: r.masterReturnOrder }));
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được chi tiết đơn tổng trả hàng', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function create(req, res) {
  try {
    const result = await masterReturnOrderService.createMasterReturnOrder(req.body || {});
    return handleServiceResult(res, result, 201, (r) => ({ message: `Đã tạo đơn tổng trả hàng ${r.masterReturnOrder.code}`, masterReturnOrder: r.masterReturnOrder }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được đơn tổng trả hàng' });
  }
}

async function update(req, res) {
  try {
    const result = await masterReturnOrderService.updateMasterReturnOrder(req.params.id, req.body || {});
    return handleServiceResult(res, result, 200, (r) => ({ message: `Đã cập nhật đơn tổng trả hàng ${r.masterReturnOrder.code}`, masterReturnOrder: r.masterReturnOrder }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không cập nhật được đơn tổng trả hàng' });
  }
}


async function receive(req, res) {
  try {
    const result = await masterReturnOrderService.confirmReceiveMasterReturnOrder(req.params.id, req.body || {});
    return handleServiceResult(res, result, 200, (r) => ({
      message: r.alreadyReceived ? `Đơn tổng trả hàng ${r.masterReturnOrder.code} đã được kho nhận trước đó` : `Đã xác nhận kho nhận và ghi sổ đơn tổng trả hàng ${r.masterReturnOrder.code}`,
      masterReturnOrder: r.masterReturnOrder
    }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không xác nhận được kho nhận hàng trả' });
  }
}

async function cancel(req, res) {
  try {
    const result = await masterReturnOrderService.cancelMasterReturnOrder(req.params.id, req.body || {});
    return handleServiceResult(res, result, 200, (r) => ({ message: `Đã hủy gộp đơn tổng trả hàng ${r.masterReturnOrder.code}`, masterReturnOrder: r.masterReturnOrder }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không hủy được đơn tổng trả hàng' });
  }
}

module.exports = { listUnmerged, list, get, create, update, receive, cancel };
