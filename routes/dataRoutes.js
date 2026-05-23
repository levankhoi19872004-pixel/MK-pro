'use strict';

const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const { readKhoData, saveKhoData } = require('../config/db');

router.get('/api/data', auth, async (req, res) => {
  try {
    const data = await readKhoData();
    res.json(data);
  } catch (err) {
    console.error('GET /api/data error:', err);
    res.status(500).json({ error: 'Không lấy được dữ liệu', detail: err.message });
  }
});

router.post('/api/data', auth, async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    // App mobile không được ghi đè toàn bộ DB. Mobile phải dùng API nghiệp vụ riêng.
    if (role === 'sales' || role === 'delivery') {
      return res.status(403).json({
        success: false,
        error: 'Mobile không được ghi đè toàn bộ dữ liệu',
        message: 'Hãy dùng API nghiệp vụ riêng như /api/mobile/sales/orders hoặc /api/mobile/delivery/...'
      });
    }
    const result = await saveKhoData(req.body || {});
    res.json({ success: true, data: result.data, storage: result.storage });
  } catch (err) {
    console.error('POST /api/data error:', err);
    res.status(500).json({ error: 'Không lưu được dữ liệu', detail: err.message });
  }
});

module.exports = router;
