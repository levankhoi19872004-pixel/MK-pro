'use strict';

const reportService = require('../services/reportService');

async function stock(req, res) {
  try {
    const result = await reportService.stockReport(req.query);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được báo cáo tồn kho', error: err.message });
  }
}

async function debts(req, res) {
  try {
    const result = await reportService.debtReport(req.query);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được báo cáo công nợ', error: err.message });
  }
}

module.exports = { stock, debts };
