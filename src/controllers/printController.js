'use strict';

const printDocumentService = require('../services/printDocumentService');

function sendHtml(res, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
}

function idsFromBody(body = {}, fields = []) {
  for (const field of fields) {
    const value = body[field];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function sendError(res, err, fallback) {
  const status = Number(err?.status || err?.statusCode || 500);
  return res.status(status).json({
    ok: false,
    message: err?.message || fallback
  });
}

async function listTypes(req, res) {
  return res.json({ ok: true, printTypes: printDocumentService.listSupportedTypes() });
}

async function render(req, res) {
  try {
    const { type, document, options } = req.body || {};
    const result = printDocumentService.renderFromDocument(type, document, options || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    return sendHtml(res, result.html);
  } catch (err) {
    return sendError(res, err, 'Không render được mẫu in');
  }
}

async function renderById(req, res) {
  try {
    const result = await printDocumentService.renderById(
      String(req.params.type || '').trim(),
      String(req.params.id || '').trim(),
      req.query || {}
    );
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    return sendHtml(res, result.html);
  } catch (err) {
    return sendError(res, err, 'Không in được chứng từ');
  }
}

async function renderOrder(req, res) {
  try {
    const result = await printDocumentService.renderSalesOrder(String(req.params.id || '').trim(), req.query || {});
    return sendHtml(res, result.html);
  } catch (err) {
    return sendError(res, err, 'Không in được đơn bán');
  }
}

async function renderOrdersBatch(req, res) {
  try {
    const ids = idsFromBody(req.body || {}, ['salesOrderIds', 'orderIds', 'ids']);
    const result = await printDocumentService.renderSalesOrdersBatch(ids, req.query || {});
    return sendHtml(res, result.html);
  } catch (err) {
    return sendError(res, err, 'Không in được các đơn bán đã chọn');
  }
}

async function renderMasterOrder(req, res) {
  try {
    const result = await printDocumentService.renderMasterOrders([String(req.params.id || '').trim()], req.query || {});
    return sendHtml(res, result.html);
  } catch (err) {
    return sendError(res, err, 'Không in được đơn tổng');
  }
}

async function renderMasterOrdersBatch(req, res) {
  try {
    const ids = idsFromBody(req.body || {}, ['masterOrderIds', 'orderIds', 'ids']);
    const result = await printDocumentService.renderMasterOrders(ids, req.query || {});
    return sendHtml(res, result.html);
  } catch (err) {
    return sendError(res, err, 'Không in được các đơn tổng đã chọn');
  }
}

async function renderImportOrder(req, res) {
  try {
    const result = await printDocumentService.renderImportOrders([String(req.params.id || '').trim()], req.query || {});
    return sendHtml(res, result.html);
  } catch (err) {
    return sendError(res, err, 'Không in được phiếu nhập');
  }
}

async function renderImportOrdersAggregate(req, res) {
  try {
    const ids = idsFromBody(req.body || {}, ['importOrderIds', 'orderIds', 'ids']);
    const result = await printDocumentService.renderImportOrders(ids, req.query || {});
    return sendHtml(res, result.html);
  } catch (err) {
    return sendError(res, err, 'Không in được các phiếu nhập đã chọn');
  }
}

async function renderMasterReturnOrder(req, res) {
  try {
    const result = await printDocumentService.renderMasterReturnOrder(String(req.params.id || '').trim(), req.query || {});
    return sendHtml(res, result.html);
  } catch (err) {
    return sendError(res, err, 'Không in được đơn tổng trả hàng');
  }
}

async function renderMasterReturnOrdersBatch(req, res) {
  try {
    const ids = idsFromBody(req.body || {}, ['masterReturnOrderIds', 'orderIds', 'ids']);
    const result = await printDocumentService.renderMasterReturnOrdersBatch(ids, req.query || {});
    return sendHtml(res, result.html);
  } catch (err) {
    return sendError(res, err, 'Không in được các đơn tổng trả đã chọn');
  }
}

async function renderPaymentReceipt(req, res) {
  req.params.type = 'PAYMENT_RECEIPT';
  return renderById(req, res);
}

module.exports = {
  listTypes,
  render,
  renderById,
  renderOrder,
  renderOrdersBatch,
  renderMasterOrder,
  renderMasterOrdersBatch,
  renderImportOrder,
  renderImportOrdersAggregate,
  renderMasterReturnOrder,
  renderMasterReturnOrdersBatch,
  renderPaymentReceipt
};
