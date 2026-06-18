'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('ReturnStateMachine defines canonical A5 states and transitions', () => {
  const file = 'src/domain/lifecycle/ReturnStateMachine.js';
  assert.equal(fs.existsSync(path.join(ROOT, file)), true, `${file} must exist`);

  const source = read(file);

  for (const state of [
    'draft',
    'waiting_receive',
    'received',
    'accounting_confirmed',
    'posted_to_ar',
    'cancelled'
  ]) {
    assert.match(source, new RegExp(state));
  }

  assert.match(source, /assertCanEdit/);
  assert.match(source, /assertCanPostAR/);
  assert.match(source, /assertCanConfirmAccounting/);
  assert.match(source, /INVALID_RETURN_STATE_TRANSITION/);
});

test('confirmReceiveReturnOrder only receives stock and does not post AR directly', () => {
  const source = read('src/services/returnOrderLegacy.service.js');
  const match = source.match(/async function confirmReceiveReturnOrder[\s\S]*?\n}\n\nasync function confirmAccountingReturnOrder/);
  assert.ok(match, 'confirmReceiveReturnOrder block must exist');

  const block = match[0];

  assert.match(block, /RETURN_STATES\.RECEIVED/);
  assert.match(block, /InventoryPostingService\.postReturnIn/);
  assert.doesNotMatch(block, /postReturnOrderArIfNeeded/);
  assert.doesNotMatch(block, /accountingConfirmed:\s*true/);
});

test('AR return posting is blocked unless return order is accounting_confirmed', () => {
  const source = read('src/services/returnOrderLegacy.service.js');
  const match = source.match(/async function postReturnOrderArIfNeeded[\s\S]*?SCOPED FIX: RETURN_ORDER_POST_AR_DIRECT_END/);
  assert.ok(match, 'postReturnOrderArIfNeeded block must exist');

  const block = match[0];
  assert.match(block, /assertCanPostAR/);
  assert.match(block, /POSTED_TO_AR/);
});

test('return edit/cancel paths use state machine guards', () => {
  const source = read('src/services/returnOrderLegacy.service.js');

  assert.match(source, /assertCanEdit/);
  assert.match(source, /assertCanCancel/);
  assert.match(source, /confirmAccountingReturnOrder/);
});

test('return accounting API and migration script exist', () => {
  const controller = read('src/controllers/returnOrderController.js');
  const routes = read('src/routes/returnRoutes.js');
  const pkg = read('package.json');

  assert.match(controller, /confirmAccounting/);
  assert.match(routes, /confirm-accounting/);
  assert.match(routes, /requireRole\(\['admin', 'accountant'\]\)/);
  assert.match(pkg, /migrate:return-state/);
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts/migrate-return-state-machine.js')), true);
});
