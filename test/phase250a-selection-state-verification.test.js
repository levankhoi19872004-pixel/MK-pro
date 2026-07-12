'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ScopedBulkSelection = require('../public/js/shared/scoped-bulk-selection.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'), 'utf8');

function functionSource(name) {
  const matcher = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = matcher.exec(source);
  const start = match ? match.index : -1;
  assert.notEqual(start, -1, `${name} exists`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Cannot extract ${name}`);
}

function selectable(row) { return row.viewSelectable === true; }

function baseSelectionSandbox() {
  const state = {
    selectedSalesmanKeys: { SALES_A: false, SALES_B: true },
    selectedOrderIds: new Set(['B-1']),
    salesmanGroups: [
      { key: 'SALES_A', orders: [{ orderId: 'A-1', viewSelectable: true }, { orderId: 'A-2', viewSelectable: true }] },
      { key: 'SALES_B', orders: [{ orderId: 'B-1', viewSelectable: true }] }
    ]
  };
  return {
    state,
    ensureSelectedOrderSet: () => state.selectedOrderIds,
    groupSelectableRows: (group) => (group.orders || []).filter(selectable),
    orderSelectionKey: (row) => row.orderId,
    applySelectedSalesmanFilter: () => {},
    updateTopKpisFromSelectedSalesmen: () => {},
    renderSalesmanGroupPanel: () => {},
    renderRows: () => {},
    updateCloseoutButton: () => {},
    getVisibleRowsBySelectedSalesmen: () => state.salesmanGroups.flatMap((group) => group.orders),
    isViewSelectableOrder: selectable,
    window: { ScopedBulkSelection },
    Set
  };
}

test('Track A remediation: ticking NVBH no longer mutates selectedOrderIds', () => {
  const sandbox = baseSelectionSandbox();
  const before = [...sandbox.state.selectedOrderIds];
  vm.runInNewContext(`${functionSource('applySelectedSalesmanFilter')}
${functionSource('toggleSalesmanSelection')}
toggleSalesmanSelection('SALES_A', true);`, sandbox);
  assert.deepEqual([...sandbox.state.selectedOrderIds], before);
  assert.equal(sandbox.state.selectedSalesmanKeys.SALES_A, true);
});

test('Track A: ticking an order does not mutate selectedSalesmanKeys', () => {
  const sandbox = baseSelectionSandbox();
  const before = { ...sandbox.state.selectedSalesmanKeys };
  vm.runInNewContext(`${functionSource('toggleOrderSelection')}\ntoggleOrderSelection('A-1', true);`, sandbox);
  assert.deepEqual(sandbox.state.selectedSalesmanKeys, before);
  assert.equal(sandbox.state.selectedOrderIds.has('A-1'), true);
});

test('Track A: order-list toggle changes order state only, not NVBH checkboxes', () => {
  const sandbox = baseSelectionSandbox();
  const before = { ...sandbox.state.selectedSalesmanKeys };
  vm.runInNewContext(`${functionSource('deriveOrderBulkSelectionState')}\n${functionSource('toggleVisibleOrderSelection')}\ntoggleVisibleOrderSelection();`, sandbox);
  assert.deepEqual(sandbox.state.selectedSalesmanKeys, before);
  assert.deepEqual([...sandbox.state.selectedOrderIds].sort(), ['A-1', 'A-2', 'B-1']);
});

test('Track A: closeout selection and payload derive from selectedOrderIds plus eligibility', () => {
  const rows = [
    { orderId: 'A-1', viewSelectable: true, closeoutEligible: true },
    { orderId: 'A-2', viewSelectable: true, closeoutEligible: false },
    { orderId: 'B-1', viewSelectable: true, closeoutEligible: true }
  ];
  const sandbox = {
    rows,
    selected: new Set(['A-1', 'A-2']),
    Set,
    orderSelectionKey: (row) => row.orderId,
    deriveCloseoutUiState: (row) => ({
      viewSelectable: row.viewSelectable,
      closeoutEligible: row.closeoutEligible,
      accountingConfirmed: false
    })
  };
  vm.runInNewContext(`${functionSource('deriveCloseoutSelectionSummary')}\nresult = deriveCloseoutSelectionSummary(rows, selected);`, sandbox);
  assert.deepEqual(sandbox.result.selectedRows.map((row) => row.orderId), ['A-1', 'A-2']);
  assert.deepEqual(sandbox.result.eligibleRows.map((row) => row.orderId), ['A-1']);

  const submit = functionSource('submitCloseout');
  assert.match(submit, /var selectionSummary = getCloseoutSelectionSummary\(\)/);
  assert.match(submit, /var rows = selectionSummary\.eligibleRows/);
  assert.match(submit, /var orderIds = rows\.map\(rowKey\)/);
  assert.match(submit, /selectedOrderIds: orderIds/);
  assert.match(submit, /closeoutScope: 'selected_orders'/);
});

test('Track A remediation: reload reconciles stale order keys without default auto-selection', () => {
  const load = functionSource('load');
  assert.match(load, /pruneStaleOrderSelection\(state\.rows\)/);
  assert.doesNotMatch(load, /selectDefaultOrdersForSelectedSalesmen/);
  assert.doesNotMatch(load, /state\.selectedOrderIds = new Set\(\);[\s\S]*state\.salesmanGroups\.forEach/);
});
