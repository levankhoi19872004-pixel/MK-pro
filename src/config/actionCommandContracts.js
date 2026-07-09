'use strict';

const ACTION_COMMAND_CONTRACTS = Object.freeze({
  deliveryCloseout: Object.freeze({
    action: 'Chốt sổ giao hàng',
    route: 'POST /api/new/delivery-today/closeout',
    requestBudget: 1,
    idempotencyKey: 'closeout:{date}:{deliveryStaffCode}:{scopeHash}',
    allowedReads: Object.freeze(['salesOrders', 'returnOrders', 'orderPaymentAllocations']),
    allowedWrites: Object.freeze(['salesOrders', 'arLedgers', 'fundLedgers', 'orderPaymentAllocations', 'readModelSyncJobs', 'audit_logs']),
    forbiddenWrites: Object.freeze(['arDebtOrders', 'arDebtCustomers', 'reporting_snapshots']),
    readModelSync: 'enqueue',
    frontendUpdate: 'patch-selected-orders-and-kpi'
  }),
  deliveryBulkAdjustment: Object.freeze({
    action: 'Ghi nhận điều chỉnh đã chọn',
    route: 'POST /api/new/delivery-today/adjustments/bulk-commit',
    requestBudget: 1,
    idempotencyKey: 'bulk-adjustment:{date}:{deliveryStaffCode}:{selectedOrderHash}',
    allowedReads: Object.freeze(['salesOrders', 'deliveryCloseoutVersions', 'returnOrders', 'orderPaymentAllocations']),
    allowedWrites: Object.freeze(['deliveryCloseoutVersions', 'orderPaymentAllocations', 'arLedgers', 'readModelSyncJobs', 'audit_logs']),
    forbiddenWrites: Object.freeze(['arDebtOrders', 'arDebtCustomers', 'legacyInventorySnapshotWrites']),
    readModelSync: 'enqueue',
    frontendUpdate: 'patch-selected-adjustment-sync-status'
  }),
  deliveryAdjustmentSave: Object.freeze({
    action: 'Lưu điều chỉnh đơn giao',
    route: 'POST /api/new/delivery-today/closeouts/:id/corrections',
    requestBudget: 1,
    idempotencyKey: 'adjustment:{orderId}:{baseVersion}:{correctionHash}',
    allowedReads: Object.freeze(['salesOrders', 'returnOrders', 'deliveryCloseoutVersions', 'orderPaymentAllocations']),
    allowedWrites: Object.freeze(['deliveryCloseoutVersions', 'returnOrders', 'orderPaymentAllocations', 'arLedgers', 'readModelSyncJobs', 'audit_logs']),
    forbiddenWrites: Object.freeze(['arDebtOrders', 'arDebtCustomers', 'legacyInventorySnapshotWrites']),
    readModelSync: 'enqueue',
    frontendUpdate: 'patch-open-row-and-version-cache'
  }),
  debtCollectionSubmit: Object.freeze({
    action: 'Gửi phiếu thu chờ KT',
    route: 'POST /api/mobile/debt-collections | POST /api/new/debt/collections',
    requestBudget: 1,
    idempotencyKey: 'debt-submit:{collector}:{customer}:{allocationHash}:{formNonce}',
    allowedReads: Object.freeze(['arLedgers', 'debtCollections', 'debtCollectionLocks']),
    allowedWrites: Object.freeze(['debtCollections', 'debtCollectionLocks']),
    forbiddenWrites: Object.freeze(['arLedgers', 'fundLedgers', 'arDebtOrders', 'arDebtCustomers']),
    readModelSync: 'none',
    frontendUpdate: 'patch-pending-collection-or-reload-page-one'
  }),
  debtCollectionConfirm: Object.freeze({
    action: 'Kế toán xác nhận phiếu thu',
    route: 'POST /api/debt-collections/:id/confirm | POST /api/new/debt/collections/:id/confirm',
    requestBudget: 1,
    idempotencyKey: 'confirm-debt-collection:{collectionId}',
    allowedReads: Object.freeze(['debtCollections', 'arLedgers', 'externalDebtOrders']),
    allowedWrites: Object.freeze(['debtCollections', 'arLedgers', 'fundLedgers', 'externalDebtOrders', 'audit_logs', 'readModelSyncJobs']),
    forbiddenWrites: Object.freeze(['legacyInventorySnapshotWrites', 'salesOrders']),
    readModelSync: 'enqueue-if-needed',
    frontendUpdate: 'patch-collection-status'
  }),
  returnStockIn: Object.freeze({
    action: 'Nhập kho đơn trả',
    route: 'POST /api/return-orders/:id/stock-in',
    requestBudget: 1,
    idempotencyKey: 'return-stock-in:{returnOrderId}',
    allowedReads: Object.freeze(['returnOrders', 'products', 'inventories']),
    allowedWrites: Object.freeze(['returnOrders', 'inventories', 'stockTransactions', 'audit_logs']),
    forbiddenWrites: Object.freeze(['arLedgers', 'fundLedgers', 'arDebtOrders', 'arDebtCustomers']),
    readModelSync: 'none',
    frontendUpdate: 'patch-return-order-stock-status'
  }),
  warehouseReturnConfirm: Object.freeze({
    action: 'Thủ kho xác nhận hàng trả',
    route: 'POST /api/mobile/warehouse/return-checks/:id/confirm',
    requestBudget: 1,
    idempotencyKey: 'warehouse-return-confirm:{returnCheckId}:{version}',
    allowedReads: Object.freeze(['warehouseReturnChecks', 'returnOrders']),
    allowedWrites: Object.freeze(['warehouseReturnChecks', 'returnOrders', 'audit_logs']),
    forbiddenWrites: Object.freeze(['inventories', 'stockTransactions', 'arLedgers', 'fundLedgers']),
    readModelSync: 'none',
    frontendUpdate: 'patch-return-check-status'
  }),
  importCommit: Object.freeze({
    action: 'Import các dòng đã chọn',
    route: 'POST /api/import/commit',
    requestBudget: 1,
    idempotencyKey: 'import-commit:{sessionId}:{selectedRowsHash}',
    allowedReads: Object.freeze(['import_sessions', 'products', 'customers', 'users', 'inventories']),
    allowedWrites: Object.freeze(['import_sessions', 'salesOrders', 'inventories', 'stockTransactions', 'audit_logs']),
    forbiddenWrites: Object.freeze(['arLedgers', 'fundLedgers']),
    readModelSync: 'none-or-enqueue',
    frontendUpdate: 'poll-session-with-bounded-budget'
  }),
  dmsInventoryCommit: Object.freeze({
    action: 'Xác nhận cập nhật hạn mức bán App DMS',
    route: 'POST /api/dms-inventory/:id/commit',
    requestBudget: 1,
    idempotencyKey: 'dms-inventory-commit:{comparisonId}',
    allowedReads: Object.freeze(['dmsInventoryComparisons', 'inventories']),
    allowedWrites: Object.freeze(['dmsInventoryComparisons', 'dmsInventoryQuotas', 'audit_logs']),
    forbiddenWrites: Object.freeze(['inventories', 'stockTransactions', 'arLedgers']),
    readModelSync: 'none',
    frontendUpdate: 'patch-commit-status'
  }),
  debtCollectionReject: Object.freeze({
    action: 'Từ chối phiếu thu',
    route: 'POST /api/debt-collections/:id/reject | POST /api/new/debt/collections/:id/reject',
    requestBudget: 1,
    idempotencyKey: 'reject-debt-collection:{collectionId}:{reasonHash}',
    allowedReads: Object.freeze(['debtCollections']),
    allowedWrites: Object.freeze(['debtCollections', 'audit_logs']),
    forbiddenWrites: Object.freeze(['arLedgers', 'fundLedgers', 'salesOrders']),
    readModelSync: 'none',
    frontendUpdate: 'patch-collection-status',
    isDangerous: false
  }),
  sseExport: Object.freeze({
    action: 'Xuất Excel SSE',
    route: 'GET /api/export/sse-invoice-orders.xlsx',
    requestBudget: 1,
    idempotencyKey: 'sse-export:{filtersHash}',
    allowedReads: Object.freeze(['salesOrders', 'master_orders', 'returnOrders', 'products', 'customers']),
    allowedWrites: Object.freeze([]),
    optionalWrites: Object.freeze(['exportArtifacts']),
    forbiddenWrites: Object.freeze(['salesOrders', 'arLedgers', 'fundLedgers', 'inventories']),
    readModelSync: 'none',
    frontendUpdate: 'download-or-error-report-url',
    isDangerous: false
  }),
  systemBackup: Object.freeze({
    action: 'Tạo backup',
    route: 'POST /api/system/backup',
    requestBudget: 1,
    idempotencyKey: 'backup:{date}:{requestId}',
    allowedReads: Object.freeze(['products', 'customers', 'salesOrders', 'returnOrders', 'arLedgers', 'fundLedgers', 'inventories', 'stockTransactions', 'users']),
    allowedWrites: Object.freeze(['backupArtifacts']),
    forbiddenWrites: Object.freeze(['salesOrders', 'arLedgers', 'fundLedgers', 'inventories', 'stockTransactions']),
    readModelSync: 'none',
    frontendUpdate: 'patch-backup-status',
    isDangerous: true
  }),
  systemReset: Object.freeze({
    action: 'Reset dữ liệu',
    route: 'POST /api/system/reset',
    requestBudget: 1,
    idempotencyKey: 'system-reset:{scope}:{confirmationHash}',
    allowedReads: Object.freeze(['all-operational-collections']),
    allowedWrites: Object.freeze(['backupArtifacts', 'selectedOperationalCollections']),
    forbiddenWrites: Object.freeze(['users', 'roles', 'systemSettings']),
    readModelSync: 'none',
    frontendUpdate: 'patch-system-status-only',
    isDangerous: true
  })
});

function getActionCommandContract(name) {
  return ACTION_COMMAND_CONTRACTS[name] || null;
}

module.exports = {
  ACTION_COMMAND_CONTRACTS,
  getActionCommandContract
};
