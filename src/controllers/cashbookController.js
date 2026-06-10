'use strict';

const financialService = require('../services/financialService');

async function list(req, res) {
  try {
    const result = await financialService.listCashbook(req.query || {});
    res.json({ ok: true, source: 'mongo-route', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được sổ quỹ từ MongoDB', error: err.message });
  }
}

async function create(req, res) {
  try {
    const result = await financialService.createCashbook(req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.status(201).json({ ok: true, source: 'mongo-route', message: `Đã ghi sổ tiền mặt ${result.entry.code}`, entry: result.entry, cashbook: result.entry });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không ghi được sổ tiền mặt' });
  }
}

module.exports = { list, create };
