'use strict';

const ExternalDebtOrderService = require('../services/ExternalDebtOrderService');

async function create(req, res) {
  try {
    const result = await ExternalDebtOrderService.createExternalDebtOrder(req.body || {}, req.user || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error, code: result.code });
    return res.status(result.idempotent ? 200 : 201).json({
      ok: true,
      source: 'ExternalDebtOrderService',
      message: result.message,
      order: result.order,
      arLedger: result.arLedger || null,
      idempotent: Boolean(result.idempotent)
    });
  } catch (err) {
    return res.status(err.status || 400).json({ ok: false, message: err.message || 'Không tạo được công nợ ngoài luồng' });
  }
}

async function list(req, res) {
  try {
    const result = await ExternalDebtOrderService.listExternalDebtOrders(req.query || {});
    return res.json({ ok: true, source: 'ExternalDebtOrderService', ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, message: process.env.NODE_ENV === 'production' ? 'Không tải được công nợ ngoài luồng' : (err.message || 'Không tải được công nợ ngoài luồng') });
  }
}

module.exports = { create, list };
