'use strict';

const orderService = require('../services/orderService');

async function list(req, res) {
  try {
    const salesOrders = await orderService.listOrders(req.query || {});
    res.json({ ok: true, source: 'mongo-route', salesOrders, orders: salesOrders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được đơn bán từ MongoDB', error: err.message });
  }
}

async function create(req, res) {
  try {
    const result = await orderService.createOrder(req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.status(201).json({ ok: true, source: 'mongo-route', message: `Đã tạo đơn bán ${result.salesOrder.code}`, salesOrder: result.salesOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được đơn bán' });
  }
}

async function update(req, res) {
  try {
    const result = await orderService.updateOrder(req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: `Đã cập nhật đơn bán ${result.salesOrder.code}`, salesOrder: result.salesOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không sửa được đơn bán' });
  }
}

async function cancel(req, res) {
  try {
    const result = await orderService.cancelOrder(req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: `Đã hủy đơn bán ${result.salesOrder.code}`, salesOrder: result.salesOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không hủy được đơn bán' });
  }
}

module.exports = { list, create, update, cancel };
