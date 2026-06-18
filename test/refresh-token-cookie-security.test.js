'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  parseCookies,
  readRefreshToken,
  attachRefreshToken
} = require('../src/security/refreshTokenCookie');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('refresh token cookie parsing and body exposure are secure by default', () => {
  const previous = process.env.ALLOW_REFRESH_TOKEN_IN_BODY;
  delete process.env.ALLOW_REFRESH_TOKEN_IN_BODY;
  try {
    assert.equal(parseCookies('a=1; mk_refresh_token=secret%20token').mk_refresh_token, 'secret token');
    assert.equal(readRefreshToken({ headers: { cookie: 'mk_refresh_token=cookie-token' }, body: { refreshToken: 'body-token' } }), 'cookie-token');
    assert.equal(readRefreshToken({ headers: {}, body: { refreshToken: 'body-token' } }), '');

    let cookieCall = null;
    const res = { cookie(name, value, options) { cookieCall = { name, value, options }; } };
    const body = attachRefreshToken(res, { ok: true, refreshToken: 'rotate-me' });
    assert.equal(body.refreshToken, undefined);
    assert.equal(cookieCall.value, 'rotate-me');
    assert.equal(cookieCall.options.httpOnly, true);
    assert.equal(cookieCall.options.sameSite, 'strict');
  } finally {
    if (previous === undefined) delete process.env.ALLOW_REFRESH_TOKEN_IN_BODY;
    else process.env.ALLOW_REFRESH_TOKEN_IN_BODY = previous;
  }
});

test('browser clients no longer persist refresh tokens in localStorage', () => {
  const login = read('public/js/auth-login.js');
  const mobileApi = read('public/mobile/js/api.js');
  const guard = read('public/js/auth-guard.js');
  assert.match(login, /localStorage\.removeItem\(WEB_REFRESH\)/);
  assert.doesNotMatch(login, /localStorage\.setItem\(WEB_REFRESH/);
  assert.match(mobileApi, /localStorage\.removeItem\(STORAGE_KEYS\.refreshToken\)/);
  assert.match(mobileApi, /credentials: 'include'/);
  assert.match(guard, /\/api\/auth\/refresh/);
  assert.match(guard, /credentials:'same-origin'/);
});
