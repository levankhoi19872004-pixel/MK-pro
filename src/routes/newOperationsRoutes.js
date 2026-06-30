'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const deliveryTodayNewService = require('../services/v2/deliveryTodayNew.service');
const debtNewService = require('../services/v2/debtNew.service');
const deliveryCloseoutCorrectionService = require('../services/deliveryCloseoutCorrection.service');
const DebtCollectionService = require('../services/DebtCollectionService');

const router = express.Router();
const readRoles = requireRole(['admin', 'manager', 'accountant', 'warehouse']);
const writeRoles = requireRole(['admin', 'manager', 'accountant']);

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


router.post('/delivery-today/closeouts/:id/corrections', requireAuth, writeRoles, async (req, res) => {
  try {
    const result = await deliveryCloseoutCorrectionService.createCorrection({
      ...(req.body || {}),
      originalCloseoutId: req.params.id,
      actor: req.user || {}
    }, { actor: req.user?.username || req.user?.name || req.user?.email || req.user?.role || 'accountant' });
    return res.json({
      ok: true,
      success: true,
      message: result.message || 'Đã tạo điều chỉnh closeout',
      correction: result.correction,
      newCloseout: result.newCloseout,
      newCloseoutVersion: result.newCloseoutVersion,
      arDebtAdjustmentLedger: result.arDebtAdjustmentLedger,
      data: result,
      canonicalRoute: '/api/new/delivery-today/closeouts/:id/corrections'
    });
  } catch (err) {
    return sendError(res, err, 'Không tạo được điều chỉnh closeout');
  }
});

router.get('/delivery-today/closeouts/:id/corrections', requireAuth, readRoles, async (req, res) => {
  try {
    const corrections = await deliveryCloseoutCorrectionService.listCorrections(req.params.id);
    return res.json({
      ok: true,
      success: true,
      corrections,
      rows: corrections,
      canonicalRoute: '/api/new/delivery-today/closeouts/:id/corrections'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được lịch sử điều chỉnh closeout');
  }
});

router.get('/delivery-today/closeouts/:id/versions', requireAuth, readRoles, async (req, res) => {
  try {
    const versions = await deliveryCloseoutCorrectionService.listVersions(req.params.id);
    return res.json({
      ok: true,
      success: true,
      versions,
      rows: versions,
      canonicalRoute: '/api/new/delivery-today/closeouts/:id/versions'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được closeout versions');
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

function debtCollectionResult(res, result = {}, successStatus = 200) {
  if (result && result.error) {
    return res.status(result.status || 400).json({
      ok: false,
      success: false,
      code: result.code || 'DEBT_COLLECTION_ERROR',
      message: result.error
    });
  }
  const status = result.statusCode || result.status || successStatus;
  const body = result.body || result;
  return res.status(status).json({ ok: true, success: true, ...body });
}

function actorForDebtCollection(req) {
  const user = req.user || {};
  const fallbackCode = user.staffCode || user.code || user.salesStaffCode || user.salesmanCode || user.deliveryStaffCode || user.shipperCode || user.username || user.email || user.name || 'web-accountant';
  return {
    ...user,
    staffCode: user.staffCode || user.code || fallbackCode,
    code: user.code || user.staffCode || fallbackCode
  };
}

router.get('/debt/collections', requireAuth, readRoles, async (req, res) => {
  try {
    const result = await DebtCollectionService.listDebtCollections(req.query || {});
    return res.json({
      ok: true,
      success: true,
      message: 'Đã tải phiếu thu công nợ (New)',
      items: result.items || [],
      collections: result.items || [],
      summary: result.summary || {},
      canonicalRoute: '/api/new/debt/collections'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được phiếu thu công nợ (New)');
  }
});

router.post('/debt/collections', requireAuth, writeRoles, async (req, res) => {
  try {
    const result = await DebtCollectionService.submitDebtCollection({
      body: req.body || {},
      mobileUser: actorForDebtCollection(req)
    });
    return debtCollectionResult(res, result, 201);
  } catch (err) {
    return sendError(res, err, 'Không tạo được phiếu thu công nợ (New)');
  }
});

router.post('/debt/collections/:id/confirm', requireAuth, writeRoles, async (req, res) => {
  try {
    const result = await DebtCollectionService.confirmDebtCollection(req.params.id, {
      ...(req.body || {}),
      user: actorForDebtCollection(req),
      accountingUserName: req.user?.name || req.user?.fullName || req.user?.username || req.user?.email || ''
    });
    return debtCollectionResult(res, result);
  } catch (err) {
    return sendError(res, err, 'Không xác nhận được phiếu thu công nợ (New)');
  }
});

router.post('/debt/collections/:id/reject', requireAuth, writeRoles, async (req, res) => {
  try {
    const result = await DebtCollectionService.rejectDebtCollection(req.params.id, {
      ...(req.body || {}),
      user: actorForDebtCollection(req),
      accountingUserName: req.user?.name || req.user?.fullName || req.user?.username || req.user?.email || ''
    });
    return debtCollectionResult(res, result);
  } catch (err) {
    return sendError(res, err, 'Không từ chối được phiếu thu công nợ (New)');
  }
});

module.exports = router;
