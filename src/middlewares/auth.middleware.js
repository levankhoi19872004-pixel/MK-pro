'use strict';

const jwt = require('jsonwebtoken');
const { readAccessToken } = require('../security/accessTokenCookie');

function jwtSecret() {
  const secret = [process.env.JWT_SECRET, process.env.MOBILE_JWT_SECRET].find(Boolean);
  if (!secret) throw new Error('Missing JWT_SECRET');
  return secret;
}

function refreshJwtSecret() {
  return process.env.JWT_REFRESH_SECRET || process.env.MOBILE_REFRESH_TOKEN_SECRET || jwtSecret();
}

function assertTokenType(payload = {}, expected = 'access') {
  if (payload.tokenType === expected) return payload;
  if (!payload.tokenType && process.env.ALLOW_LEGACY_UNTYPED_TOKENS === 'true') return payload;
  const err = new Error(`Invalid ${expected} token type`);
  err.code = 'INVALID_TOKEN_TYPE';
  throw err;
}

function requireAuth(req, res, next) {
  const header = String(req.headers.authorization || '');
  const bearerToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const cookieToken = readAccessToken(req);
  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({
      ok: false,
      success: false,
      message: 'Bạn chưa đăng nhập'
    });
  }

  try {
    req.user = assertTokenType(jwt.verify(token, jwtSecret()), 'access');
    req.mobileUser = req.user;
    req.authSource = bearerToken ? 'bearer' : 'cookie';
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
  refreshJwtSecret,
  assertTokenType,
  requireAuth,
  requireRole
};
