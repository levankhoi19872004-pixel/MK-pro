'use strict';

const REPORTING_SNAPSHOT_COLLECTION = ['reporting', 'snapshots'].join('_');
const INVENTORY_SNAPSHOT_COLLECTION = ['inventory', 'Snapshots'].join('');

const REPORT_SOURCE_REGISTRY = Object.freeze({
  'sales-kpi': {
    primaryCollections: ['orders', 'returnOrders', 'arLedgers', 'salesTargets'],
    service: 'HomeDashboardService.getHomeDashboard',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'KPI NVBH từ orders/returns/arLedgers',
    allowedLegacyExportTypes: ['salesman-report'],
    forbiddenCollections: [REPORTING_SNAPSHOT_COLLECTION, 'salesOrders.remainingDebt', 'salesOrders.debtAmount']
  },
  'sales-by-day': {
    primaryCollections: ['orders', 'arLedgers'],
    service: 'SalesReportService.salesReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Doanh số theo ngày từ đơn xác nhận kế toán và AR Ledger',
    allowedLegacyExportTypes: ['sales-report'],
    forbiddenCollections: [REPORTING_SNAPSHOT_COLLECTION, 'salesOrders.remainingDebt', 'salesOrders.debtAmount']
  },
  'sales-by-staff': {
    primaryCollections: ['orders', 'arLedgers'],
    service: 'SalesReportService.salesReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Doanh số NVBH từ orders đã xác nhận + AR Ledger',
    allowedLegacyExportTypes: ['salesman-report'],
    forbiddenCollections: [REPORTING_SNAPSHOT_COLLECTION, 'salesOrders.remainingDebt', 'salesOrders.debtAmount']
  },
  'sales-by-customer': {
    primaryCollections: ['orders', 'arLedgers'],
    service: 'SalesReportService.salesReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Doanh số khách hàng từ orders đã xác nhận + AR Ledger',
    allowedLegacyExportTypes: ['customer-sales-report'],
    forbiddenCollections: [REPORTING_SNAPSHOT_COLLECTION, 'salesOrders.remainingDebt', 'salesOrders.debtAmount']
  },
  'sales-by-product': {
    primaryCollections: ['orders', 'products'],
    service: 'SalesReportService.salesReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Doanh số sản phẩm từ orders xác nhận và snapshot giá',
    allowedLegacyExportTypes: ['product-sales-report'],
    forbiddenCollections: [REPORTING_SNAPSHOT_COLLECTION, 'products.stock']
  },
  'sales-detail': {
    primaryCollections: ['orders', 'arLedgers'],
    service: 'SalesReportService.salesReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Đơn bán đã xác nhận + AR Ledger',
    allowedLegacyExportTypes: ['sales-report'],
    forbiddenCollections: [REPORTING_SNAPSHOT_COLLECTION, 'salesOrders.remainingDebt', 'salesOrders.debtAmount']
  },
  'inventory-current': {
    primaryCollections: ['inventories'],
    service: 'InventoryReportService.currentStockReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Tồn hiện tại từ inventories canonical',
    allowedLegacyExportTypes: ['stock-report'],
    forbiddenCollections: [INVENTORY_SNAPSHOT_COLLECTION, 'products.stock', REPORTING_SNAPSHOT_COLLECTION]
  },
  'inventory-movement': {
    primaryCollections: ['stockTransactions', 'inventories'],
    service: 'InventoryReportService.inventoryMovementReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Nhập xuất tồn từ stockTransactions và inventories',
    allowedLegacyExportTypes: ['inventory-movement-report'],
    forbiddenCollections: [INVENTORY_SNAPSHOT_COLLECTION, 'products.stock', REPORTING_SNAPSHOT_COLLECTION]
  },
  'stock-card': {
    primaryCollections: ['stockTransactions'],
    service: 'InventoryReportService.stockCardReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Thẻ kho từ stockTransactions',
    allowedLegacyExportTypes: ['stock-card-report'],
    forbiddenCollections: [INVENTORY_SNAPSHOT_COLLECTION, 'products.stock', REPORTING_SNAPSHOT_COLLECTION]
  },
  'debt-current': {
    primaryCollections: ['arLedgers'],
    service: 'arLedgerReadService.aggregateDebtByCustomer',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Công nợ hiện tại/as-of từ arLedgers canonical',
    allowedLegacyExportTypes: [],
    forbiddenCollections: ['ArDebtCustomer', 'ArDebtOrder', 'salesOrders.debtAmount', 'salesOrders.remainingDebt', REPORTING_SNAPSHOT_COLLECTION]
  },
  'debt-period': {
    primaryCollections: ['arLedgers'],
    service: 'DebtReportService.periodDebtReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Công nợ theo kỳ từ arLedgers canonical',
    allowedLegacyExportTypes: ['debt-report'],
    forbiddenCollections: ['ArDebtCustomer', 'ArDebtOrder', 'salesOrders.debtAmount', 'salesOrders.remainingDebt', REPORTING_SNAPSHOT_COLLECTION]
  },
  'debt-ledger': {
    primaryCollections: ['arLedgers'],
    service: 'DebtReportService.arLedgerDetailReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Sổ chi tiết công nợ từ arLedgers canonical',
    allowedLegacyExportTypes: ['ar-ledger-detail'],
    forbiddenCollections: ['ArDebtCustomer', 'ArDebtOrder', 'salesOrders.debtAmount', 'salesOrders.remainingDebt', REPORTING_SNAPSHOT_COLLECTION]
  },
  'rewards-by-customer': {
    primaryCollections: ['arLedgers', 'orders'],
    service: 'RewardReportService.rewardByCustomerReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Trả thưởng/cấn trừ từ AR Ledger',
    allowedLegacyExportTypes: [],
    forbiddenCollections: [REPORTING_SNAPSHOT_COLLECTION, 'salesOrders.debtAmount']
  },
  'delivery-by-staff': {
    primaryCollections: ['orders', 'fundLedgers'],
    service: 'DeliveryReportService.deliveryByStaffReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Orders đã giao + fundLedgers canonical',
    allowedLegacyExportTypes: ['deliveryman-report'],
    forbiddenCollections: ['master_orders.totalAmount', REPORTING_SNAPSHOT_COLLECTION]
  },
  'delivery-trips': {
    primaryCollections: ['master_orders', 'orders', 'fundLedgers'],
    service: 'DeliveryReportService.deliveryTripsReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Chuyến giao từ master_orders, số tiền recompute từ orders và fundLedgers',
    allowedLegacyExportTypes: ['delivery-report'],
    forbiddenCollections: ['master_orders.totalAmount', REPORTING_SNAPSHOT_COLLECTION]
  },
  'finance-ledger': {
    primaryCollections: ['fundLedgers'],
    service: 'FinanceReportService.financeReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Sổ quỹ từ fundLedgers canonical',
    allowedLegacyExportTypes: ['fund-report'],
    forbiddenCollections: ['cashbooks', 'bankbooks', REPORTING_SNAPSHOT_COLLECTION]
  },
  'finance-accounts': {
    primaryCollections: ['fundLedgers'],
    service: 'FinanceReportService.financeReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Số dư quỹ theo tài khoản từ fundLedgers canonical',
    allowedLegacyExportTypes: ['fund-report'],
    forbiddenCollections: ['cashbooks', 'bankbooks', REPORTING_SNAPSHOT_COLLECTION]
  },
  'returns-detail': {
    primaryCollections: ['returnOrders', 'arLedgers'],
    service: 'ReturnReportService.returnReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Phiếu trả hàng confirmed + AR-RETURN',
    allowedLegacyExportTypes: ['return-report'],
    forbiddenCollections: [REPORTING_SNAPSHOT_COLLECTION]
  },
  'info-products': {
    primaryCollections: ['products', 'inventories'],
    service: 'InformationReportService.productInformationReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Master sản phẩm + tồn hiện tại canonical',
    allowedLegacyExportTypes: ['product-info-report'],
    forbiddenCollections: ['products.stock', INVENTORY_SNAPSHOT_COLLECTION, REPORTING_SNAPSHOT_COLLECTION]
  },
  'info-customers': {
    primaryCollections: ['customers', 'arLedgers', 'orders'],
    service: 'InformationReportService.customerInformationReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Master khách hàng + AR Ledger + doanh số confirmed',
    allowedLegacyExportTypes: ['customer-info-report'],
    forbiddenCollections: ['ArDebtCustomer', 'ArDebtOrder', 'salesOrders.debtAmount', 'salesOrders.remainingDebt', REPORTING_SNAPSHOT_COLLECTION]
  },
  'info-staffs': {
    primaryCollections: ['staffs', 'users'],
    service: 'InformationReportService.staffInformationReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Master nhân viên và tài khoản',
    allowedLegacyExportTypes: ['user-info-report'],
    forbiddenCollections: [REPORTING_SNAPSHOT_COLLECTION]
  },
  'data-quality': {
    primaryCollections: ['orders', 'arLedgers', 'stockTransactions', 'inventories', 'returnOrders', 'fundLedgers'],
    service: 'ReportCenterService.dataQualityRows',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Cảnh báo chất lượng từ các nguồn canonical',
    allowedLegacyExportTypes: [],
    forbiddenCollections: [REPORTING_SNAPSHOT_COLLECTION, INVENTORY_SNAPSHOT_COLLECTION, 'products.stock', 'salesOrders.debtAmount']
  }
});

function getReportSourceContract(code) {
  const normalized = String(code || '').trim();
  const contract = REPORT_SOURCE_REGISTRY[normalized];
  if (!contract) {
    const error = new Error(`Thiếu source contract cho báo cáo ${normalized}`);
    error.status = 500;
    error.code = 'REPORT_SOURCE_CONTRACT_MISSING';
    throw error;
  }
  return { reportCode: normalized, ...contract };
}

module.exports = {
  REPORT_SOURCE_REGISTRY,
  getReportSourceContract
};
