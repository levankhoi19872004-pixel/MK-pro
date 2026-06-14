'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { retiredRoute, getRetiredRouteMetrics } = require('../src/middlewares/retiredRoute.middleware');

test('retired route returns 410 and counts legacy client hits', () => {
  let statusCode = 0;
  let body = null;
  const handler = retiredRoute('test-mobile-legacy', { replacement: '/api/mobile' });
  handler({ method: 'GET', originalUrl: '/api/mobile-legacy/orders' }, {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; }
  });
  assert.equal(statusCode, 410);
  assert.equal(body.code, 'ROUTE_RETIRED');
  assert.equal(body.replacement, '/api/mobile');
  assert.equal(getRetiredRouteMetrics()['test-mobile-legacy'], 1);
});
