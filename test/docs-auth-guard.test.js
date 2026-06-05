'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

let jwt = null;
let docsAuthGuard = null;
let isDocsAuthRequired = null;
try {
  require.resolve('jsonwebtoken');
  require.resolve('express-rate-limit');
  jwt = require('jsonwebtoken');
  ({ docsAuthGuard, isDocsAuthRequired } = require('../src/routes/swaggerRoutes'));
} catch (err) {
  // Dependencies are installed in normal app/runtime. In a raw ZIP without npm install,
  // keep the test suite readable instead of failing during require().
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function makeReq(token) {
  return {
    docsUser: null,
    get(name) {
      if (String(name).toLowerCase() !== 'authorization') return '';
      return token ? `Bearer ${token}` : '';
    }
  };
}

test('API docs auth is required automatically in production', { skip: isDocsAuthRequired ? false : 'dependencies are not installed; run npm install before docs guard tests' }, () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldRequireAuth = process.env.API_DOCS_REQUIRE_AUTH;
  const oldPublic = process.env.API_DOCS_PUBLIC;

  process.env.NODE_ENV = 'production';
  delete process.env.API_DOCS_REQUIRE_AUTH;
  delete process.env.API_DOCS_PUBLIC;

  assert.equal(isDocsAuthRequired(), true);

  process.env.NODE_ENV = oldNodeEnv;
  if (oldRequireAuth === undefined) delete process.env.API_DOCS_REQUIRE_AUTH; else process.env.API_DOCS_REQUIRE_AUTH = oldRequireAuth;
  if (oldPublic === undefined) delete process.env.API_DOCS_PUBLIC; else process.env.API_DOCS_PUBLIC = oldPublic;
});

test('docsAuthGuard blocks unauthenticated access when enabled', { skip: docsAuthGuard ? false : 'dependencies are not installed; run npm install before docs guard tests' }, () => {
  const oldRequireAuth = process.env.API_DOCS_REQUIRE_AUTH;
  const oldJwtSecret = process.env.JWT_SECRET;

  process.env.API_DOCS_REQUIRE_AUTH = 'true';
  process.env.JWT_SECRET = 'test-docs-secret';

  const req = makeReq('');
  const res = makeRes();
  let calledNext = false;
  docsAuthGuard(req, res, () => { calledNext = true; });

  assert.equal(calledNext, false);
  assert.equal(res.statusCode, 401);

  if (oldRequireAuth === undefined) delete process.env.API_DOCS_REQUIRE_AUTH; else process.env.API_DOCS_REQUIRE_AUTH = oldRequireAuth;
  if (oldJwtSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldJwtSecret;
});

test('docsAuthGuard allows valid Bearer token when enabled', { skip: docsAuthGuard && jwt ? false : 'dependencies are not installed; run npm install before docs guard tests' }, () => {
  const oldRequireAuth = process.env.API_DOCS_REQUIRE_AUTH;
  const oldJwtSecret = process.env.JWT_SECRET;

  process.env.API_DOCS_REQUIRE_AUTH = 'true';
  process.env.JWT_SECRET = 'test-docs-secret';

  const token = jwt.sign({ sub: 'admin', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const req = makeReq(token);
  const res = makeRes();
  let calledNext = false;
  docsAuthGuard(req, res, () => { calledNext = true; });

  assert.equal(calledNext, true);
  assert.equal(req.docsUser.sub, 'admin');

  if (oldRequireAuth === undefined) delete process.env.API_DOCS_REQUIRE_AUTH; else process.env.API_DOCS_REQUIRE_AUTH = oldRequireAuth;
  if (oldJwtSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldJwtSecret;
});
