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
  assert.ok(match, `${name} exists`);
  const start = match.index;
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
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

function baseSandbox() {
  const state = {
    hasSearched: true,
    selectedSalesmanKeys: { SALES_A: false, SALES_B: true },
    selectedOrderIds: new Set(['B-1', 'HIDDEN-1']),
    rows: [
      { orderId: 'A-1', salesStaffCode: 'SALES_A', viewSelectable: true, closeoutEligible: true },
      { orderId: 'A-2', salesStaffCode: 'SALES_A', viewSelectable: true, closeoutEligible: true },
      { orderId: 'B-1', salesStaffCode: 'SALES_B', viewSelectable: true, closeoutEligible: true },
      { orderId: 'HIDDEN-1', salesStaffCode: 'SALES_C', viewSelectable: true, closeoutEligible: true }
    ]
  };
  const salesmanKey = (row) => row.salesStaffCode;
  const deriveCloseoutUiState = (row) => ({
    viewSelectable: row.viewSelectable === true,
    closeoutEligible: row.closeoutEligible === true,
    accountingConfirmed: row.accountingConfirmed === true
  });
  return {
    state,
    Set,
    Array,
    window: { ScopedBulkSelection },
    salesmanKey,
    selectedSalesmanSet: () => state.selectedSalesmanKeys,
    ensureSelectedOrderSet: () => state.selectedOrderIds,
    orderSelectionKey: (row) => row.orderId,
    isViewSelectableOrder: (row) => row.viewSelectable === true,
    deriveCloseoutUiState,
    updateTopKpisFromSelectedSalesmen: () => {},
    renderSalesmanGroupPanel: () => {},
    renderRows: () => {},
    updateCloseoutButton: () => {}
  };
}

function loadFunctions(sandbox, names) {
  vm.runInNewContext(names.map(functionSource).join('\n'), sandbox);
}

test('tick NVBH changes salesman filter state but leaves order action selection unchanged', () => {
  const sandbox = baseSandbox();
  const before = [...sandbox.state.selectedOrderIds].sort();
  loadFunctions(sandbox, ['applySelectedSalesmanFilter', 'toggleSalesmanSelection']);
  vm.runInNewContext("toggleSalesmanSelection('SALES_A', true);", sandbox);
  assert.equal(sandbox.state.selectedSalesmanKeys.SALES_A, true);
  assert.deepEqual([...sandbox.state.selectedOrderIds].sort(), before);
});

test('untick NVBH leaves selectedOrderIds unchanged', () => {
  const sandbox = baseSandbox();
  const before = [...sandbox.state.selectedOrderIds].sort();
  loadFunctions(sandbox, ['applySelectedSalesmanFilter', 'toggleSalesmanSelection']);
  vm.runInNewContext("toggleSalesmanSelection('SALES_B', false);", sandbox);
  assert.equal(sandbox.state.selectedSalesmanKeys.SALES_B, false);
  assert.deepEqual([...sandbox.state.selectedOrderIds].sort(), before);
});

test('tick order changes selectedOrderIds but leaves salesman filter state unchanged', () => {
  const sandbox = baseSandbox();
  const before = { ...sandbox.state.selectedSalesmanKeys };
  loadFunctions(sandbox, ['toggleOrderSelection']);
  vm.runInNewContext("toggleOrderSelection('A-1', true);", sandbox);
  assert.equal(sandbox.state.selectedOrderIds.has('A-1'), true);
  assert.deepEqual(sandbox.state.selectedSalesmanKeys, before);
});

test('toggle all changes only selectable order keys in the visible order scope', () => {
  const sandbox = baseSandbox();
  const beforeSalesmen = { ...sandbox.state.selectedSalesmanKeys };
  sandbox.getVisibleRowsBySelectedSalesmen = () => sandbox.state.rows.filter((row) => row.salesStaffCode === 'SALES_B');
  loadFunctions(sandbox, ['deriveOrderBulkSelectionState', 'toggleVisibleOrderSelection']);
  vm.runInNewContext('toggleVisibleOrderSelection();', sandbox);
  assert.equal(sandbox.state.selectedOrderIds.has('B-1'), false, 'visible selected order is cleared');
  assert.equal(sandbox.state.selectedOrderIds.has('HIDDEN-1'), true, 'hidden out-of-scope order is preserved');
  assert.deepEqual(sandbox.state.selectedSalesmanKeys, beforeSalesmen);
});

test('changing NVBH filter does not change closeout payload candidates', () => {
  const sandbox = baseSandbox();
  loadFunctions(sandbox, [
    'getVisibleRowsBySelectedSalesmen',
    'deriveCloseoutSelectionSummary',
    'getCloseoutSelectionSummary',
    'applySelectedSalesmanFilter',
    'toggleSalesmanSelection'
  ]);
  let summary = vm.runInNewContext('getCloseoutSelectionSummary();', sandbox);
  assert.deepEqual(summary.eligibleRows.map((row) => row.orderId).sort(), ['B-1', 'HIDDEN-1']);
  vm.runInNewContext("toggleSalesmanSelection('SALES_B', false);", sandbox);
  summary = vm.runInNewContext('getCloseoutSelectionSummary();', sandbox);
  assert.deepEqual(summary.eligibleRows.map((row) => row.orderId).sort(), ['B-1', 'HIDDEN-1']);
});

test('refetch reconciliation prunes missing order IDs and never auto-adds new rows', () => {
  const sandbox = baseSandbox();
  sandbox.state.selectedOrderIds = new Set(['B-1', 'STALE-1']);
  loadFunctions(sandbox, ['pruneStaleOrderSelection']);
  vm.runInNewContext("pruneStaleOrderSelection([{ orderId: 'B-1', viewSelectable: true }, { orderId: 'NEW-1', viewSelectable: true }]);", sandbox);
  assert.deepEqual([...sandbox.state.selectedOrderIds], ['B-1']);
  assert.equal(sandbox.state.selectedOrderIds.has('NEW-1'), false);
});

test('salesman and order selection domains remain independent in both directions', () => {
  const sandbox = baseSandbox();
  loadFunctions(sandbox, [
    'applySelectedSalesmanFilter',
    'toggleSalesmanSelection',
    'toggleOrderSelection'
  ]);
  vm.runInNewContext("toggleSalesmanSelection('SALES_A', true); toggleOrderSelection('A-2', true);", sandbox);
  assert.equal(sandbox.state.selectedSalesmanKeys.SALES_A, true);
  assert.equal(sandbox.state.selectedOrderIds.has('A-2'), true);
  vm.runInNewContext("toggleSalesmanSelection('SALES_A', false); toggleOrderSelection('A-2', false);", sandbox);
  assert.equal(sandbox.state.selectedSalesmanKeys.SALES_A, false);
  assert.equal(sandbox.state.selectedOrderIds.has('A-2'), false);
  assert.equal(sandbox.state.selectedOrderIds.has('HIDDEN-1'), true);
});
