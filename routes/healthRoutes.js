const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    ok: true,
    message: 'Kho Minh Khai API đang chạy',
    routes: [
      'GET /',
      'GET /api',
      'GET /api/health',
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

module.exports = router;
