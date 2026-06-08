'use strict';

const reportService = require('../services/reportService');
const inventoryService = require('../services/inventoryService');
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
  // Tồn kho hiện tại được đọc trực tiếp từ inventories, không bắt buộc dateFrom/dateTo.
  // Chỉ báo cáo phát sinh/thẻ kho theo kỳ mới cần khoảng ngày.
  const query = req.query || {};
  const wantsMovement = query.dateFrom || query.dateTo || query.asOfDate || query.mode === 'movement';
  if (wantsMovement && !requireReportDateRange(req, res)) return;
  const result = await reportService.stockReport(query);
  res.json({ ok: true, ...result });
});

const stockCard = asyncHandler(async (req, res) => {
  if (!requireReportDateRange(req, res)) return;
  const result = await reportService.stockCardReport(req.query);
  res.json({ ok: true, ...result });
});

function isTruthyFlag(value) {
  return ['1', 'true', 'yes', 'full'].includes(String(value || '').trim().toLowerCase());
}

function hasCustomerDetailQuery(query = {}) {
  return Boolean(
    query.customerCode ||
    query.code ||
    query.customerId ||
    query.id ||
    query.orderCode ||
    query.orderId ||
    query.detail === '1' ||
    query.mode === 'detail'
  );
}

const debts = asyncHandler(async (req, res) => {
  // V45 compatibility endpoint:
  // /api/debts vẫn được giữ cho UI cũ, nhưng mặc định KHÔNG còn tính toàn bộ AR Ledger.
  // - Cần danh sách khách công nợ: dùng chung logic /api/debts/customers
  // - Cần chi tiết 1 khách/1 đơn: dùng chung logic /api/debts/customer-detail
  // - Chỉ khi gọi rõ legacyFull/full=1 mới trả payload đầy đủ kiểu cũ.
  const query = req.query || {};

  if (isTruthyFlag(query.legacyFull) || isTruthyFlag(query.full)) {
    const result = await reportService.debtReport(query);
    return res.json({ ok: true, compatibility: 'legacy-full', ...result });
  }

  if (hasCustomerDetailQuery(query)) {
    const result = await reportService.debtCustomerDetail(query);
    return res.json({ ok: true, compatibility: 'customer-detail', redirectedFrom: '/api/debts', ...result });
  }

  const result = await reportService.debtCustomers(query);
  return res.json({ ok: true, compatibility: 'customers-light', redirectedFrom: '/api/debts', ...result });
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


const rebuildInventory = asyncHandler(async (req, res) => {
  const resetFlag = req.body?.resetTransactions ?? req.query?.resetTransactions ?? '1';
  const result = await inventoryService.rebuildStockLedgerFromDocuments({
    resetTransactions: ['1', 'true', 'yes'].includes(String(resetFlag).toLowerCase())
  });
  res.json({
    ok: true,
    message: 'Đã rebuild stockTransactions và inventories từ chứng từ. Products chỉ còn là danh mục, không lưu tồn.',
    ...result
  });
});
const normalizeOneWarehouse = asyncHandler(async (req, res) => {
  const result = await inventoryService.normalizeOneWarehouse();
  res.json({
    ok: true,
    message: 'Đã gom tồn kho về 1 kho chính MAIN. KHO_HC/KHO_PC chỉ còn là nhóm in/gộp đơn.',
    ...result
  });
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
  delivery,
  rebuildInventory,
  normalizeOneWarehouse
};
