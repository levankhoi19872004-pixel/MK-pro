'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const UI_PATH = path.join(__dirname, '../public/js/app/new/91-delivery-today-new.js');
const source = fs.readFileSync(UI_PATH, 'utf8');

function functionBody(functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} exists`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Cannot parse ${functionName}`);
}

function selectors() {
  const names = ['rowKey','orderSelectionKey','orderCancelledOrDeleted','deriveCloseoutUiState','deriveCloseoutSelectionSummary'];
  return vm.runInNewContext(`${names.map(functionBody).join('\n')}\n({rowKey,deriveCloseoutUiState,deriveCloseoutSelectionSummary})`, {});
}

function order(code, eligible, confirmed = false) {
  return {
    orderId: code,
    orderCode: code,
    viewSelectable: true,
    accountingConfirmed: confirmed,
    accountingStatus: confirmed ? 'confirmed' : 'pending',
    closeoutEligibility: { eligible, code: eligible ? 'ELIGIBLE' : 'DELIVERY_NOT_COMPLETED' },
    closeoutEligible: eligible
  };
}

function runtimeHarness(initialRows, selectedIds) {
  const apiCalls = [];
  let reloads = 0;
  let rows = initialRows;
  const selected = new Set(selectedIds);
  const s = selectors();
  const summary = () => s.deriveCloseoutSelectionSummary(rows, selected);
  return {
    summary,
    buttonEnabled: () => summary().eligibleSelectedOrders > 0,
    async submit() {
      const eligibleRows = summary().eligibleRows;
      if (!eligibleRows.length) return { called: false };
      apiCalls.push(eligibleRows.map(s.rowKey));
      rows = rows.map((row) => eligibleRows.some((item) => s.rowKey(item) === s.rowKey(row))
        ? { ...row, accountingConfirmed: true, accountingStatus: 'confirmed', closeoutEligibility: { eligible: false, code: 'ALREADY_ACCOUNTING_CONFIRMED' }, closeoutEligible: false }
        : row);
      reloads += 1;
      return { called: true };
    },
    replaceRows(nextRows) { rows = nextRows; reloads += 1; },
    apiCalls: () => apiCalls,
    reloads: () => reloads
  };
}

test('Phase247 runtime A: eligible row enables button, calls API, reloads canonical closed state', async () => {
  const runtime = runtimeHarness([order('A', true)], ['A']);
  assert.equal(runtime.buttonEnabled(), true);
  assert.equal((await runtime.submit()).called, true);
  assert.deepEqual(runtime.apiCalls(), [['A']]);
  assert.equal(runtime.reloads(), 1);
  assert.equal(runtime.summary().closedSelectedOrders, 1);
  assert.equal(runtime.summary().eligibleSelectedOrders, 0);
});

test('Phase247 runtime B: rejected selected row disables button and never calls API', async () => {
  const runtime = runtimeHarness([order('B0039299', false)], ['B0039299']);
  assert.equal(runtime.buttonEnabled(), false);
  assert.equal((await runtime.submit()).called, false);
  assert.deepEqual(runtime.apiCalls(), []);
});

test('Phase247 runtime C: mixed selection submits only eligible rows', async () => {
  const runtime = runtimeHarness([order('A', true), order('B', false), order('C', false, true)], ['A','B','C']);
  assert.equal(runtime.summary().selectedOrders, 3);
  assert.equal(runtime.summary().eligibleSelectedOrders, 1);
  await runtime.submit();
  assert.deepEqual(runtime.apiCalls(), [['A']]);
});

test('Phase247 runtime D: reload eligibility change recomputes toolbar, button and payload', async () => {
  const runtime = runtimeHarness([order('A', true)], ['A']);
  assert.equal(runtime.buttonEnabled(), true);
  runtime.replaceRows([order('A', false)]);
  assert.equal(runtime.summary().eligibleSelectedOrders, 0);
  assert.equal(runtime.buttonEnabled(), false);
  assert.equal((await runtime.submit()).called, false);
});
