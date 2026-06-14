'use strict';

const reportService = require('../services/reportService');
const inventoryService = require('../services/inventoryService');
const { DESTRUCTIVE_INVENTORY_CONFIRMATION, isInventoryMaintenanceMode } = require('../utils/inventoryMaintenance.util');
const asyncHandler = require('../middlewares/asyncHandler');
const queryGuard = require('../utils/queryGuard.util');


function requireReportDateRange(req, res, options = {}) {
  const checked = queryGuard.requireDateRange(req.query || {}, options);
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
  if (wantsMovement && !requireReportDateRange(req, res, { maxDays: 31 })) return;
  const result = await reportService.stockReport(query);
  res.json({ ok: true, ...result });
});

const stockCard = asyncHandler(async (req, res) => {
  if (!requireReportDateRange(req, res, { maxDays: 31 })) return;
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
  req.query = queryGuard.normalizeQueryDateRange(req.query || {}, { defaultToday: true });
  const result = await reportService.dashboardReport(req.query);
  res.json({ ok: true, ...result });
});

const sales = asyncHandler(async (req, res) => {
  if (!requireReportDateRange(req, res, { maxDays: 31 })) return;
  const result = await reportService.salesReport(req.query);
  res.json({ ok: true, ...result });
});

const finance = asyncHandler(async (req, res) => {
  if (!requireReportDateRange(req, res, { maxDays: 31 })) return;
  const result = await reportService.financeReport(req.query);
  res.json({ ok: true, ...result });
});

const delivery = asyncHandler(async (req, res) => {
  if (!requireReportDateRange(req, res, { maxDays: 31 })) return;
  const result = await reportService.deliveryReport(req.query);
  res.json({ ok: true, ...result });
});


function assertDestructiveInventoryRequest(req, operation) {
  if (process.env.ENABLE_DESTRUCTIVE_INVENTORY_REBUILD !== 'true') {
    const error = new Error(`${operation} đang bị khóa trên môi trường này`);
    error.status = 403;
    error.code = 'DESTRUCTIVE_INVENTORY_OPERATION_DISABLED';
    throw error;
  }
  if (!isInventoryMaintenanceMode()) {
    const error = new Error('Phải bật SYSTEM_MAINTENANCE_MODE=inventory trước khi rebuild tồn kho');
    error.status = 409;
    error.code = 'INVENTORY_MAINTENANCE_MODE_REQUIRED';
    throw error;
  }
  const confirmation = String(req.body?.confirmation || req.query?.confirmation || '').trim();
  if (confirmation !== DESTRUCTIVE_INVENTORY_CONFIRMATION) {
    const error = new Error('Thiếu mã xác nhận rebuild tồn kho');
    error.status = 400;
    error.code = 'INVENTORY_REBUILD_CONFIRMATION_REQUIRED';
    throw error;
  }
  return confirmation;
}

const rebuildInventory = asyncHandler(async (req, res) => {
  const confirmation = assertDestructiveInventoryRequest(req, 'Rebuild tồn kho');
  const resetFlag = req.body?.resetTransactions ?? req.query?.resetTransactions ?? '0';
  const result = await inventoryService.rebuildStockLedgerFromDocuments({
    resetTransactions: ['1', 'true', 'yes'].includes(String(resetFlag).toLowerCase()),
    confirmDestructive: confirmation
  });
  res.json({
    ok: true,
    message: 'Đã rebuild stockTransactions và inventories từ chứng từ. Products chỉ còn là danh mục, không lưu tồn.',
    ...result
  });
});
const normalizeOneWarehouse = asyncHandler(async (req, res) => {
  const confirmation = assertDestructiveInventoryRequest(req, 'Chuẩn hóa một kho');
  const result = await inventoryService.normalizeOneWarehouse({ confirmDestructive: confirmation });
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
