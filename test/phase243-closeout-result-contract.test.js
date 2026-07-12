'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`Cannot parse ${name}`);
}

test('Phase243 finalizer rejects all ineligible orders instead of idempotent success', () => {
  const { buildCloseoutResult } = require('../src/services/accounting/closeout/CloseoutFinalizer');
  const result = buildCloseoutResult({
    command: { date: '2026-07-12', reason: 'test' },
    orders: [{ id: 'SO1' }],
    selectedOrderCodes: ['B0039299']
  }, {
    results: [{
      orderId: 'SO1',
      orderCode: 'B0039299',
      outcome: 'rejected',
      reasonCode: 'DELIVERY_NOT_COMPLETED',
      accountingConfirmed: false
    }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'rejected');
  assert.equal(result.httpStatus, 409);
  assert.equal(result.confirmedOrders, 0);
  assert.equal(result.rejectedOrders, 1);
  assert.equal(result.results[0].outcome, 'rejected');
});

test('Phase243 finalizer keeps already confirmed orders idempotent with explicit outcome', () => {
  const { buildCloseoutResult } = require('../src/services/accounting/closeout/CloseoutFinalizer');
  const result = buildCloseoutResult({
    command: { date: '2026-07-12', reason: 'test' },
    orders: [{ id: 'SO1' }]
  }, {
    results: [{
      orderId: 'SO1',
      outcome: 'already_confirmed',
      accountingConfirmed: true
    }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'idempotent');
  assert.equal(result.confirmedOrders, 0);
  assert.equal(result.alreadyConfirmedOrders, 1);
});

test('Phase243 frontend uses result outcome as the only local closeout patch evidence', () => {
  const source = read('public/js/app/new/91-delivery-today-new.js');
  const patchBody = functionBody(source, 'patchCloseoutRowsFromResult');
  const eligibilityBody = functionBody(source, 'isCloseoutEligibleOrder');
  const submitBody = functionBody(source, 'submitCloseout');

  assert.match(source, /function isSuccessfulCloseoutResult/);
  assert.match(source, /outcome === 'confirmed' \|\| outcome === 'already_confirmed'/);
  assert.match(source, /ref\.accountingConfirmed === true/);
  assert.doesNotMatch(patchBody, /results\)\s*&&\s*results\.length\s*\?\s*results\s*:\s*submittedRows/);
  assert.doesNotMatch(patchBody, /submittedRows/);
  assert.match(source, /closeoutEligibility[\s\S]*eligible === true/);
  assert.doesNotMatch(eligibilityBody, /return true;\s*$/);
  assert.match(submitBody, /json\.ok === false/);
  assert.match(submitBody, /status === 'rejected'/);
  assert.match(submitBody, /await load\(\{\s*silent:\s*true\s*\}\)/);
});

test('Phase243 backend exposes shared eligibility and route preserves rejected contract', () => {
  const closeout = read('src/services/accounting/AccountingCloseoutService.js');
  const listService = read('src/services/v2/deliveryTodayNew.service.js');
  const route = read('src/routes/newOperationsRoutes.js');

  assert.match(closeout, /evaluateCloseoutEligibility\(order\)/);
  assert.match(closeout, /outcome:\s*'rejected'/);
  assert.match(closeout, /reasonCode:\s*'ALREADY_ACCOUNTING_CONFIRMED'/);
  assert.match(closeout, /PERSISTENCE_VERIFICATION_FAILED/);
  assert.match(listService, /evaluateCloseoutEligibility\(order,\s*\{\s*confirmedCloseout\s*\}\)/);
  assert.match(listService, /closeoutEligibilityCode/);
  assert.match(route, /result\.ok === false/);
  assert.match(route, /res\.status\(statusCode\)\.json\(\{/);
  assert.match(route, /alreadyConfirmedOrders/);
  assert.match(route, /rejectedOrders/);
});
