'use strict';

const financialService = require('../services/financialService');

async function list(req, res) {
  try {
    const receipts = await financialService.listReceipts(req.query || {});
    res.json({ ok: true, source: 'mongo-route', receipts });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được phiếu thu từ MongoDB', error: err.message });
  }
}

async function create(req, res) {
  try {
    const result = await financialService.createReceipt(req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.status(201).json({ ok: true, source: 'mongo-route', message: `Đã tạo phiếu thu ${result.receipt.code}`, receipt: result.receipt });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được phiếu thu' });
  }
}

async function remove(req, res) {
  try {
    const result = await financialService.voidReceipt(req.params.id, req.body || {}, req.query || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: `Đã hủy phiếu thu ${result.receipt.code}`, receipt: result.receipt });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không hủy được phiếu thu' });
  }
}

module.exports = { list, create, remove };
