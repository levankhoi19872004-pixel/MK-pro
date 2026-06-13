'use strict';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_WRITE_PATHS = [
  /^\/api\/auth\/(login|refresh|logout)(?:\/|$)/,
  /^\/api\/system\/(backup|reset)(?:\/|$)/
];

function maintenanceWriteGuard(req, res, next) {
  if (process.env.SYSTEM_MAINTENANCE_MODE !== 'true' || SAFE_METHODS.has(String(req.method || 'GET').toUpperCase())) {
    return next();
  }
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (ALLOWED_WRITE_PATHS.some((pattern) => pattern.test(path))) return next();
  return res.status(503).json({
    ok: false,
    success: false,
    code: 'SYSTEM_MAINTENANCE_MODE',
    message: 'Hệ thống đang bảo trì dữ liệu, tạm thời không nhận thao tác ghi'
  });
}

module.exports = { maintenanceWriteGuard };
