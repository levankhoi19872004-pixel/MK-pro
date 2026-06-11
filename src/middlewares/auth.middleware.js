'use strict';

const jwt = require('jsonwebtoken');

function jwtSecret() {
  const secret = [process.env.JWT_SECRET, process.env.MOBILE_JWT_SECRET].find(Boolean);
  if (!secret) {
    throw new Error('Missing JWT_SECRET');
  }
  return secret;
}

function requireAuth(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({
      ok: false,
      success: false,
      message: 'Bạn chưa đăng nhập'
    });
  }

  try {
    req.user = jwt.verify(token, jwtSecret());
    req.mobileUser = req.user;
    return next();
  } catch (err) {
    return res.status(401).json({
      ok: false,
      success: false,
      message: 'Phiên đăng nhập đã hết hạn'
    });
  }
}

function requireRole(roles = []) {
  const allowed = (Array.isArray(roles) ? roles : [roles])
    .map((role) => String(role || '').toLowerCase())
    .filter(Boolean);

  return function requireRoleMiddleware(req, res, next) {
    const role = String(req.user?.role || '').toLowerCase();

    if (!allowed.includes(role)) {
      return res.status(403).json({
        ok: false,
        success: false,
        message: 'Bạn không có quyền thực hiện thao tác này'
      });
    }

    return next();
  };
}

module.exports = {
  jwtSecret,
  requireAuth,
  requireRole
};
