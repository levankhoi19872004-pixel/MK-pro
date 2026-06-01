'use strict';

const reportService = require('../services/reportService');
const asyncHandler = require('../middlewares/asyncHandler');
const queryGuard = require('../utils/queryGuard.util');


function requireReportDateRange(req, res) {
  const checked = queryGuard.requireDateRange(req.query || {});
  if (!checked.ok) {
    res.status(400).json({ ok: false, message: checked.message });
    return null;
  }
  req.query = checked.query;
  return checked.query;
}

const stock = asyncHandler(async (req, res) => {
  if (!requireReportDateRange(req, res)) return;
  const result = await reportService.stockReport(req.query);
  res.json({ ok: true, ...result });
});

const stockCard = asyncHandler(async (req, res) => {
  if (!requireReportDateRange(req, res)) return;
  const result = await reportService.stockCardReport(req.query);
  res.json({ ok: true, ...result });
});

const debts = asyncHandler(async (req, res) => {
  if (!requireReportDateRange(req, res)) return;
  const result = await reportService.debtReport(req.query);
  res.json({ ok: true, ...result });
});

const debtsBySalesman = asyncHandler(async (req, res) => {
  if (!requireReportDateRange(req, res)) return;
  const result = await reportService.debtBySalesmanReport(req.query);
  res.json({ ok: true, ...result });
});

const debtsByDelivery = asyncHandler(async (req, res) => {
  if (!requireReportDateRange(req, res)) return;
  const result = await reportService.debtByDeliveryReport(req.query);
  res.json({ ok: true, ...result });
});

const dashboard = asyncHandler(async (req, res) => {
  const result = await reportService.dashboardReport(req.query);
  res.json({ ok: true, ...result });
});

const sales = asyncHandler(async (req, res) => {
  if (!requireReportDateRange(req, res)) return;
  const result = await reportService.salesReport(req.query);
  res.json({ ok: true, ...result });
});

const finance = asyncHandler(async (req, res) => {
  if (!requireReportDateRange(req, res)) return;
  const result = await reportService.financeReport(req.query);
  res.json({ ok: true, ...result });
});

const delivery = asyncHandler(async (req, res) => {
  if (!requireReportDateRange(req, res)) return;
  const result = await reportService.deliveryReport(req.query);
  res.json({ ok: true, ...result });
});

module.exports = {
  stock,
  stockCard,
  debts,
  debtsBySalesman,
  debtsByDelivery,
  dashboard,
  sales,
  finance,
  delivery
};
