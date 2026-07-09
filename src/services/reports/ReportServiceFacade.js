'use strict';

// Keep the legacy reportService facade, but load report modules only when a
// concrete method is first used. Render free/small plans can run with a ~256MB
// V8 old-space limit; eagerly requiring every report domain just to serve
// /api/reports/catalog wastes heap and contributed to production OOMs.
const SERVICE_METHODS = Object.freeze({
  // Inventory / stock
  transactionQuantity: './InventoryReportService',
  transactionCategory: './InventoryReportService',
  currentStockReport: './InventoryReportService',
  inventoryMovementReport: './InventoryReportService',
  stockReport: './InventoryReportService',
  stockCardReport: './InventoryReportService',

  // Returns
  loadConfirmedReturns: './ReturnReportService',
  loadReturnArCredits: './ReturnReportService',
  returnReport: './ReturnReportService',

  // Debt
  debtReport: './DebtReportService',
  debtInit: './DebtReportService',
  debtCustomers: './DebtReportService',
  debtCustomerDetail: './DebtReportService',
  debtArLedger: './DebtReportService',
  debtBySalesmanReport: './DebtReportService',
  debtByDeliveryReport: './DebtReportService',
  periodDebtReport: './DebtReportService',
  arLedgerDetailReport: './DebtReportService',

  // Sales
  salesStaffKey: './SalesReportService',
  salesStaffRow: './SalesReportService',
  userSalesStaffCode: './SalesReportService',
  userSalesStaffName: './SalesReportService',
  activeSalesStaffUserFilter: './SalesReportService',
  loadActiveSalesStaff: './SalesReportService',
  buildSalesmanReportRows: './SalesReportService',
  loadProductMap: './SalesReportService',
  valueOrder: './SalesReportService',
  loadConfirmedOrders: './SalesReportService',
  loadArByOrders: './SalesReportService',
  salesReport: './SalesReportService',

  // Delivery
  loadMasters: './DeliveryReportService',
  loadChildren: './DeliveryReportService',
  loadDeliveredOrders: './DeliveryReportService',
  loadCollections: './DeliveryReportService',
  deliveryTripsReport: './DeliveryReportService',
  deliveryByStaffReport: './DeliveryReportService',
  deliveryReport: './DeliveryReportService',

  // Finance
  fundTypeOf: './FinanceReportService',
  directionOf: './FinanceReportService',
  accountKeyOf: './FinanceReportService',
  fundLedgerCanonicalFilter: './FinanceReportService',
  loadFundLedgersUntil: './FinanceReportService',
  financeReport: './FinanceReportService',

  // Dashboard
  dashboardReport: './DashboardReportService',

  // Report Center
  REPORT_CATEGORIES: './ReportCenterService',
  REPORT_DEFINITIONS: './ReportCenterService',
  catalog: './ReportCenterService',
  visibleDefinitions: './ReportCenterService',
  assertAccess: './ReportCenterService',
  aggregateSalesByDay: './ReportCenterService',
  aggregateSalesByCustomer: './ReportCenterService',
  aggregateSalesByProduct: './ReportCenterService',
  dataQualityRows: './ReportCenterService',
  buildSourceNote: './ReportCenterService',
  run: './ReportCenterService',
  overview: './ReportCenterService'
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
