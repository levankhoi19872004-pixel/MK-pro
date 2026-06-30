'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const deliveryTodayNewService = require('../services/v2/deliveryTodayNew.service');
const debtNewService = require('../services/v2/debtNew.service');

const router = express.Router();
const readRoles = requireRole(['admin', 'manager', 'accountant', 'warehouse']);

function sendError(res, err, fallback) {
  const status = Number(err && err.status) || 500;
  return res.status(status).json({
    ok: false,
    success: false,
    code: err && err.code ? err.code : `NEW_OPS_${status}`,
    message: err && err.message ? err.message : fallback
  });
}

router.get('/delivery-today/orders', requireAuth, readRoles, async (req, res) => {
  try {
    const result = await deliveryTodayNewService.listOrders(req.query || {});
    return res.json({
      ok: true,
      success: true,
      message: 'Đã tải Đơn giao hôm nay (New)',
      data: result,
      rows: result.rows,
      orders: result.orders,
      summary: result.summary,
      diagnostics: result.diagnostics,
      canonicalRoute: '/api/new/delivery-today/orders'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được Đơn giao hôm nay (New)');
  }
});

router.get('/debt/customers', requireAuth, readRoles, async (req, res) => {
  try {
    const result = await debtNewService.listCustomers(req.query || {});
    return res.json({
      ok: true,
      success: true,
      message: 'Đã tải Công nợ (New)',
      data: result,
      customers: result.customers,
      orders: result.orders,
      summary: result.summary,
      diagnostics: result.diagnostics,
      canonicalRoute: '/api/new/debt/customers'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được Công nợ (New)');
  }
});

module.exports = router;
