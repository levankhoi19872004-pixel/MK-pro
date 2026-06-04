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
  // Màn Công nợ phương án 3 không còn lọc ngày.
  // Công nợ phải lấy theo số dư AR hiện tại và chỉ lọc theo khách/NVBH/NVGH/trạng thái khi người dùng tìm kiếm.
  const result = await reportService.debtReport(req.query || {});
  res.json({ ok: true, ...result });
});

const debtsInit = asyncHandler(async (req, res) => {
  const result = await reportService.debtInit(req.query || {});
  res.json({ ok: true, ...result });
});

const debtsCustomers = asyncHandler(async (req, res) => {
  const result = await reportService.debtCustomers(req.query || {});
  res.json({ ok: true, ...result });
});

const debtsCustomerDetail = asyncHandler(async (req, res) => {
  const query = { ...(req.query || {}), customerCode: req.params.customerCode || req.query.customerCode || req.query.code };
  const result = await reportService.debtCustomerDetail(query);
  res.json({ ok: true, ...result });
});

const debtsArLedger = asyncHandler(async (req, res) => {
  const result = await reportService.debtArLedger(req.query || {});
  res.json({ ok: true, ...result });
});

const debtsBySalesman = asyncHandler(async (req, res) => {
  // Tổng hợp công nợ theo NVBH cũng dùng số dư AR hiện tại, không bắt buộc khoảng ngày.
  const result = await reportService.debtBySalesmanReport(req.query || {});
  res.json({ ok: true, ...result });
});

const debtsByDelivery = asyncHandler(async (req, res) => {
  // Tổng hợp công nợ theo NVGH cũng dùng số dư AR hiện tại, không bắt buộc khoảng ngày.
  const result = await reportService.debtByDeliveryReport(req.query || {});
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
  debtsInit,
  debtsCustomers,
  debtsCustomerDetail,
  debtsArLedger,
  debtsBySalesman,
  debtsByDelivery,
  dashboard,
  sales,
  finance,
  delivery
};
