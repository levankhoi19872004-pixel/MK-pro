'use strict';

const printDocumentService = require('../services/printDocumentService');

function sendHtml(res, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
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
    const result = await printDocumentService.renderById(String(req.params.type || '').trim(), String(req.params.id || '').trim());
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    return sendHtml(res, result.html);
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Không in được chứng từ', error: err.message });
  }
}

module.exports = { render, renderById };
