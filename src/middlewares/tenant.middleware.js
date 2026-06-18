'use strict';

const { DEFAULT_TENANT_ID, normalizeTenantId } = require('../utils/tenant.util');

function tenantContext(req, res, next) {
  const mode = String(process.env.TENANT_MODE || 'single').trim().toLowerCase();
  const tokenTenant = normalizeTenantId(req.user?.tenantId || req.mobileUser?.tenantId);
  const headerTenant = normalizeTenantId(req.headers['x-tenant-id']);
  const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
  const allowOverride = process.env.ALLOW_ADMIN_TENANT_OVERRIDE === 'true';

  const pathname = String(req.originalUrl || req.url || '').split('?')[0];
  const bootstrapPath = pathname.startsWith('/api/auth')
    || pathname.startsWith('/api/mobile/auth')
    || pathname.startsWith('/api/health')
    || pathname.startsWith('/api/platform');
  if (bootstrapPath && !tokenTenant) {
    req.tenantId = headerTenant || DEFAULT_TENANT_ID;
    res.locals.tenantId = req.tenantId;
    return next();
  }

  if (mode !== 'multi') {
    req.tenantId = tokenTenant || DEFAULT_TENANT_ID;
    res.locals.tenantId = req.tenantId;
    return next();
  }

  const tenantId = tokenTenant || (isAdmin && allowOverride ? headerTenant : '');
  if (!tenantId) {
    return res.status(403).json({
      ok: false,
      success: false,
      code: 'TENANT_CONTEXT_REQUIRED',
      message: 'Không xác định được phạm vi doanh nghiệp'
    });
  }

  if (headerTenant && tokenTenant && headerTenant !== tokenTenant && !(isAdmin && allowOverride)) {
    return res.status(403).json({
      ok: false,
      success: false,
      code: 'TENANT_CONTEXT_MISMATCH',
      message: 'Không được truy cập dữ liệu của doanh nghiệp khác'
    });
  }

  req.tenantId = tenantId;
  res.locals.tenantId = tenantId;
  return next();
}

module.exports = { tenantContext };
