'use strict';

const express = require('express');
const router = express.Router();
const { getDBStatus, readKhoData } = require('../config/db');

router.get('/', (req, res) => {
  res.json({
    ok: true,
    message: 'Kho Minh Khai API đang chạy',
    routes: [
      'GET /',
      'GET /api',
      'GET /api/health',
      'GET /api/db-status',
      'POST /api/login',
      'POST /api/logout',
      'GET /api/data',
      'POST /api/data',
      'POST /api/pay-order',
      'GET /api/debt-report'
    ]
  });
});

router.get('/api', (req, res) => {
  res.json({
    ok: true,
    message: 'API hoạt động bình thường'
  });
});

router.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString()
  });
});

router.get('/api/db-status', async (req, res) => {
  try {
    const status = getDBStatus();
    if (status.storage === 'mongodb') {
      // Đọc thử 1 lần để chắc chắn MongoDB thật sự truy cập được.
      const data = await readKhoData();
      return res.json({
        ...status,
        ok: true,
        connected: true,
        counts: {
          products: Array.isArray(data.products) ? data.products.length : 0,
          inventory: Array.isArray(data.inventory) ? data.inventory.length : 0,
          orders: Array.isArray(data.orders) ? data.orders.length : 0,
          receipts: Array.isArray(data.receipts) ? data.receipts.length : 0,
          purchaseReceipts: Array.isArray(data.purchaseReceipts) ? data.purchaseReceipts.length : 0
        }
      });
    }
    res.status(503).json({
      ...status,
      ok: false,
      message: 'MONGO_URI chưa hợp lệ nên server đang chạy tạm bằng RAM. Dữ liệu sẽ mất khi restart.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      storage: 'mongodb',
      message: 'Không kiểm tra được MongoDB',
      detail: err.message
    });
  }
});

module.exports = router;
