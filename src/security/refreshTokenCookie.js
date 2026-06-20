'use strict';

const { getRuntimeConfig } = require('../config/app.config');

const DEFAULT_COOKIE_NAME = 'mk_refresh_token';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function cookieName() {
  return String(process.env.REFRESH_TOKEN_COOKIE_NAME || DEFAULT_COOKIE_NAME).trim() || DEFAULT_COOKIE_NAME;
}

function parseCookies(header = '') {
  return String(header || '').split(';').reduce((result, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return result;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key) return result;
    try {
      result[key] = decodeURIComponent(value);
    } catch (_) {
      result[key] = value;
    }
    return result;
  }, {});
}

function readRefreshToken(req = {}) {
  const cookies = parseCookies(req.headers?.cookie || '');
  const cookieToken = String(cookies[cookieName()] || '').trim();
  if (cookieToken) return cookieToken;
  // Temporary migration path for native/legacy clients. Disable after all clients use the cookie.
  if (getRuntimeConfig().security.allowRefreshTokenInBody) {
    return String(req.body?.refreshToken || '').trim();
  }
  return '';
}

function cookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite = String(process.env.REFRESH_TOKEN_COOKIE_SAMESITE || 'strict').toLowerCase();
  const maxAge = Math.max(60_000, Number(process.env.REFRESH_TOKEN_COOKIE_MAX_AGE_MS || THIRTY_DAYS_MS));
  return {
    httpOnly: true,
    secure: process.env.REFRESH_TOKEN_COOKIE_SECURE === 'true' || (isProduction && process.env.REFRESH_TOKEN_COOKIE_SECURE !== 'false'),
    sameSite: ['strict', 'lax', 'none'].includes(sameSite) ? sameSite : 'strict',
    path: '/api',
    maxAge
  };
}

function setRefreshTokenCookie(res, token) {
  if (!res || typeof res.cookie !== 'function' || !token) return;
  res.cookie(cookieName(), String(token), cookieOptions());
}

function clearRefreshTokenCookie(res) {
  if (!res || typeof res.clearCookie !== 'function') return;
  const options = cookieOptions();
  delete options.maxAge;
  res.clearCookie(cookieName(), options);
}

function exposeRefreshTokenInBody() {
  return getRuntimeConfig().security.allowRefreshTokenInBody;
}

function attachRefreshToken(res, body = {}) {
  const responseBody = { ...(body || {}) };
  const token = String(responseBody.refreshToken || '').trim();
  if (token) setRefreshTokenCookie(res, token);
  if (!exposeRefreshTokenInBody()) delete responseBody.refreshToken;
  return responseBody;
}

module.exports = {
  cookieName,
  parseCookies,
  readRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  exposeRefreshTokenInBody,
  attachRefreshToken
};
