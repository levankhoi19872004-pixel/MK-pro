const express = require('express');
const router = express.Router();

const { readData, writeData } = require('../config/db');
const {
  createPayment,
  cancelPayment,
  listReceivableLedger,
  getReceivableSummary
} = require('../services/receivableService');

function sendError(res, error, status = 400) {
  return res.status(status).json({
    success: false,
    message: error.message,
    details: error.details || undefined
  });
}

router.get('/api/receivables/summary', async (req, res) => {
  try {
    const data = await readData();
    const summary = getReceivableSummary(data, req.query);
    res.json({ success: true, data: summary });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get('/api/receivables/ledger', async (req, res) => {
  try {
    const data = await readData();
    const ledger = listReceivableLedger(data, req.query);
    res.json({ success: true, total: ledger.length, data: ledger });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.post('/api/receivables/payments', async (req, res) => {
  try {
    const data = await readData();
    const result = createPayment(data, req.body || {});
    await writeData(data);
    res.status(201).json({ success: true, message: 'Đã ghi nhận thu công nợ', data: result });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/api/receivables/payments/:id/cancel', async (req, res) => {
  try {
    const data = await readData();
    const result = cancelPayment(data, req.params.id, req.body && req.body.reason);
    await writeData(data);
    res.json({ success: true, message: 'Đã hủy phiếu thu công nợ', data: result });
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
