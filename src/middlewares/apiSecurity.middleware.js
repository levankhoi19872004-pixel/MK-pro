'use strict';

// GLOBAL_API_SECURITY_BOUNDARY_START
const PUBLIC_ROUTES = [
  ['POST', /^\/api\/auth\/login$/],
  ['POST', /^\/api\/auth\/refresh$/],

  // Mobile modular login
  ['POST', /^\/api\/mobile\/auth\/login$/],
  ['POST', /^\/api\/mobile\/auth\/refresh$/],

  // Health/status
  ['GET', /^\/api\/system\/status$/],
  ['GET', /^\/api\/system\/health$/],
  ['GET', /^\/api\/system\/health\/db$/],
  ['GET', /^\/api\/health$/],
  ['GET', /^\/api\/health\/db$/],
  ['GET', /^\/api\/health\/live$/],
  ['GET', /^\/api\/health\/ready$/],
  ['GET', /^\/api\/health\/readiness$/],

  // Swagger tự có docsAuthGuard riêng
  ['GET', /^\/api\/docs(?:\/openapi\.json)?$/]
];

function getRequestPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

function isPublicRoute(req) {
  const path = getRequestPath(req);

  return PUBLIC_ROUTES.some(([method, pattern]) => {
    return req.method === method && pattern.test(path);
  });
}

function apiSecurity(requireAuth) {
  return function apiSecurityMiddleware(req, res, next) {
    const path = getRequestPath(req);

    if (!path.startsWith('/api')) return next();
    if (isPublicRoute(req)) return next();

    return requireAuth(req, res, next);
  };
}

module.exports = {
  apiSecurity,
  isPublicRoute,
  PUBLIC_ROUTES
};
// GLOBAL_API_SECURITY_BOUNDARY_END
