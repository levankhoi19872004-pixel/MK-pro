'use strict';

const returnOrderService = require('../services/returnOrderService');

async function list(req, res) {
  try {
    const returnOrders = await returnOrderService.listReturnOrders(req.query || {});
    res.json({ ok: true, source: 'mongo-route', returnOrders, returns: returnOrders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được phiếu trả hàng từ MongoDB', error: err.message });
  }
}

async function create(req, res) {
  try {
    const result = await returnOrderService.createReturnOrder(req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.status(201).json({ ok: true, source: 'mongo-route', message: `Đã tạo phiếu trả hàng ${result.returnOrder.code}`, returnOrder: result.returnOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được phiếu trả hàng' });
  }
}

async function getBySalesOrder(req, res) {
  try {
    const result = await returnOrderService.getReturnOrderBySalesOrderKey(req.params.salesOrderId, req.query || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'return-orders-by-sales-order', returnOrder: result.returnOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tải được phiếu trả theo đơn giao' });
  }
}

async function updateItemsBySalesOrder(req, res) {
  try {
    const result = await returnOrderService.updateReturnDraftItemsBySalesOrder(req.params.salesOrderId, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'return-orders-by-sales-order', message: 'Đã đồng bộ số lượng trả hàng', returnOrder: result.returnOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không cập nhật được số lượng trả hàng' });
  }
}

async function cancel(req, res) {
  try {
    const result = await returnOrderService.cancelReturnOrderById(req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: 'Đã hủy phiếu trả hàng', returnOrder: result.returnOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không hủy được phiếu trả hàng' });
  }
}

async function updateItems(req, res) {
  try {
    const result = await returnOrderService.updateReturnDraftItems(req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: 'Đã cập nhật số lượng trả hàng', returnOrder: result.returnOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không cập nhật được số lượng trả hàng' });
  }
}

module.exports = { list, create, getBySalesOrder, updateItemsBySalesOrder, updateItems, cancel };
