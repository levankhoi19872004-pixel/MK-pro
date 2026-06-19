'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createMobileContext } = require('../src/mobile/mobileContext');

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('mobile access and refresh tokens are cryptographically and semantically separated', () => {
  const previous = {
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    MOBILE_JWT_SECRET: process.env.MOBILE_JWT_SECRET,
    MOBILE_REFRESH_TOKEN_SECRET: process.env.MOBILE_REFRESH_TOKEN_SECRET,
    ALLOW_LEGACY_UNTYPED_TOKENS: process.env.ALLOW_LEGACY_UNTYPED_TOKENS
  };
  process.env.JWT_SECRET = 'access-secret-for-test-123456789';
  process.env.MOBILE_JWT_SECRET = 'mobile-access-secret-for-test-123456789';
  process.env.JWT_REFRESH_SECRET = 'refresh-secret-for-test-987654321';
  process.env.MOBILE_REFRESH_TOKEN_SECRET = 'mobile-refresh-secret-for-test-987654321';
  process.env.ALLOW_LEGACY_UNTYPED_TOKENS = 'false';

  try {
    const ctx = createMobileContext();
    const user = { id: 'U1', code: 'NVGH-01', role: 'delivery' };
    const accessToken = ctx.encodeMobileToken(user);
    const refreshToken = ctx.encodeMobileRefreshToken(user);

    assert.equal(ctx.decodeMobileRefreshToken(accessToken), null);
    assert.equal(ctx.decodeMobileRefreshToken(refreshToken).tokenType, 'refresh');

    const req = { headers: { authorization: `Bearer ${refreshToken}` } };
    const res = mockResponse();
    let nextCalled = false;
    ctx.requireMobileLogin(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
