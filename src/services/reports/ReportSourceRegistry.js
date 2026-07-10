'use strict';

const REPORTING_SNAPSHOT_COLLECTION = ['reporting', 'snapshots'].join('_');
const INVENTORY_SNAPSHOT_COLLECTION = ['inventory', 'Snapshots'].join('');

const RAW_REPORT_SOURCE_REGISTRY = {
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
    secondaryCollections: ['users'],
    service: 'SalesReportService.salesReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Doanh số NVBH từ orders đã xác nhận + AR Ledger; danh sách NVBH từ users đang hoạt động',
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
    primaryCollections: ['orders'],
    secondaryCollections: ['orderPaymentAllocations.current', 'deliveryCloseoutVersions.latest', 'deliveryCloseoutCorrections'],
    service: 'RewardReportService.rewardByCustomerReport',
    exportService: 'ReportCenterService.run',
    sourceLabel: 'Trả thưởng final/current từ orders + orderPaymentAllocations current + deliveryCloseoutVersions latest',
    ssotRule: 'Trả thưởng vận hành giao hàng = final reward theo priority: orderPaymentAllocations.current.rewardAmount → deliveryCloseoutVersions.latest.rewardAmount → orders.deliveryCloseout.rewardAmount → orders.rewardAmount fallback. Mỗi salesOrder chỉ tính một lần; arLedgers không là nguồn operational reward.',
    amountSource: 'orderPaymentAllocations.current.rewardAmount | deliveryCloseoutVersions.latest.rewardAmount | orders.deliveryCloseout.rewardAmount | orders.rewardAmount fallback',
    rewardSources: ['orderPaymentAllocations.current', 'deliveryCloseoutVersions.latest', 'orders.deliveryCloseout', 'orders.rewardAmount fallback'],
    rewardSourcePriority: ['orderPaymentAllocations.current.rewardAmount', 'deliveryCloseoutVersions.latest.rewardAmount', 'orders.deliveryCloseout.rewardAmount', 'orders.rewardAmount fallback'],
    debtSource: null,
    inventorySource: null,
    fundSource: null,
    deliverySource: 'orders + orderPaymentAllocations.current + deliveryCloseoutVersions.latest',
    allowedLegacyExportTypes: [],
    forbiddenCollections: ['arLedgers', REPORTING_SNAPSHOT_COLLECTION, 'salesOrders.debtAmount', 'salesOrders.remainingDebt', 'master_orders.totalAmount']
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
};

function groupDefaults(code) {
  if (/^sales-/.test(code)) {
    return {
      ssotRule: 'Sales = orders/salesOrders đã xác nhận kế toán; công nợ/thu/trả liên quan = arLedgers canonical',
      amountSource: 'orders_accounting_confirmed',
      debtSource: 'arLedgers',
      inventorySource: null,
      fundSource: null,
      deliverySource: null
    };
  }
  if (/^debt-/.test(code)) {
    return {
      ssotRule: 'Debt = arLedgers canonical; không dùng arDebtCustomers/arDebtOrders/salesOrders.debtAmount làm nguồn chính',
      amountSource: null,
      debtSource: 'arLedgers',
      inventorySource: null,
      fundSource: null,
      deliverySource: null
    };
  }
  if (/^inventory-/.test(code) || code === 'stock-card') {
    return {
      ssotRule: code === 'inventory-current' ? 'Inventory current = inventories canonical qua inventoryStockService' : 'Inventory movement/stock card = stockTransactions canonical; không dùng products.stock hoặc inventory snapshots',
      amountSource: null,
      debtSource: null,
      inventorySource: code === 'inventory-current' ? 'inventories' : 'stockTransactions',
      fundSource: null,
      deliverySource: null
    };
  }
  if (/^finance-/.test(code)) {
    return {
      ssotRule: 'Finance/fund = fundLedgers canonical qua fundLedgerCanonicalFilter(); không dùng cashbooks/bankbooks làm nguồn chính',
      amountSource: 'fundLedgers_canonical',
      debtSource: null,
      inventorySource: null,
      fundSource: 'fundLedgers',
      deliverySource: null
    };
  }
  if (/^delivery-/.test(code)) {
    return {
      ssotRule: code === 'delivery-trips'
        ? 'Delivery trips = master_orders chỉ làm metadata chuyến; amount recompute từ orders; thu tiền từ fundLedgers canonical'
        : 'Delivery by staff = orders/salesOrders đã giao + fundLedgers canonical; không phụ thuộc bắt buộc master_orders',
      amountSource: code === 'delivery-trips' ? 'orders_recomputed' : 'orders_delivered',
      debtSource: null,
      inventorySource: null,
      fundSource: 'fundLedgers',
      deliverySource: code === 'delivery-trips' ? 'master_orders_metadata' : 'orders/salesOrders',
      tripSource: code === 'delivery-trips' ? 'master_orders' : null,
      snapshotUsedForAmount: code === 'delivery-trips' ? false : null
    };
  }
  if (/^returns-/.test(code)) {
    return {
      ssotRule: 'Returns = returnOrders là chứng từ gốc; AR impact nếu có đọc arLedgers canonical',
      amountSource: 'returnOrders',
      debtSource: 'arLedgers',
      inventorySource: 'returnOrders_to_inventory',
      fundSource: null,
      deliverySource: null
    };
  }
  if (/^info-/.test(code)) {
    return {
      ssotRule: 'Information = master data; chỉ số tài chính đi kèm phải đọc từ SSoT tương ứng',
      amountSource: code === 'info-customers' ? 'salesReport_accounting_confirmed' : null,
      debtSource: code === 'info-customers' ? 'arLedgers' : null,
      inventorySource: code === 'info-products' ? 'inventories' : null,
      fundSource: null,
      deliverySource: null
    };
  }
  if (code === 'data-quality') {
    return {
      ssotRule: 'Diagnostics = đối chiếu nguồn canonical và cảnh báo thiếu/lệch dữ liệu',
      amountSource: 'canonical_cross_checks',
      debtSource: 'arLedgers',
      inventorySource: 'inventories/stockTransactions',
      fundSource: 'fundLedgers',
      deliverySource: 'orders/master_orders'
    };
  }
  return {
    ssotRule: 'Báo cáo phải đọc từ nguồn canonical đã khai báo trong registry',
    amountSource: null,
    debtSource: null,
    inventorySource: null,
    fundSource: null,
    deliverySource: null
  };
}

function normalizeSourceContract(code, contract = {}) {
  const defaults = groupDefaults(code);
  const normalized = {
    secondaryCollections: [],
    forbiddenCollections: [],
    allowedLegacyExportTypes: [],
    exportService: 'ReportCenterService.run',
    ...defaults,
    ...contract
  };
  return Object.freeze({
    ...normalized,
    primaryCollections: Object.freeze([...(normalized.primaryCollections || [])]),
    secondaryCollections: Object.freeze([...(normalized.secondaryCollections || [])]),
    forbiddenCollections: Object.freeze([...(normalized.forbiddenCollections || [])]),
    allowedLegacyExportTypes: Object.freeze([...(normalized.allowedLegacyExportTypes || [])])
  });
}

const REPORT_SOURCE_REGISTRY = Object.freeze(Object.fromEntries(
  Object.entries(RAW_REPORT_SOURCE_REGISTRY).map(([code, contract]) => [code, normalizeSourceContract(code, contract)])
));

function validateReportSourceContract(reportCode, runtimeInfo = {}) {
  const contract = getReportSourceContract(reportCode);
  const warnings = [];
  if (!contract.service) warnings.push('Thiếu service trong source contract');
  if (!contract.exportService) warnings.push('Thiếu exportService trong source contract');
  if (!contract.sourceLabel) warnings.push('Thiếu sourceLabel trong source contract');
  if (!contract.ssotRule) warnings.push('Thiếu ssotRule trong source contract');
  if (!Array.isArray(contract.primaryCollections) || !contract.primaryCollections.length) warnings.push('Thiếu primaryCollections trong source contract');
  if (runtimeInfo.requireSourceNote && !runtimeInfo.sourceNote) warnings.push('Report result thiếu sourceNote');
  if (runtimeInfo.requireExportSourceNote && !runtimeInfo.exportSourceNote) warnings.push('Excel export thiếu sourceNote');
  return {
    reportCode: contract.reportCode,
    ok: warnings.length === 0,
    sourceStatus: warnings.length ? 'WARNING' : 'OK',
    warnings,
    contract
  };
}

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
  RAW_REPORT_SOURCE_REGISTRY,
  REPORT_SOURCE_REGISTRY,
  getReportSourceContract,
  validateReportSourceContract
};
