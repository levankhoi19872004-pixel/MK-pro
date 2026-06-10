'use strict';

const printDocumentService = require('../services/printDocumentService');

function sendHtml(res, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
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
    return res.status(500).json({ ok: false, message: 'Không render được mẫu in', error: err.message });
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
    return res.status(500).json({ ok: false, message: 'Không in được chứng từ', error: err.message });
  }
}

async function renderOrder(req, res) {
  req.params.type = 'ORDER_SINGLE';
  return renderById(req, res);
}

async function renderMasterOrder(req, res) {
  req.params.type = 'ORDER_TOTAL';
  return renderById(req, res);
}

async function renderImportOrder(req, res) {
  req.params.type = 'IMPORT_ORDER';
  return renderById(req, res);
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
  renderMasterOrder,
  renderImportOrder,
  renderPaymentReceipt
};
