'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const { readAccessToken, attachAccessToken } = require('../src/security/accessTokenCookie');
const { requireAuth } = require('../src/middlewares/auth.middleware');
const { csrfProtection } = require('../src/middlewares/csrf.middleware');

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    cookies: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(name, value, options) { this.cookies.push({ name, value, options }); }
  };
}

test('access token is attached as HttpOnly cookie and can authenticate without localStorage bearer', () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-access-cookie-secret-that-is-long-enough';
  try {
    const token = jwt.sign({ id: 'u1', role: 'manager', tokenType: 'access' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const res = mockResponse();
    const body = attachAccessToken(res, { ok: true, token });
    assert.equal(body.token, token);
    assert.equal(res.cookies[0].options.httpOnly, true);
    assert.equal(res.cookies[0].options.sameSite, 'strict');
    assert.equal(readAccessToken({ headers: { cookie: `mk_access_token=${token}` } }), token);

    const req = { headers: { cookie: `mk_access_token=${token}` } };
    let nextCalled = false;
    requireAuth(req, mockResponse(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.authSource, 'cookie');
    assert.equal(req.user.role, 'manager');
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('cookie-authenticated writes require same-origin CSRF evidence while bearer clients remain compatible', () => {
  let nextCalled = false;
  const blockedReq = { method: 'POST', authSource: 'cookie', protocol: 'https', headers: { host: 'erp.example' } };
  const blockedRes = mockResponse();
  csrfProtection(blockedReq, blockedRes, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(blockedRes.statusCode, 403);

  nextCalled = false;
  const allowedReq = {
    method: 'POST',
    authSource: 'cookie',
    protocol: 'https',
    headers: { host: 'erp.example', origin: 'https://erp.example' }
  };
  csrfProtection(allowedReq, mockResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  nextCalled = false;
  csrfProtection({ method: 'POST', authSource: 'bearer', headers: {} }, mockResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('browser source no longer persists access or refresh tokens', () => {
  const files = [
    'public/js/auth-login.js',
    'public/js/auth-guard.js',
    'public/mobile/js/api.js',
    'public/js/delivery/delivery-core.js'
  ];
  for (const file of files) {
    const source = require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
    assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*(mk_web_token|v43_mobile_token|refreshToken|STORAGE_KEYS\.token)/, file);
  }
  const app = require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '../src/app.js'));
  assert.match(app, /app\.use\(apiSecurity\(requireAuth\)\);\s*app\.use\(csrfProtection\);/);
});
