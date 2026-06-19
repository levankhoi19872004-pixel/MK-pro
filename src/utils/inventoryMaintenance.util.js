'use strict';

const DESTRUCTIVE_INVENTORY_CONFIRMATION = 'CONFIRM_REBUILD_INVENTORY';

function isInventoryMaintenanceMode() {
  return String(process.env.SYSTEM_MAINTENANCE_MODE || '')
    .toLowerCase()
    .split(',')
    .map((value) => value.trim())
    .includes('inventory');
}

function assertDestructiveInventoryOperation(options = {}, operation = 'Thao tác tồn kho') {
  if (String(options.confirmDestructive || '') !== DESTRUCTIVE_INVENTORY_CONFIRMATION) {
    const error = new Error(`${operation} cần mã xác nhận phá hủy dữ liệu`);
    error.code = 'DESTRUCTIVE_STOCK_REBUILD_BLOCKED';
    error.status = 403;
    throw error;
  }
}

module.exports = {
  DESTRUCTIVE_INVENTORY_CONFIRMATION,
  isInventoryMaintenanceMode,
  assertDestructiveInventoryOperation
};
