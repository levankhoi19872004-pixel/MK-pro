'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectInput, securityInputGuard } = require('../src/middlewares/securityInput.middleware');

test('NoSQL operator and prototype-pollution keys are rejected', () => {
  assert.equal(inspectInput({ username: { $ne: null } }).code, 'UNSAFE_INPUT_KEY');
  assert.equal(inspectInput({ 'profile.name': 'x' }).code, 'UNSAFE_INPUT_KEY');
  const unsafe = JSON.parse('{"__proto__":{"isAdmin":true}}');
  assert.equal(inspectInput(unsafe).code, 'UNSAFE_INPUT_KEY');
  assert.equal(inspectInput({ customer: { code: 'KH01' }, items: [{ productCode: 'P1' }] }), null);
});

test('securityInputGuard returns 400 before controller execution', () => {
  let status = 0;
  let payload = null;
  let nextCalled = false;
  const req = { body: { filter: { $where: 'sleep(1000)' } }, query: {}, params: {} };
  const res = {
    status(value) { status = value; return this; },
    json(value) { payload = value; return value; }
  };
  securityInputGuard(req, res, () => { nextCalled = true; });
  assert.equal(status, 400);
  assert.equal(payload.code, 'UNSAFE_INPUT_KEY');
  assert.equal(nextCalled, false);
});
