'use strict';

const arLedgerReadService = require('../arLedgerRead.service');
const ImportOrder = require('../../models/ImportOrder');
const SalesReportService = require('./SalesReportService');
const InventoryReportService = require('./InventoryReportService');
const FinanceReportService = require('./FinanceReportService');
const DeliveryReportService = require('./DeliveryReportService');
const ReturnReportService = require('./ReturnReportService');
const legacy = require('../reportLegacy.service');
const ReportExecutionPolicy = require('./ReportExecutionPolicy');
const {
  activeDocumentFilter,
  businessDateStages,
  dateRange,
  toNumber
} = require('./ReportDomainUtils');

async function dashboardReport(query = {}) {
  // Giữ contract endpoint cũ cho đối tác/khách hàng legacy nhưng mặc định luôn
  // dùng các domain report chuẩn hóa. Chỉ dùng mode=legacy khi cần rollback có chủ đích.
  if (String(query.mode || '').toLowerCase() === 'legacy') {
    return legacy.dashboardReport(query);
  }
  const { dateFrom, dateTo } = dateRange(query);
  const optimized = ReportExecutionPolicy.dbPaginationEnabled();
  const previewQuery = optimized
    ? ReportExecutionPolicy.normalizePreviewQuery({ ...query, page: 1, limit: 1 })
    : { ...query, full: '1', export: '1' };
  let results;
  let orchestration = null;
  if (optimized) {
    const execution = await ReportExecutionPolicy.runBounded([
      { name: 'sales-summary', run: (ctx) => SalesReportService.salesReport({ ...previewQuery, __executionContext: ctx }, ctx) },
      { name: 'stock-summary', run: (ctx) => InventoryReportService.currentStockReport({ ...previewQuery, page: 1, limit: 1, __executionContext: ctx }, ctx) },
      { name: 'finance-summary', run: (ctx) => FinanceReportService.financeReport({ ...previewQuery, __executionContext: ctx }, ctx) },
      { name: 'delivery-summary', run: (ctx) => DeliveryReportService.deliveryTripsReport({ ...previewQuery, __executionContext: ctx }, ctx) },
      { name: 'return-summary', run: (ctx) => ReturnReportService.returnReport({ ...previewQuery, __executionContext: ctx }, ctx) },
      { name: 'current-debt', run: (ctx) => arLedgerReadService.aggregateDebtByCustomer({ status: 'all', dateTo, __executionContext: ctx }) },
      { name: 'period-debt', run: (ctx) => arLedgerReadService.aggregateDebtByCustomer({ status: 'all', dateFrom, dateTo, __executionContext: ctx }) },
      { name: 'imports-summary', run: (ctx) => { let q = ImportOrder.aggregate([
        { $match: activeDocumentFilter() },
        ...businessDateStages(dateFrom, dateTo, ['importDate', 'date', 'documentDate'], '_reportBusinessDate'),
        { $group: { _id: null, importCount: { $sum: 1 }, totalImportAmount: { $sum: { $convert: { input: { $ifNull: ['$totalAmount', '$amount'] }, to: 'double', onError: 0, onNull: 0 } } } } }
      ]); if (q && typeof q.option === 'function') q = q.option({ maxTimeMS: ctx.maxTimeMS, signal: ctx.signal }); return q; } }
    ], {
      concurrency: Number(process.env.PERF_REPORT_FANOUT_CONCURRENCY || 2),
      timeoutMs: Number(process.env.PERF_REPORT_TIMEOUT_MS || 30000),
      allowPartial: false
    });
    results = execution.results;
    orchestration = { concurrency: execution.concurrency, maxActive: execution.maxActive, warnings: execution.warnings };
  } else {
    results = await Promise.all([
      SalesReportService.salesReport({ ...query, full: '1', export: '1' }),
      InventoryReportService.currentStockReport({ full: '1' }),
      FinanceReportService.financeReport({ ...query, full: '1', export: '1' }),
      DeliveryReportService.deliveryTripsReport({ ...query, full: '1', export: '1' }),
      ReturnReportService.returnReport({ ...query, full: '1', export: '1' }),
      arLedgerReadService.aggregateDebtByCustomer({ status: 'all', dateTo }),
      arLedgerReadService.aggregateDebtByCustomer({ status: 'all', dateFrom, dateTo }),
      ImportOrder.aggregate([
        { $match: activeDocumentFilter() },
        ...businessDateStages(dateFrom, dateTo, ['importDate', 'date', 'documentDate'], '_reportBusinessDate'),
        { $group: { _id: null, importCount: { $sum: 1 }, totalImportAmount: { $sum: { $convert: { input: { $ifNull: ['$totalAmount', '$amount'] }, to: 'double', onError: 0, onNull: 0 } } } } }
      ])
    ]);
  }
  const [sales, stock, finance, delivery, returns, currentDebtRows, periodDebtRows, importRows] = results;

  const currentDebt = Array.isArray(currentDebtRows)
    ? currentDebtRows.reduce((sum, row) => sum + toNumber(row.remainingDebt ?? (toNumber(row.debit) - toNumber(row.credit))), 0)
    : 0;
  const periodDebt = Array.isArray(periodDebtRows) ? periodDebtRows.reduce((acc, row) => { acc.debit += toNumber(row.debit); acc.credit += toNumber(row.credit); return acc; }, { debit: 0, credit: 0 }) : {};
  const imports = importRows?.[0] || {};
  const periodNetMovement = toNumber(periodDebt.debit) - toNumber(periodDebt.credit);
  return {
    source: optimized ? 'domain_report_services_bounded_preview' : 'domain_report_services',
    orchestration,
    dateFrom,
    dateTo,
    dashboard: {
      sales: {
        orderCount: toNumber(sales.summary?.orderCount),
        totalAmount: toNumber(sales.summary?.actualAmount),
        beforePromoAmount: toNumber(sales.summary?.beforePromoAmount),
        promotionValue: toNumber(sales.summary?.promotionValue),
        receiptAmount: toNumber(sales.summary?.receiptAmount),
        returnAmount: toNumber(sales.summary?.returnAmount),
        debtAmount: toNumber(sales.summary?.debtAmount)
      },
      returns: returns.summary || {},
      debts: {
        currentDebt,
        periodDebit: toNumber(periodDebt.debit),
        periodCredit: toNumber(periodDebt.credit),
        periodNetMovement,
        totalDebit: toNumber(periodDebt.debit),
        totalCredit: toNumber(periodDebt.credit),
        totalDebt: currentDebt
      },
      stock: stock.summary || {},
      finance: finance.summary || {},
      delivery: delivery.summary || {},
      imports: {
        importCount: toNumber(imports.importCount),
        totalImportAmount: toNumber(imports.totalImportAmount)
      }
    }
  };
}

module.exports = { dashboardReport };
