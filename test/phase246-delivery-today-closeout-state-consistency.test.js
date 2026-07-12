'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const UI_PATH = path.join(ROOT, 'public/js/app/new/91-delivery-today-new.js');
const SERVICE_PATH = path.join(ROOT, 'src/services/v2/deliveryTodayNew.service.js');
const uiSource = fs.readFileSync(UI_PATH, 'utf8');
const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} exists`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Cannot parse ${functionName}`);
}

function loadSelectors() {
  const names = [
    'rowKey',
    'orderSelectionKey',
    'orderCancelledOrDeleted',
    'deriveCloseoutUiState',
    'isConfirmed',
    'statusLabel',
    'isViewSelectableOrder',
    'isCloseoutEligibleOrder',
    'deriveCloseoutSelectionSummary'
  ];
  const code = `${names.map((name) => functionBody(uiSource, name)).join('\n')}
    ({
      rowKey,
      deriveCloseoutUiState,
      isConfirmed,
      statusLabel,
      isViewSelectableOrder,
      isCloseoutEligibleOrder,
      deriveCloseoutSelectionSummary
    });`;
  return vm.runInNewContext(code, {});
}

function row(code, fields = {}) {
  return {
    orderId: code,
    orderCode: code,
    accountingConfirmed: false,
    accountingStatus: 'pending',
    closeoutEligibility: { eligible: false, code: 'DELIVERY_NOT_COMPLETED' },
    closeoutEligible: false,
    viewSelectable: true,
    ...fields
  };
}

test('Phase246 B0039299-like selected but not eligible is fail-closed across badge counter button and payload', () => {
  const selectors = loadSelectors();
  const rows = [row('B0039299')];
  const summary = selectors.deriveCloseoutSelectionSummary(rows, new Set(['B0039299']));

  assert.equal(selectors.statusLabel(rows[0]), 'Chưa chốt');
  assert.equal(selectors.deriveCloseoutUiState(rows[0]).closeoutEligible, false);
  assert.equal(summary.totalOrders, 1);
  assert.equal(summary.selectedOrders, 1);
  assert.equal(summary.eligibleSelectedOrders, 0);
  assert.equal(summary.closedSelectedOrders, 0);
  assert.equal(summary.eligibleRows.length, 0);
  assert.equal(summary.eligibleSelectedOrders > 0, false, 'closeout button must be disabled');
});

test('Phase246 selector covers eligible, rejected, closed, mixed and missing eligibility cases', () => {
  const selectors = loadSelectors();
  const eligible = row('ELIGIBLE', {
    closeoutEligibility: { eligible: true, code: 'READY' },
    closeoutEligible: true
  });
  const rejected = row('REJECTED');
  const closed = row('CLOSED', {
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    closeoutEligibility: { eligible: false, code: 'ALREADY_ACCOUNTING_CONFIRMED' }
  });
  const missing = row('MISSING', {
    closeoutEligibility: undefined,
    closeoutEligible: undefined
  });

  let summary = selectors.deriveCloseoutSelectionSummary([eligible], new Set(['ELIGIBLE']));
  assert.equal(summary.selectedOrders, 1);
  assert.equal(summary.eligibleSelectedOrders, 1);
  assert.equal(summary.closedSelectedOrders, 0);
  assert.deepEqual(summary.eligibleRows.map(selectors.rowKey), ['ELIGIBLE']);

  summary = selectors.deriveCloseoutSelectionSummary([rejected], new Set(['REJECTED']));
  assert.equal(summary.selectedOrders, 1);
  assert.equal(summary.eligibleSelectedOrders, 0);
  assert.equal(summary.closedSelectedOrders, 0);
  assert.deepEqual(summary.eligibleRows, []);

  summary = selectors.deriveCloseoutSelectionSummary([closed], new Set(['CLOSED']));
  assert.equal(summary.selectedOrders, 1);
  assert.equal(summary.eligibleSelectedOrders, 0);
  assert.equal(summary.closedSelectedOrders, 1);
  assert.equal(selectors.isCloseoutEligibleOrder(closed), false);

  summary = selectors.deriveCloseoutSelectionSummary([eligible, rejected, closed], new Set(['ELIGIBLE', 'REJECTED', 'CLOSED']));
  assert.equal(summary.selectedOrders, 3);
  assert.equal(summary.eligibleSelectedOrders, 1);
  assert.equal(summary.closedSelectedOrders, 1);
  assert.deepEqual(summary.eligibleRows.map(selectors.rowKey), ['ELIGIBLE']);

  summary = selectors.deriveCloseoutSelectionSummary([missing], new Set(['MISSING']));
  assert.equal(summary.eligibleSelectedOrders, 0);
  assert.deepEqual(summary.eligibleRows, []);
});

test('Phase246 reload and NVBH multi-select recompute eligible payload from fresh selected rows', () => {
  const selectors = loadSelectors();
  const selected = new Set(['A', 'B', 'C']);
  const beforeReload = [row('A', { closeoutEligibility: { eligible: true }, closeoutEligible: true })];
  const afterReload = [row('A', { closeoutEligibility: { eligible: false }, closeoutEligible: false })];
  const mixedSalesmanRows = [
    row('A', { closeoutEligibility: { eligible: true }, closeoutEligible: true, salesStaffCode: 'BANBUON' }),
    row('B', { closeoutEligibility: { eligible: false }, closeoutEligible: false, salesStaffCode: 'BANBUON' }),
    row('C', { accountingConfirmed: true, accountingStatus: 'confirmed', closeoutEligibility: { eligible: false }, closeoutEligible: false, salesStaffCode: 'GHNPP' })
  ];

  assert.equal(selectors.deriveCloseoutSelectionSummary(beforeReload, new Set(['A'])).eligibleSelectedOrders, 1);
  assert.equal(selectors.deriveCloseoutSelectionSummary(afterReload, new Set(['A'])).eligibleSelectedOrders, 0);

  const summary = selectors.deriveCloseoutSelectionSummary(mixedSalesmanRows, selected);
  assert.equal(summary.selectedOrders, 3);
  assert.equal(summary.eligibleSelectedOrders, 1);
  assert.deepEqual(summary.eligibleRows.map(selectors.rowKey), ['A']);
});

test('Phase246 UI wires row badge toolbar button and payload to canonical closeout summary', () => {
  assert.match(uiSource, /function deriveCloseoutUiState/);
  assert.match(uiSource, /function deriveCloseoutSelectionSummary/);

  const rowBody = functionBody(uiSource, 'renderOrderRow');
  assert.match(rowBody, /var closeoutState = deriveCloseoutUiState\(row\)/);
  assert.match(rowBody, /closeoutState\.statusLabel/);

  const toolbarBody = functionBody(uiSource, 'updateOrderSelectionToolbar');
  assert.match(toolbarBody, /var summary = getCloseoutSelectionSummary\(visible\)/);
  assert.match(toolbarBody, /summary\.eligibleSelectedOrders/);
  assert.match(toolbarBody, /summary\.closedSelectedOrders/);

  const buttonBody = functionBody(uiSource, 'updateCloseoutButton');
  assert.match(buttonBody, /var selectionSummary = getCloseoutSelectionSummary\(\)/);
  assert.match(buttonBody, /selectionSummary\.eligibleSelectedOrders === 0 \|\| state\.closeoutBusy === true/);
  assert.match(buttonBody, /aria-disabled/);
  assert.doesNotMatch(buttonBody, /updateOrderSelectionToolbar/);

  const submitBody = functionBody(uiSource, 'submitCloseout');
  assert.match(submitBody, /var selectionSummary = getCloseoutSelectionSummary\(\)/);
  assert.match(submitBody, /var rows = selectionSummary\.eligibleRows/);
  assert(submitBody.indexOf('if (!rows.length)') < submitBody.indexOf("fetch('/api/new/delivery-today/closeout'"));
});

test('Phase246 backend read model keeps closeoutEligible equal to closeoutEligibility.eligible', () => {
  assert.match(serviceSource, /const closeoutEligibility = evaluateCloseoutEligibility\(order,\s*\{\s*confirmedCloseout\s*\}\)/);
  assert.match(serviceSource, /const closeoutEligible = closeoutEligibility\.eligible === true/);
  assert.match(serviceSource, /accountingConfirmed: confirmedCloseout/);
  assert.match(serviceSource, /closeoutEligible,\s*\n\s*closeoutEligibility,/);
});
