'use strict';

const orderService = require('../services/orderService');

function handleServiceResult(res, result, successStatus = 200, successPayload = {}) {
  if (result && result.error) {
    return res.status(result.status || 400).json({ ok: false, message: result.error });
  }
  return res.status(successStatus).json({ ok: true, source: 'mongo-route', ...successPayload(result) });
}


async function search(req, res) {
  try {
    const result = await orderService.searchOrders(req.query || {});
    res.json({ ok: true, source: 'mongo-route', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tìm kiếm được danh sách đơn bán', error: err.message });
  }
}

async function list(req, res) {
  try {
    const salesOrders = await orderService.listOrders(req.query || {});
    res.json({ ok: true, source: 'mongo-route', salesOrders, orders: salesOrders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được đơn bán từ MongoDB', error: err.message });
  }
}

async function get(req, res) {
  try {
    const result = await orderService.getOrder(req.params.id);
    return handleServiceResult(res, result, 200, (r) => ({ salesOrder: r.salesOrder, order: r.salesOrder }));
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được chi tiết đơn bán', error: err.message });
  }
}

async function create(req, res) {
  try {
    const result = await orderService.createOrder(req.body || {});
    return handleServiceResult(res, result, 201, (r) => ({ message: `Đã tạo đơn bán ${r.salesOrder.code}`, salesOrder: r.salesOrder, order: r.salesOrder }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được đơn bán' });
  }
}

async function update(req, res) {
  try {
    const result = await orderService.updateOrder(req.params.id, req.body || {});
    return handleServiceResult(res, result, 200, (r) => ({ message: `Đã cập nhật đơn bán ${r.salesOrder.code}`, salesOrder: r.salesOrder, order: r.salesOrder }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không sửa được đơn bán' });
  }
}

async function cancel(req, res) {
  try {
    const result = await orderService.cancelOrder(req.params.id, req.body || {});
    return handleServiceResult(res, result, 200, (r) => ({ message: `Đã hủy đơn bán ${r.salesOrder.code}`, salesOrder: r.salesOrder, order: r.salesOrder }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không hủy được đơn bán' });
  }
}

async function remove(req, res) {
  try {
    const result = await orderService.deleteOrder(req.params.id, req.body || {});
    return handleServiceResult(res, result, 200, (r) => ({ message: r.hardDeleted ? `Đã xóa hẳn đơn bán ${r.salesOrder.code}` : `Đã xóa mềm đơn bán ${r.salesOrder.code}`, salesOrder: r.salesOrder, order: r.salesOrder }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không xóa được đơn bán' });
  }
}

module.exports = { list, search, get, create, update, cancel, remove };
