'use strict';

const jwt = require('jsonwebtoken');
const { readAccessToken } = require('../security/accessTokenCookie');
const { getRuntimeConfig } = require('../config/app.config');

function jwtSecret() {
  const secret = getRuntimeConfig().security.accessSecret;
  if (!secret) throw new Error('Missing JWT_SECRET');
  return secret;
}

function refreshJwtSecret() {
  return getRuntimeConfig().security.refreshSecret || jwtSecret();
}

function assertTokenType(payload = {}, expected = 'access') {
  if (payload.tokenType === expected) return payload;
  if (!payload.tokenType && getRuntimeConfig().security.allowLegacyUntypedTokens) return payload;
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
