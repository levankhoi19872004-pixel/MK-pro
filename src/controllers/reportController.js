'use strict';

const reportService = require('../services/reportService');
const asyncHandler = require('../middlewares/asyncHandler');

const stock = asyncHandler(async (req, res) => {
  const result = await reportService.stockReport(req.query);
  res.json({ ok: true, ...result });
});

const debts = asyncHandler(async (req, res) => {
  const result = await reportService.debtReport(req.query);
  res.json({ ok: true, ...result });
});

const dashboard = asyncHandler(async (req, res) => {
  const result = await reportService.dashboardReport(req.query);
  res.json({ ok: true, ...result });
});

const sales = asyncHandler(async (req, res) => {
  const result = await reportService.salesReport(req.query);
  res.json({ ok: true, ...result });
});

const finance = asyncHandler(async (req, res) => {
  const result = await reportService.financeReport(req.query);
  res.json({ ok: true, ...result });
});

const delivery = asyncHandler(async (req, res) => {
  const result = await reportService.deliveryReport(req.query);
  res.json({ ok: true, ...result });
});

module.exports = {
  stock,
  debts,
  dashboard,
  sales,
  finance,
  delivery
};
