'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const SalesOrder = require('../models/SalesOrder');
const MasterOrder = require('../models/MasterOrder');
const ReturnOrder = require('../models/ReturnOrder');
const StockTransaction = require('../models/StockTransaction');
const ArLedger = require('../models/ArLedger');
const User = require('../models/User');
const { DeliveryEngine } = require('../engines/delivery.engine');

const router = express.Router();
const engine = new DeliveryEngine({ SalesOrder, MasterOrder, ReturnOrder, StockTransaction, ArLedger, User });

function jwtSecret() {
  return process.env.JWT_SECRET || process.env.MOBILE_JWT_SECRET || 'mk-pro-v45-mobile-secret-change-me';
}

function requireLogin(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ ok: false, success: false, message: 'Bạn chưa đăng nhập' });
  }

  try {
    req.user = jwt.verify(token, jwtSecret());
    req.mobileUser = req.user;
    return next();
  } catch (err) {
    return res.status(401).json({ ok: false, success: false, message: 'Phiên đăng nhập đã hết hạn' });
  }
}

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
    staffName
  };
}

function sendError(res, err, fallback) {
  const status = Number(err && err.status) || 500;
  return res.status(status).json({ ok: false, success: false, message: (err && err.message) || fallback || 'API giao hàng lỗi' });
}

router.get('/orders', requireLogin, async (req, res) => {
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

router.get('/returns', requireLogin, async (req, res) => {
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

router.post('/return', requireLogin, async (req, res) => {
  try {
    const body = bindDeliveryUser(req.body || {}, req.user);
    const result = await engine.saveReturn(body);
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

router.post('/payment', requireLogin, async (req, res) => {
  try {
    const body = bindDeliveryUser(req.body || {}, req.user);
    const result = await engine.savePayment(body);
    return res.json({ ok: true, success: true, message: result.message, order: result.order, allocation: result.allocation });
  } catch (err) {
    return sendError(res, err, 'Không lưu được tiền thu');
  }
});

router.post('/confirm', requireLogin, async (req, res) => {
  try {
    const body = bindDeliveryUser(req.body || {}, req.user);
    const result = await engine.confirm(body);
    return res.json({ ok: true, success: true, message: result.message, order: result.order });
  } catch (err) {
    return sendError(res, err, 'Không xác nhận được giao hàng');
  }
});

router.get('/reconciliation', requireLogin, async (req, res) => {
  try {
    const query = bindDeliveryUser(req.query || {}, req.user);
    const reconciliation = await engine.reconciliation(query);
    return res.json({ ok: true, success: true, reconciliation, summary: reconciliation });
  } catch (err) {
    return sendError(res, err, 'Không đối soát được giao hàng');
  }
});

module.exports = router;
