'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { tenantContext } = require('../src/middlewares/tenant.middleware');
const { scopeTenant, normalizeTenantId } = require('../src/utils/tenant.util');

function run(req) {
  const res = {
    locals: {},
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  let nextCalled = false;
  tenantContext(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test('single tenant mode ignores untrusted tenant header for authenticated user', () => {
  const previous = process.env.TENANT_MODE;
  process.env.TENANT_MODE = 'single';
  const { nextCalled } = run({
    originalUrl: '/api/orders',
    headers: { 'x-tenant-id': 'other' },
    user: { tenantId: 'minh-khai', role: 'sales' }
  });
  assert.equal(nextCalled, true);
  if (previous === undefined) delete process.env.TENANT_MODE;
  else process.env.TENANT_MODE = previous;
});

test('tenant utility normalizes identifiers and scopes filters', () => {
  assert.equal(normalizeTenantId(' Minh Khai!* '), 'minhkhai');
  assert.deepEqual(scopeTenant({ status: 'active' }, 'npp-1'), { status: 'active', tenantId: 'npp-1' });
});
