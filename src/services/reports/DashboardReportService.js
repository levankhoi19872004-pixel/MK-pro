'use strict';

const arLedgerReadService = require('../arLedgerRead.service');
const ImportOrder = require('../../models/ImportOrder');
const SalesReportService = require('./SalesReportService');
const InventoryReportService = require('./InventoryReportService');
const FinanceReportService = require('./FinanceReportService');
const DeliveryReportService = require('./DeliveryReportService');
const ReturnReportService = require('./ReturnReportService');
const legacy = require('../reportLegacy.service');
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
  const [sales, stock, finance, delivery, returns, debtRows, importRows] = await Promise.all([
    SalesReportService.salesReport({ ...query, full: '1', export: '1' }),
    InventoryReportService.currentStockReport({ full: '1' }),
    FinanceReportService.financeReport({ ...query, full: '1', export: '1' }),
    DeliveryReportService.deliveryReport({ ...query, full: '1', export: '1' }),
    ReturnReportService.returnReport({ ...query, full: '1', export: '1' }),
    arLedgerReadService.aggregateDebtByCustomer({ status: 'all', dateFrom, dateTo }),
    ImportOrder.aggregate([
      { $match: activeDocumentFilter() },
      ...businessDateStages(dateFrom, dateTo, ['importDate', 'date', 'documentDate'], '_reportBusinessDate'),
      {
        $group: {
          _id: null,
          importCount: { $sum: 1 },
          totalImportAmount: { $sum: { $convert: { input: { $ifNull: ['$totalAmount', '$amount'] }, to: 'double', onError: 0, onNull: 0 } } }
        }
      }
    ])
  ]);

  const debt = Array.isArray(debtRows) ? debtRows.reduce((acc, row) => { acc.debit += toNumber(row.debit); acc.credit += toNumber(row.credit); return acc; }, { debit: 0, credit: 0 }) : {};
  const imports = importRows?.[0] || {};
  const totalDebt = toNumber(debt.debit) - toNumber(debt.credit);
  return {
    source: 'domain_report_services',
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
        totalDebit: toNumber(debt.debit),
        totalCredit: toNumber(debt.credit),
        totalDebt
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
