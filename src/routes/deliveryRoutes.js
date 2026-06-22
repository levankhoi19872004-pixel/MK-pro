'use strict';

const express = require('express');
const SalesOrder = require('../models/SalesOrder');
const MasterOrder = require('../models/MasterOrder');
const ReturnOrder = require('../models/ReturnOrder');
const StockTransaction = require('../models/StockTransaction');
const ArLedger = require('../models/ArLedger');
const User = require('../models/User');
const { DeliveryEngine } = require('../engines/delivery.engine');
const deliveryReconciliationService = require('../services/deliveryReconciliation.service');
const deliveryRouteTrackingService = require('../services/deliveryRouteTracking.service');
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

function buildErrorPayload(err, fallback) {
  const status = Number(err && err.status) || 500;
  const code = (err && err.code) || `DELIVERY_${status}`;
  return {
    ok: false,
    success: false,
    message: (err && err.message) || fallback || 'API giao hàng lỗi',
    error: code
  };
}

function sendError(res, err, fallback) {
  const status = Number(err && err.status) || 500;
  return res.status(status).json(buildErrorPayload(err, fallback));
}

router.get('/orders', requireAuth, deliveryReadRoles, async (req, res) => {
  try {
    const query = bindDeliveryUser(req.query || {}, req.user);
    const result = await engine.listOrders(query);
    return res.json({
      ok: true,
      success: true,
      message: 'Đã tải đơn giao hàng',
      data: {
        orders: result.rows,
        rows: result.rows,
        items: result.rows,
        total: result.rows.length,
        summary: result.summary,
        reconciliation: result.reconciliation
      },
      orders: result.rows,
      rows: result.rows,
      items: result.rows,
      total: result.rows.length,
      summary: result.summary,
      reconciliation: result.reconciliation,
      source: 'delivery-engine',
      canonicalRoute: '/api/delivery/orders'
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
      message: 'Đã tải danh sách hàng trả',
      data: {
        returns: result.rows,
        returnOrders: result.rows,
        rows: result.rows,
        total: result.rows.length,
        summary: result.summary
      },
      returns: result.rows,
      returnOrders: result.rows,
      rows: result.rows,
      total: result.rows.length,
      summary: result.summary,
      source: 'returnOrders',
      canonicalRoute: '/api/delivery/returns'
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
      message: result.message || 'Đã lưu hàng trả',
      data: { order, returnOrder: result.returnOrder, returns: rows, returnOrders: rows, rows },
      order,
      returnOrder: result.returnOrder,
      returns: rows,
      returnOrders: rows,
      rows,
      source: 'returnOrders',
      canonicalRoute: '/api/delivery/return'
    });
  } catch (err) {
    return sendError(res, err, 'Không lưu được hàng trả');
  }
});

router.post('/payment', requireAuth, deliveryWriteRoles, async (req, res) => {
  try {
    const body = bindDeliveryUser(req.body || {}, req.user);
    const result = await withMongoTransaction((session) => engine.savePayment(body, { session }));
    return res.json({
      ok: true,
      success: true,
      message: result.message || 'Đã lưu tiền thu',
      data: { order: result.order, allocation: result.allocation },
      order: result.order,
      allocation: result.allocation,
      source: 'delivery-engine',
      canonicalRoute: '/api/delivery/payment'
    });
  } catch (err) {
    return sendError(res, err, 'Không lưu được tiền thu');
  }
});

router.post('/confirm', requireAuth, deliveryWriteRoles, async (req, res) => {
  try {
    const body = bindDeliveryUser(req.body || {}, req.user);
    const result = await withMongoTransaction((session) => engine.confirm(body, { session }));
    return res.json({
      ok: true,
      success: true,
      message: result.message || 'Đã xác nhận giao hàng',
      data: { order: result.order },
      order: result.order,
      source: 'delivery-engine',
      canonicalRoute: '/api/delivery/confirm'
    });
  } catch (err) {
    return sendError(res, err, 'Không xác nhận được giao hàng');
  }
});

router.get('/reconciliation', requireAuth, deliveryReadRoles, async (req, res) => {
  try {
    const query = bindDeliveryUser(req.query || {}, req.user);
    const report = await deliveryReconciliationService.buildDeliveryReconciliationReport(query);
    return res.json({
      ok: true,
      success: true,
      message: 'Đã tải báo cáo đối soát cuối ngày',
      data: report,
      reconciliation: report.summary,
      summary: report.summary,
      orders: report.orders,
      returns: report.returns,
      collections: report.collections,
      fundLedgers: report.fundLedgers,
      source: 'delivery-reconciliation-report',
      canonicalRoute: '/api/delivery/reconciliation'
    });
  } catch (err) {
    return sendError(res, err, 'Không đối soát được giao hàng');
  }
});


router.get('/routes/live', requireAuth, deliveryReadRoles, async (req, res) => {
  try {
    const result = await deliveryRouteTrackingService.liveRoutesAdmin({ query: req.query || {}, user: req.user || {} });
    return res.json({
      ok: true,
      success: true,
      message: result.message || 'Đã tải tuyến giao hàng đang chạy',
      data: result.data,
      sessions: result.data?.sessions || [],
      total: result.data?.total || 0,
      canonicalRoute: '/api/delivery/routes/live'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được tuyến giao hàng đang chạy');
  }
});

router.get('/routes/:sessionId', requireAuth, deliveryReadRoles, async (req, res) => {
  try {
    const result = await deliveryRouteTrackingService.getRouteAdmin({ params: req.params || {}, user: req.user || {} });
    return res.json({
      ok: true,
      success: true,
      message: result.message || 'Đã tải chi tiết tuyến giao hàng',
      data: result.data,
      session: result.data?.session,
      points: result.data?.points || [],
      canonicalRoute: '/api/delivery/routes/:sessionId'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được chi tiết tuyến giao hàng');
  }
});

router.get('/routes', requireAuth, deliveryReadRoles, async (req, res) => {
  try {
    const result = await deliveryRouteTrackingService.listRoutesAdmin({ query: req.query || {}, user: req.user || {} });
    return res.json({
      ok: true,
      success: true,
      message: result.message || 'Đã tải danh sách tuyến giao hàng',
      data: result.data,
      sessions: result.data?.sessions || [],
      total: result.data?.total || 0,
      canonicalRoute: '/api/delivery/routes'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được danh sách tuyến giao hàng');
  }
});

module.exports = router;
