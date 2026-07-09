'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);
const ReturnStateMachine = require('../src/domain/lifecycle/ReturnStateMachine');

test('legacy grouped status is normalized to waiting_receive and can be received', () => {
  const { RETURN_STATES } = ReturnStateMachine;
  assert.equal(ReturnStateMachine.normalizeReturnState('grouped'), RETURN_STATES.WAITING_RECEIVE);
  assert.equal(ReturnStateMachine.getReturnState({ status: 'grouped' }), RETURN_STATES.WAITING_RECEIVE);
  assert.equal(ReturnStateMachine.canTransition('grouped', RETURN_STATES.RECEIVED), true);
});

test('creating a master return keeps lifecycle separate from merge status', () => {
  const source = read('src/services/masterReturnOrderService.js');
  const start = source.indexOf('async function createMasterReturnOrder');
  const end = source.indexOf('async function updateMasterReturnOrder', start);
  const block = source.slice(start, end);

  assert.match(block, /ReturnStateMachine\.patchForState\(\{\}, RETURN_STATES\.WAITING_RECEIVE\)/);
  assert.match(block, /returnMergeStatus:\s*'merged'/);
  assert.doesNotMatch(block, /status:\s*'grouped'/);
});

test('received master returns are not classified as cancelled/deleted', () => {
  const source = read('src/services/masterReturnOrderService.js');
  const inactiveBlock = source.slice(
    source.indexOf('const INACTIVE_RETURN_STATUSES'),
    source.indexOf('const GROUPABLE_RETURN_STATUSES')
  );
  assert.doesNotMatch(inactiveBlock, /'received'/);
  assert.doesNotMatch(inactiveBlock, /'completed'/);
  assert.match(source, /alreadyReceived:\s*true/);
});

test('received child keeps canonical received lifecycle and separate merged flag', () => {
  const source = read('src/services/masterReturnOrderService.js');
  const start = source.indexOf('async function confirmReceiveMasterReturnOrder');
  const end = source.indexOf('async function cancelMasterReturnOrder', start);
  const block = source.slice(start, end);

  assert.match(block, /patchForState\(child, RETURN_STATES\.RECEIVED\)/);
  assert.match(block, /returnState:\s*RETURN_STATES\.RECEIVED/);
  assert.match(block, /returnMergeStatus:\s*'merged'/);
  assert.doesNotMatch(block, /warehouseReceiveStatus:\s*'posted'/);
});

test('master return UI keeps read-only selection but retired batch receive never posts stock', () => {
  const source = read('public/js/app/debt/07d-master-return-orders.js');
  assert.match(source, /MASTER_RETURN_INACTIVE_STATES/);
  assert.match(source, /master-return-order-check:checked:not\(:disabled\)/);
  assert.match(source, /master-return-order-check:not\(:disabled\)/);
  const receiveBlock = source.slice(source.indexOf('async function receiveSelectedMasterReturnOrders'), source.indexOf('// Return-order UI events'));
  assert.match(receiveBlock, /notifyMasterReturnRetired\('nhập kho hàng loạt qua đơn tổng trả'\)/);
  assert.doesNotMatch(receiveBlock, /fetch\(/);
  assert.doesNotMatch(source, /\/api\/master-return-orders\/[^`'"\s]+\/receive/);
});

test('return-state migration supports dry-run and canonicalizes legacy grouped rows', () => {
  const source = read('scripts/migrate-return-state-machine.js');
  const pkg = read('package.json');
  assert.match(source, /process\.argv\.includes\('--write'\)/);
  assert.match(source, /\['grouped', 'merged'\]/);
  assert.match(source, /patch\.returnMergeStatus = 'merged'/);
  assert.match(pkg, /migrate:return-state:dry/);
  assert.match(pkg, /migrate-return-state-machine\.js --write/);
});
