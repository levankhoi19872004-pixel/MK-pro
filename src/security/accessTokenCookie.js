'use strict';

const { parseCookies } = require('./refreshTokenCookie');

const DEFAULT_COOKIE_NAME = 'mk_access_token';
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;

function cookieName() {
  return String(process.env.ACCESS_TOKEN_COOKIE_NAME || DEFAULT_COOKIE_NAME).trim() || DEFAULT_COOKIE_NAME;
}

function readAccessToken(req = {}) {
  const cookies = parseCookies(req.headers?.cookie || '');
  return String(cookies[cookieName()] || '').trim();
}

function cookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite = String(process.env.ACCESS_TOKEN_COOKIE_SAMESITE || 'strict').toLowerCase();
  const maxAge = Math.max(60_000, Number(process.env.ACCESS_TOKEN_COOKIE_MAX_AGE_MS || DEFAULT_MAX_AGE_MS));
  return {
    httpOnly: true,
    secure: process.env.ACCESS_TOKEN_COOKIE_SECURE === 'true' || (isProduction && process.env.ACCESS_TOKEN_COOKIE_SECURE !== 'false'),
    sameSite: ['strict', 'lax', 'none'].includes(sameSite) ? sameSite : 'strict',
    path: '/api',
    maxAge
  };
}

function setAccessTokenCookie(res, token) {
  if (!res || typeof res.cookie !== 'function' || !token) return;
  res.cookie(cookieName(), String(token), cookieOptions());
}

function clearAccessTokenCookie(res) {
  if (!res || typeof res.clearCookie !== 'function') return;
  const options = cookieOptions();
  delete options.maxAge;
  res.clearCookie(cookieName(), options);
}

function attachAccessToken(res, body = {}) {
  const responseBody = { ...(body || {}) };
  const token = String(responseBody.token || '').trim();
  if (token) setAccessTokenCookie(res, token);
  return responseBody;
}

module.exports = {
  cookieName,
  readAccessToken,
  cookieOptions,
  setAccessTokenCookie,
  clearAccessTokenCookie,
  attachAccessToken
};
