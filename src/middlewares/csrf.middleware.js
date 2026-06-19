'use strict';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalizedOrigin(value = '') {
  try {
    return new URL(String(value)).origin;
  } catch (_) {
    return '';
  }
}

function requestOrigin(req = {}) {
  const configured = normalizedOrigin(process.env.PUBLIC_APP_ORIGIN || process.env.APP_ORIGIN || '');
  if (configured) return configured;
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = String(req.headers?.host || '').trim();
  return host ? `${protocol}://${host}` : '';
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(String(req.method || '').toUpperCase())) return next();
  // Bearer clients are not vulnerable to ambient-cookie CSRF.
  if (req.authSource !== 'cookie') return next();

  const expected = normalizedOrigin(requestOrigin(req));
  const origin = normalizedOrigin(req.headers?.origin || '');
  const fetchSite = String(req.headers?.['sec-fetch-site'] || '').toLowerCase();
  const requestedWith = String(req.headers?.['x-requested-with'] || '').toLowerCase();

  const sameOrigin = Boolean(expected && origin && expected === origin);
  const browserSameOrigin = fetchSite === 'same-origin';
  const explicitAjax = requestedWith === 'xmlhttprequest';

  if (sameOrigin || browserSameOrigin || explicitAjax) return next();

  return res.status(403).json({
    ok: false,
    success: false,
    message: 'Yêu cầu ghi dữ liệu không vượt qua kiểm tra chống CSRF'
  });
}

module.exports = { csrfProtection, requestOrigin, normalizedOrigin };
