const express = require('express');
const router = express.Router();

const { readData } = require('../config/db');
const {
  summarizeSales,
  summarizePurchases,
  summarizeStock,
  summarizeReceivables,
  summarizeCash,
  buildDashboard
} = require('../services/reportService');

function sendError(res, error, status = 500) {
  return res.status(status).json({
    success: false,
    message: error.message || 'Lỗi báo cáo',
    details: error.details || undefined
  });
}

router.get('/api/reports/dashboard', async (req, res) => {
  try {
    const data = await readData();
    res.json({ success: true, data: buildDashboard(data, req.query || {}) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/api/reports/sales', async (req, res) => {
  try {
    const data = await readData();
    res.json({ success: true, data: summarizeSales(data, req.query || {}) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/api/reports/purchases', async (req, res) => {
  try {
    const data = await readData();
    res.json({ success: true, data: summarizePurchases(data, req.query || {}) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/api/reports/stock', async (req, res) => {
  try {
    const data = await readData();
    res.json({ success: true, data: summarizeStock(data, req.query || {}) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/api/reports/receivables', async (req, res) => {
  try {
    const data = await readData();
    res.json({ success: true, data: summarizeReceivables(data, req.query || {}) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/api/reports/cash', async (req, res) => {
  try {
    const data = await readData();
    res.json({ success: true, data: summarizeCash(data, req.query || {}) });
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
