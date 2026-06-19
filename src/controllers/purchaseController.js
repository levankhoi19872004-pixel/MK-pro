'use strict';

const PurchaseService = require('../services/purchase/PurchaseService');

function context(req) {
  return { tenantId: req.tenantId, actor: req.user || {} };
}

function sendError(res, error, fallback) {
  return res.status(error.status || error.statusCode || 400).json({
    ok: false,
    success: false,
    code: error.code,
    message: error.message || fallback
  });
}

async function list(req, res) {
  try {
    const items = await PurchaseService.listPurchaseOrders(req.query, context(req));
    return res.json({ ok: true, success: true, items });
  } catch (error) {
    return sendError(res, error, 'Không tải được đơn mua');
  }
}

async function get(req, res) {
  try {
    const item = await PurchaseService.getPurchaseOrder(req.params.id, context(req));
    if (!item) return res.status(404).json({ ok: false, success: false, message: 'Không tìm thấy đơn mua' });
    return res.json({ ok: true, success: true, item });
  } catch (error) {
    return sendError(res, error, 'Không tải được đơn mua');
  }
}

async function create(req, res) {
  try {
    const item = await PurchaseService.createPurchaseOrder(req.body, context(req));
    return res.status(201).json({ ok: true, success: true, item });
  } catch (error) {
    return sendError(res, error, 'Không tạo được đơn mua');
  }
}

async function approve(req, res) {
  try {
    const item = await PurchaseService.approvePurchaseOrder(req.params.id, req.body, context(req));
    return res.json({ ok: true, success: true, item });
  } catch (error) {
    return sendError(res, error, 'Không duyệt được đơn mua');
  }
}

async function receive(req, res) {
  try {
    const receipt = await PurchaseService.receivePurchaseOrder(req.params.id, req.body, context(req));
    return res.status(201).json({ ok: true, success: true, receipt });
  } catch (error) {
    return sendError(res, error, 'Không nhận được hàng');
  }
}

async function pay(req, res) {
  try {
    const payment = await PurchaseService.paySupplier(req.body, context(req));
    return res.status(201).json({ ok: true, success: true, payment });
  } catch (error) {
    return sendError(res, error, 'Không thanh toán được nhà cung cấp');
  }
}

async function createReturn(req, res) {
  try {
    const purchaseReturn = await PurchaseService.createPurchaseReturn(req.body, context(req));
    return res.status(201).json({ ok: true, success: true, purchaseReturn });
  } catch (error) {
    return sendError(res, error, 'Không tạo được phiếu trả nhà cung cấp');
  }
}


async function receipts(req, res) {
  try {
    const items = await PurchaseService.listGoodsReceipts(req.query, context(req));
    return res.json({ ok: true, success: true, items });
  } catch (error) {
    return sendError(res, error, 'Không tải được phiếu nhập hàng');
  }
}

async function returns(req, res) {
  try {
    const items = await PurchaseService.listPurchaseReturns(req.query, context(req));
    return res.json({ ok: true, success: true, items });
  } catch (error) {
    return sendError(res, error, 'Không tải được phiếu trả nhà cung cấp');
  }
}

async function payables(req, res) {
  try {
    const items = await PurchaseService.listSupplierPayables(req.query, context(req));
    return res.json({ ok: true, success: true, items });
  } catch (error) {
    return sendError(res, error, 'Không tải được công nợ nhà cung cấp');
  }
}

module.exports = { list, get, create, approve, receive, pay, createReturn, receipts, returns, payables };
