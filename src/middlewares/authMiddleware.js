const { readData } = require('../config/db');
const { verifyToken, findUserById, getUserPermissions, PERMISSIONS } = require('../services/authService');

function isPublicPath(req) {
  const path = req.path || req.originalUrl || '';
  return (
    path === '/api/info' ||
    path === '/api/health' ||
    path === '/api/auth/login' ||
    path === '/api/auth/roles'
  );
}

async function requireAuth(req, res, next) {
  try {
    if (isPublicPath(req)) return next();

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const payload = verifyToken(token);

    if (!payload) {
      return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập để sử dụng API này' });
    }

    const data = await readData();
    const user = findUserById(data, payload.sub);
    if (!user || user.isActive === false) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại hoặc đã bị khóa' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      permissions: getUserPermissions(user)
    };
    next();
  } catch (error) {
    next(error);
  }
}

function hasPermission(user, permission) {
  return !!user && Array.isArray(user.permissions) && user.permissions.includes(permission);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!permission || hasPermission(req.user, permission)) return next();
    return res.status(403).json({
      success: false,
      message: 'Bạn không có quyền thực hiện thao tác này',
      requiredPermission: permission
    });
  };
}

function getRequiredPermission(req) {
  const method = req.method;
  const path = req.path || '';

  if (path.startsWith('/api/auth/users')) return method === 'GET' ? PERMISSIONS.USER_READ : PERMISSIONS.USER_WRITE;
  if (path.startsWith('/api/lock')) return method === 'GET' ? PERMISSIONS.REPORT_READ : PERMISSIONS.LOCK_MANAGE;
  if (path.includes('/reverse')) return PERMISSIONS.DOCUMENT_REVERSE;
  if (path.startsWith('/api/documents')) return PERMISSIONS.DOCUMENT_REVERSE;
  if (path.startsWith('/api/reports')) return PERMISSIONS.REPORT_READ;
  if (path.startsWith('/api/print')) return PERMISSIONS.REPORT_READ;
  if (path.startsWith('/api/search')) return PERMISSIONS.SEARCH_READ;
  if (path.startsWith('/api/stock') || path.startsWith('/api/inventory')) return PERMISSIONS.STOCK_READ;
  if (path.startsWith('/api/products')) return method === 'GET' ? PERMISSIONS.PRODUCT_READ : PERMISSIONS.PRODUCT_WRITE;
  if (path.startsWith('/api/warehouse-receipts')) {
    if (method === 'GET' || path.endsWith('/preview')) return PERMISSIONS.WAREHOUSE_RECEIPT_READ;
    if (path.includes('/confirm')) return PERMISSIONS.WAREHOUSE_RECEIPT_CONFIRM;
    return PERMISSIONS.WAREHOUSE_RECEIPT_WRITE;
  }
  if (path.startsWith('/api/sales-orders')) {
    if (method === 'GET' || path.endsWith('/preview')) return PERMISSIONS.SALES_ORDER_READ;
    if (path.includes('/confirm')) return PERMISSIONS.SALES_ORDER_CONFIRM;
    return PERMISSIONS.SALES_ORDER_WRITE;
  }
  if (path.startsWith('/api/receivables')) return method === 'GET' ? PERMISSIONS.RECEIVABLE_READ : PERMISSIONS.RECEIVABLE_WRITE;
  if (path.startsWith('/api/cash')) return method === 'GET' ? PERMISSIONS.CASH_READ : PERMISSIONS.CASH_WRITE;
  return null;
}

function accessControl(req, res, next) {
  if (isPublicPath(req)) return next();
  const required = getRequiredPermission(req);
  if (!required || hasPermission(req.user, required)) return next();
  return res.status(403).json({
    success: false,
    message: 'Bạn không có quyền thực hiện thao tác này',
    requiredPermission: required
  });
}

module.exports = {
  requireAuth,
  requirePermission,
  accessControl,
  getRequiredPermission
};
