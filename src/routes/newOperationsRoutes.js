'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const deliveryTodayNewService = require('../services/v2/deliveryTodayNew.service');
const debtNewService = require('../services/v2/debtNew.service');
const deliveryCloseoutCorrectionService = require('../services/deliveryCloseoutCorrection.service');
const DebtCollectionService = require('../services/DebtCollectionService');
const AccountingCloseoutService = require('../services/accounting/AccountingCloseoutService');
const { buildSourceNote } = require('../services/source-contracts/SourceNoteBuilder');

const router = express.Router();
const readRoles = requireRole(['admin', 'manager', 'accountant', 'warehouse']);
const writeRoles = requireRole(['admin', 'manager', 'accountant']);
const closeoutRoles = requireRole(['admin', 'accountant']);


function sourceUser(req = {}) {
  return req.user || {};
}

function buildApiSourceNote(code, req = {}, warnings = []) {
  return buildSourceNote(code, {
    filters: req.query || req.body || {},
    user: sourceUser(req),
    sourceWarnings: warnings
  });
}

function sendError(res, err, fallback) {
  const status = Number(err && err.status) || 500;
  return res.status(status).json({
    ok: false,
    success: false,
    code: err && err.code ? err.code : `NEW_OPS_${status}`,
    message: err && err.message ? err.message : fallback
  });
}

router.get('/delivery-today/suggestions', requireAuth, readRoles, async (req, res) => {
  try {
    const result = await deliveryTodayNewService.suggestions(req.query || {});
    return res.json({
      ok: true,
      success: true,
      message: 'Đã tải gợi ý Đơn giao hôm nay (New)',
      items: result.items || [],
      diagnostics: result.diagnostics,
      canonicalRoute: '/api/new/delivery-today/suggestions'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được gợi ý Đơn giao hôm nay (New)');
  }
});

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
      sourceNote: result.sourceNote || buildApiSourceNote('delivery-today-orders', req),
      sourceNotes: result.sourceNotes || { orders: buildApiSourceNote('delivery-today-orders', req), byStaff: buildApiSourceNote('delivery-today-by-staff', req), collections: buildApiSourceNote('delivery-today-collections', req), returns: buildApiSourceNote('delivery-today-returns', req) },
      canonicalRoute: '/api/new/delivery-today/orders'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được Đơn giao hôm nay (New)');
  }
});

router.post('/delivery-today/closeout', requireAuth, closeoutRoles, async (req, res) => {
  try {
    const body = req.body || {};
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds.map((value) => String(value || '').trim()).filter(Boolean) : [];
    if (!orderIds.length) {
      return res.status(400).json({ ok: false, success: false, code: 'ORDER_SELECTION_REQUIRED', message: 'Vui lòng chọn ít nhất một đơn để chốt sổ.' });
    }
    const reason = String(body.reason || body.note || '').trim();
    if (!reason) {
      return res.status(400).json({ ok: false, success: false, code: 'DELIVERY_CLOSEOUT_REASON_REQUIRED', message: 'Vui lòng nhập lý do chốt sổ giao hàng.' });
    }
    const actor = req.user?.username || req.user?.name || req.user?.email || req.user?.role || 'accountant';
    const result = await AccountingCloseoutService.confirmDeliveryAccounting({
      ...body,
      date: body.date || body.deliveryDate,
      confirmedBy: actor,
      accountantName: actor,
      reason
    });
    if (result && result.error) {
      return res.status(result.status || 400).json({ ok: false, success: false, code: result.code || 'DELIVERY_CLOSEOUT_REJECTED', message: result.error, data: result });
    }
    const rows = Array.isArray(result && result.results) ? result.results : [];
    const debtLedgerCreated = rows.filter((row) => row.arDebtOpen && row.arDebtOpen.posted).length;
    const idempotentLedgers = rows.filter((row) => row.arDebtOpen && row.arDebtOpen.idempotent).length;
    const skippedZeroDebt = rows.filter((row) => row.arDebtOpen && row.arDebtOpen.skipped && row.arDebtOpen.reason === 'zero_final_debt').length;
    const overpaymentWarnings = [
      ...((result && Array.isArray(result.warnings)) ? result.warnings : []),
      ...rows.filter((row) => row.arDebtOpen && row.arDebtOpen.exception).map((row) => ({ orderId: row.orderId, reason: row.arDebtOpen.reason, overpaymentAmount: row.arDebtOpen.overpaymentAmount }))
    ];
    const totalDebtPosted = rows.reduce((sum, row) => {
      const entry = row.arDebtOpen && row.arDebtOpen.entry;
      const amount = entry ? Number(entry.amount || entry.debit || 0) : 0;
      return sum + (Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0);
    }, 0);
    const closeoutId = `DTC-${String(body.date || body.deliveryDate || '').replace(/[^0-9]/g, '') || 'DATE'}-${String(body.deliveryStaffCode || body.delivery || 'ALL').replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}`;
    return res.json({
      ok: true,
      success: true,
      message: 'Đã chốt sổ giao hàng',
      closeoutId,
      checkedOrders: result.totalOrders || rows.length,
      closedOrders: result.confirmedOrders || 0,
      skippedOrders: result.skippedOrders || 0,
      debtLedgerCreated,
      idempotentLedgers,
      skippedZeroDebt,
      totalDebtPosted,
      warnings: overpaymentWarnings,
      diagnostics: result.diagnostics || [],
      data: { ...result, closeoutId, debtLedgerCreated, idempotentLedgers, skippedZeroDebt, totalDebtPosted, warnings: overpaymentWarnings, diagnostics: result.diagnostics || [] },
      canonicalRoute: '/api/new/delivery-today/closeout'
    });
  } catch (err) {
    return sendError(res, err, 'Không chốt được sổ giao hàng');
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


router.get('/debt/suggestions', requireAuth, readRoles, async (req, res) => {
  try {
    const result = await debtNewService.suggestions(req.query || {});
    return res.json({
      ok: true,
      success: true,
      message: 'Đã tải gợi ý Công nợ (New)',
      items: result.items || [],
      diagnostics: result.diagnostics,
      sourceNote: result.sourceNote || buildApiSourceNote('debt-current', req),
      canonicalRoute: '/api/new/debt/suggestions'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được gợi ý Công nợ (New)');
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
      sourceNote: result.sourceNote || buildApiSourceNote('debt-by-customer', req),
      canonicalRoute: '/api/new/debt/customers'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được Công nợ (New)');
  }
});

router.get('/debt/customers/:customerCode/detail', requireAuth, readRoles, async (req, res) => {
  try {
    const customerCode = String(req.params.customerCode || '').trim();
    if (!customerCode) {
      return res.status(400).json({ ok: false, success: false, code: 'CUSTOMER_CODE_REQUIRED', message: 'Vui lòng chọn khách hàng để xem chi tiết công nợ.' });
    }
    const result = await debtNewService.customerDetail({ ...(req.query || {}), customerCode });
    return res.json({
      ok: true,
      success: true,
      message: 'Đã tải chi tiết Công nợ (New)',
      data: result,
      customer: result.customer,
      debtOrders: result.debtOrders,
      movements: result.movements,
      pendingCollections: result.pendingCollections,
      diagnostics: result.diagnostics,
      sourceNote: result.sourceNote || buildApiSourceNote('debt-ledger', req),
      canonicalRoute: '/api/new/debt/customers/:customerCode/detail'
    });
  } catch (err) {
    return sendError(res, err, 'Không tải được chi tiết Công nợ (New)');
  }
});

function debtCollectionResult(res, result = {}, successStatus = 200) {
  if (result && result.error) {
    return res.status(result.status || 400).json({
      ok: false,
      success: false,
      code: result.code || 'DEBT_COLLECTION_ERROR',
      message: result.error,
      detail: result.detail
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
      sourceNote: buildApiSourceNote('debt-receipts', req),
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
