const express = require('express');
const router = express.Router();

const { readData, writeData } = require('../config/db');
const {
  listSalesOrders,
  getSalesOrder,
  previewSalesOrder,
  createSalesOrderDraft,
  confirmSalesOrder,
  cancelSalesOrder
} = require('../services/salesOrderService');

function sendError(res, error, status = 400) {
  return res.status(status).json({
    success: false,
    message: error.message,
    details: error.details || undefined
  });
}

router.get('/api/sales-orders', async (req, res) => {
  try {
    const data = await readData();
    const orders = listSalesOrders(data, req.query);
    res.json({ success: true, total: orders.length, data: orders });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get('/api/sales-orders/:id', async (req, res) => {
  try {
    const data = await readData();
    const order = getSalesOrder(data, req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn bán hàng' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.post('/api/sales-orders/preview', async (req, res) => {
  try {
    const data = await readData();
    const preview = previewSalesOrder(data, req.body || {});
    res.json({ success: true, data: preview });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/api/sales-orders', async (req, res) => {
  try {
    const data = await readData();
    const order = createSalesOrderDraft(data, req.body || {});
    await writeData(data);
    res.status(201).json({ success: true, message: 'Đã tạo đơn bán hàng nháp', data: order });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/api/sales-orders/:id/confirm', async (req, res) => {
  try {
    const data = await readData();
    const result = confirmSalesOrder(data, req.params.id);
    await writeData(data);
    res.json({ success: true, message: 'Đã xác nhận đơn bán hàng và xuất kho', data: result });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/api/sales-orders/:id/cancel', async (req, res) => {
  try {
    const data = await readData();
    const order = cancelSalesOrder(data, req.params.id, req.body && req.body.reason);
    await writeData(data);
    res.json({ success: true, message: 'Đã hủy đơn bán hàng', data: order });
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
