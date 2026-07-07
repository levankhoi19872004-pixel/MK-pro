'use strict';

// Keep the legacy reportService facade, but load report modules only when a
// concrete method is first used. Render free/small plans can run with a ~256MB
// V8 old-space limit; eagerly requiring every report domain just to serve
// /api/reports/catalog wastes heap and contributed to production OOMs.
const SERVICE_METHODS = Object.freeze({
  // Inventory / stock
  transactionQuantity: './reports/InventoryReportService',
  transactionCategory: './reports/InventoryReportService',
  currentStockReport: './reports/InventoryReportService',
  inventoryMovementReport: './reports/InventoryReportService',
  stockReport: './reports/InventoryReportService',
  stockCardReport: './reports/InventoryReportService',

  // Returns
  loadConfirmedReturns: './reports/ReturnReportService',
  loadReturnArCredits: './reports/ReturnReportService',
  returnReport: './reports/ReturnReportService',

  // Debt
  debtReport: './reports/DebtReportService',
  debtInit: './reports/DebtReportService',
  debtCustomers: './reports/DebtReportService',
  debtCustomerDetail: './reports/DebtReportService',
  debtArLedger: './reports/DebtReportService',
  debtBySalesmanReport: './reports/DebtReportService',
  debtByDeliveryReport: './reports/DebtReportService',
  periodDebtReport: './reports/DebtReportService',
  arLedgerDetailReport: './reports/DebtReportService',

  // Sales
  salesStaffKey: './reports/SalesReportService',
  salesStaffRow: './reports/SalesReportService',
  userSalesStaffCode: './reports/SalesReportService',
  userSalesStaffName: './reports/SalesReportService',
  activeSalesStaffUserFilter: './reports/SalesReportService',
  loadActiveSalesStaff: './reports/SalesReportService',
  buildSalesmanReportRows: './reports/SalesReportService',
  loadProductMap: './reports/SalesReportService',
  valueOrder: './reports/SalesReportService',
  loadConfirmedOrders: './reports/SalesReportService',
  loadArByOrders: './reports/SalesReportService',
  salesReport: './reports/SalesReportService',

  // Delivery
  loadMasters: './reports/DeliveryReportService',
  loadChildren: './reports/DeliveryReportService',
  loadDeliveredOrders: './reports/DeliveryReportService',
  loadCollections: './reports/DeliveryReportService',
  deliveryTripsReport: './reports/DeliveryReportService',
  deliveryByStaffReport: './reports/DeliveryReportService',
  deliveryReport: './reports/DeliveryReportService',

  // Finance
  fundTypeOf: './reports/FinanceReportService',
  directionOf: './reports/FinanceReportService',
  accountKeyOf: './reports/FinanceReportService',
  fundLedgerCanonicalFilter: './reports/FinanceReportService',
  loadFundLedgersUntil: './reports/FinanceReportService',
  financeReport: './reports/FinanceReportService',

  // Dashboard
  dashboardReport: './reports/DashboardReportService',

  // Report Center
  REPORT_CATEGORIES: './reports/ReportCenterService',
  REPORT_DEFINITIONS: './reports/ReportCenterService',
  catalog: './reports/ReportCenterService',
  visibleDefinitions: './reports/ReportCenterService',
  assertAccess: './reports/ReportCenterService',
  aggregateSalesByDay: './reports/ReportCenterService',
  aggregateSalesByCustomer: './reports/ReportCenterService',
  aggregateSalesByProduct: './reports/ReportCenterService',
  dataQualityRows: './reports/ReportCenterService',
  buildSourceNote: './reports/ReportCenterService',
  run: './reports/ReportCenterService',
  overview: './reports/ReportCenterService'
});

const serviceCache = new Map();

function loadService(modulePath) {
  if (!serviceCache.has(modulePath)) serviceCache.set(modulePath, require(modulePath));
  return serviceCache.get(modulePath);
}

const facade = {};
for (const [method, modulePath] of Object.entries(SERVICE_METHODS)) {
  Object.defineProperty(facade, method, {
    enumerable: true,
    configurable: false,
    get() {
      return loadService(modulePath)[method];
    }
  });
}

Object.defineProperty(facade, '__lazyReportService', {
  enumerable: false,
  value: true
});

module.exports = facade;
