const express = require('express');
const router = express.Router();

const { readData, writeData } = require('../config/db');
const { calculateInventory } = require('../services/inventoryService');
const {
  listWarehouseReceipts,
  getWarehouseReceipt,
  previewWarehouseReceipt,
  createReceiptDraft,
  confirmWarehouseReceipt,
  cancelWarehouseReceipt
} = require('../services/warehouseReceiptService');

function sendError(res, error, status = 400) {
  return res.status(status).json({
    success: false,
    message: error.message,
    details: error.details || undefined
  });
}

router.get('/api/warehouse-receipts', async (req, res) => {
  try {
    const data = await readData();
    const receipts = listWarehouseReceipts(data, req.query);
    res.json({ success: true, data: receipts });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get('/api/warehouse-receipts/:id', async (req, res) => {
  try {
    const data = await readData();
    const receipt = getWarehouseReceipt(data, req.params.id);

    if (!receipt) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu nhập' });
    }

    res.json({ success: true, data: receipt });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.post('/api/warehouse-receipts/preview', async (req, res) => {
  try {
    const data = await readData();
    const preview = previewWarehouseReceipt(data, req.body || {});
    res.json({ success: true, data: preview });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/api/warehouse-receipts', async (req, res) => {
  try {
    const data = await readData();
    const receipt = createReceiptDraft(data, req.body || {});
    await writeData(data);
    res.json({ success: true, message: 'Đã tạo phiếu nhập nháp', data: receipt });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/api/warehouse-receipts/:id/confirm', async (req, res) => {
  try {
    const data = await readData();
    const result = confirmWarehouseReceipt(data, req.params.id);
    await writeData(data);
    res.json({ success: true, message: 'Đã xác nhận phiếu nhập và tăng tồn kho', data: result });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/api/warehouse-receipts/:id/cancel', async (req, res) => {
  try {
    const data = await readData();
    const receipt = cancelWarehouseReceipt(data, req.params.id, req.body && req.body.reason);
    await writeData(data);
    res.json({ success: true, message: 'Đã hủy phiếu nhập', data: receipt });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/api/inventory', async (req, res) => {
  try {
    const data = await readData();
    const inventory = calculateInventory(data, req.query);
    res.json({ success: true, data: inventory });
  } catch (error) {
    sendError(res, error, 500);
  }
});

module.exports = router;
