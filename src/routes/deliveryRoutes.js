'use strict';

const express = require('express');
const SalesOrder = require('../models/SalesOrder');
const MasterOrder = require('../models/MasterOrder');
const ReturnOrder = require('../models/ReturnOrder');
const StockTransaction = require('../models/StockTransaction');
const ArLedger = require('../models/ArLedger');
const { DeliveryEngine } = require('../engines/delivery.engine');

const router = express.Router();
const engine = new DeliveryEngine({ SalesOrder, MasterOrder, ReturnOrder, StockTransaction, ArLedger });

function sendError(res, err, fallback) {
  const status = Number(err && err.status) || 500;
  return res.status(status).json({ ok: false, success: false, message: (err && err.message) || fallback || 'API giao hàng lỗi' });
}

router.get('/orders', async (req, res) => {
  try {
    const result = await engine.listOrders(req.query || {});
    return res.json({
      ok: true,
      success: true,
      orders: result.rows,
      rows: result.rows,
      items: result.rows,
      total: result.rows.length,
      summary: result.summary,
      reconciliation: result.reconciliation,
      source: 'delivery-engine'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được đơn giao hàng');
  }
});

router.post('/return', async (req, res) => {
  try {
    const result = await engine.saveReturn(req.body || {});
    return res.json({ ok: true, success: true, message: result.message, order: result.order, returnOrder: result.returnOrder });
  } catch (err) {
    return sendError(res, err, 'Không lưu được hàng trả');
  }
});

router.post('/payment', async (req, res) => {
  try {
    const result = await engine.savePayment(req.body || {});
    return res.json({ ok: true, success: true, message: result.message, order: result.order, allocation: result.allocation });
  } catch (err) {
    return sendError(res, err, 'Không lưu được tiền thu');
  }
});

router.post('/confirm', async (req, res) => {
  try {
    const result = await engine.confirm(req.body || {});
    return res.json({ ok: true, success: true, message: result.message, order: result.order });
  } catch (err) {
    return sendError(res, err, 'Không xác nhận được giao hàng');
  }
});

router.get('/reconciliation', async (req, res) => {
  try {
    const reconciliation = await engine.reconciliation(req.query || {});
    return res.json({ ok: true, success: true, reconciliation, summary: reconciliation });
  } catch (err) {
    return sendError(res, err, 'Không đối soát được giao hàng');
  }
});

module.exports = router;
