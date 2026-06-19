'use strict';

const { isInventoryMaintenanceMode } = require('../utils/inventoryMaintenance.util');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED_MAINTENANCE_PATHS = [
  '/inventory/rebuild',
  '/reports/inventory/rebuild',
  '/inventory/normalize-one-warehouse',
  '/reports/inventory/normalize-one-warehouse'
];
const INVENTORY_WRITE_PREFIXES = [
  '/sales-orders',
  '/orders',
  '/master-orders',
  '/import-orders',
  '/return-orders',
  '/returns',
  '/master-return-orders',
  '/import',
  '/inventory',
  '/mobile/sales',
  '/mobile/delivery'
];

function normalizePath(req = {}) {
  return String(req.path || req.originalUrl || '')
    .replace(/^\/api(?=\/|$)/, '')
    .split('?')[0];
}

function inventoryMaintenanceGuard(req, res, next) {
  if (!isInventoryMaintenanceMode() || !WRITE_METHODS.has(String(req.method || '').toUpperCase())) {
    return next();
  }
  const path = normalizePath(req);
  if (ALLOWED_MAINTENANCE_PATHS.includes(path)) return next();
  if (!INVENTORY_WRITE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return next();
  }
  return res.status(503).json({
    ok: false,
    error: 'Hệ thống đang bảo trì tồn kho, tạm khóa các thao tác làm thay đổi tồn.',
    code: 'INVENTORY_MAINTENANCE_MODE'
  });
}

module.exports = { inventoryMaintenanceGuard, normalizePath };
