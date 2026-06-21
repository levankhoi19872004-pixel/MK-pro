'use strict';

const express = require('express');
const SalesOrder = require('../models/SalesOrder');
const MasterOrder = require('../models/MasterOrder');
const ReturnOrder = require('../models/ReturnOrder');
const StockTransaction = require('../models/StockTransaction');
const ArLedger = require('../models/ArLedger');
const User = require('../models/User');
const { DeliveryEngine } = require('../engines/delivery.engine');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const { withMongoTransaction } = require('../utils/transaction.util');

const router = express.Router();
const engine = new DeliveryEngine({ SalesOrder, MasterOrder, ReturnOrder, StockTransaction, ArLedger, User });
const deliveryReadRoles = requireRole(['delivery', 'admin', 'manager', 'accountant']);
const deliveryWriteRoles = requireRole(['delivery', 'admin', 'manager']);

function bindDeliveryUser(input = {}, user = {}) {
  const role = String(user.role || '').toLowerCase();

  if (role !== 'delivery') {
    return { ...input };
  }

  const staffCode = String(user.staffCode || user.code || '').trim();
  const staffName = String(user.fullName || user.name || '').trim();

  return {
    ...input,
    deliveryStaffCode: staffCode,
    deliveryStaffName: staffName,
    staffCode,
    staffName,
    actorDeliveryStaffCode: staffCode,
    actorStaffCode: staffCode,
    enforceDeliveryOwnership: true
  };
}

function sendError(res, err, fallback) {
  const status = Number(err && err.status) || 500;
  return res.status(status).json({ ok: false, success: false, message: (err && err.message) || fallback || 'API giao hàng lỗi' });
}

router.get('/orders', requireAuth, deliveryReadRoles, async (req, res) => {
  try {
    const query = bindDeliveryUser(req.query || {}, req.user);
    const result = await engine.listOrders(query);
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

router.get('/returns', requireAuth, deliveryReadRoles, async (req, res) => {
  try {
    const query = bindDeliveryUser(req.query || {}, req.user);
    const result = await engine.listReturns(query);
    return res.json({
      ok: true,
      success: true,
      returns: result.rows,
      returnOrders: result.rows,
      rows: result.rows,
      total: result.rows.length,
      summary: result.summary,
      source: 'returnOrders'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được danh sách hàng trả');
  }
});

router.post('/return', requireAuth, deliveryWriteRoles, async (req, res) => {
  try {
    const body = bindDeliveryUser(req.body || {}, req.user);
    const result = await withMongoTransaction((session) => engine.saveReturn(body, { session }));
    const order = result.order || {};
    const rows = result.rows || result.returns || result.returnOrders || [];
    return res.json({
      ok: true,
      success: true,
      message: result.message,
      order,
      returnOrder: result.returnOrder,
      returns: rows,
      returnOrders: rows,
      rows,
      source: 'returnOrders'
    });
  } catch (err) {
    return sendError(res, err, 'Không lưu được hàng trả');
  }
});

router.post('/payment', requireAuth, deliveryWriteRoles, async (req, res) => {
  try {
    const body = bindDeliveryUser(req.body || {}, req.user);
    const result = await withMongoTransaction((session) => engine.savePayment(body, { session }));
    return res.json({ ok: true, success: true, message: result.message, order: result.order, allocation: result.allocation });
  } catch (err) {
    return sendError(res, err, 'Không lưu được tiền thu');
  }
});

router.post('/confirm', requireAuth, deliveryWriteRoles, async (req, res) => {
  try {
    const body = bindDeliveryUser(req.body || {}, req.user);
    const result = await withMongoTransaction((session) => engine.confirm(body, { session }));
    return res.json({ ok: true, success: true, message: result.message, order: result.order });
  } catch (err) {
    return sendError(res, err, 'Không xác nhận được giao hàng');
  }
});

router.get('/reconciliation', requireAuth, deliveryReadRoles, async (req, res) => {
  try {
    const query = bindDeliveryUser(req.query || {}, req.user);
    const reconciliation = await engine.reconciliation(query);
    return res.json({ ok: true, success: true, reconciliation, summary: reconciliation });
  } catch (err) {
    return sendError(res, err, 'Không đối soát được giao hàng');
  }
});

module.exports = router;
