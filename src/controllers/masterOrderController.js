'use strict';

const masterOrderService = require('../services/masterOrderService');

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

async function create(req, res) {
  try {
    const result = await masterOrderService.createMasterOrder(req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.status(201).json({ ok: true, source: 'mongo-route', message: `Đã tạo đơn tổng ${result.masterOrder.code}`, masterOrder: result.masterOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được đơn tổng' });
  }
}

async function cancel(req, res) {
  try {
    const result = await masterOrderService.cancelMasterOrder(req.params.id);
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: `Đã hủy gộp đơn tổng ${result.masterOrder.code}`, masterOrder: result.masterOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không hủy được đơn tổng' });
  }
}

module.exports = { listUnmergedChildOrders, list, create, cancel };
