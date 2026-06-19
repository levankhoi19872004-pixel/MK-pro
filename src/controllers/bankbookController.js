'use strict';

const financialService = require('../services/financialService');

async function list(req, res) {
  try {
    const result = await financialService.listBankbook(req.query || {});
    res.json({ ok: true, source: 'mongo-route', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được sổ chuyển khoản từ MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

module.exports = { list };
