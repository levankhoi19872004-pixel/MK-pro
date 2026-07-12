'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ScopedBulkSelection = require('../public/js/shared/scoped-bulk-selection.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'), 'utf8');

function functionBody(name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} exists`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Cannot parse ${name}`);
}

test('Delivery Today renders one scoped order toggle and no duplicate clear/header bulk control', () => {
  assert.match(source, /id="delivery-order-list" data-selection-scope="delivery-order-list"/);
  assert.match(source, /id="deliveryTodayNewToggleOrders"[^>]*data-selection-toggle[^>]*aria-controls="deliveryTodayNewTable"/);
  assert.doesNotMatch(source, /deliveryTodayNewSelectAllOrders/);
  assert.doesNotMatch(source, /deliveryTodayNewClearOrders/);
  assert.doesNotMatch(source, /deliveryTodayNewHeaderSelectAllOrders/);
});

test('order-list toggle changes selectedOrderIds only and preserves explicit NVBH selection', () => {
  const orderRows = [{ orderId: 'A', viewSelectable: true }];
  const selectedOrders = new Set(['A']);
  const selectedSalesmanKeys = { STAFF1: true };
  let renderCount = 0;
  const sandbox = {
    window: { ScopedBulkSelection },
    getVisibleRowsBySelectedSalesmen: () => orderRows,
    ensureSelectedOrderSet: () => selectedOrders,
    orderSelectionKey: (row) => row.orderId,
    isViewSelectableOrder: (row) => row.viewSelectable === true,
    updateTopKpisFromSelectedSalesmen: () => {},
    renderRows: () => { renderCount += 1; },
    selectedSalesmanKeys
  };
  vm.runInNewContext(`${functionBody('toggleVisibleOrderSelection')}; toggleVisibleOrderSelection();`, sandbox);
  assert.deepEqual([...selectedOrders], []);
  assert.deepEqual(selectedSalesmanKeys, { STAFF1: true });

  vm.runInNewContext('toggleVisibleOrderSelection();', sandbox);
  assert.deepEqual([...selectedOrders], ['A']);
  assert.deepEqual(selectedSalesmanKeys, { STAFF1: true });
  assert.equal(renderCount, 2);
});

test('manual order checkbox and clear helper do not mutate NVBH state', () => {
  const manual = functionBody('toggleOrderSelection');
  const clear = functionBody('clearSelectedOrders');
  for (const body of [manual, clear]) {
    assert.doesNotMatch(body, /selectedSalesmanKeys/);
    assert.doesNotMatch(body, /selectGroupOrders/);
    assert.doesNotMatch(body, /salesmanKey\(/);
    assert.doesNotMatch(body, /renderSalesmanGroupPanel/);
  }
  assert.match(manual, /updateTopKpisFromSelectedSalesmen\(\)/);
  assert.match(manual, /renderRows\(\)/);
});

test('closeout payload still uses selected plus closeout-eligible rows only', () => {
  const selectedRows = functionBody('selectedCloseoutRows');
  const submit = functionBody('submitCloseout');
  assert.match(selectedRows, /getCloseoutSelectionSummary\(\)\.eligibleRows/);
  assert.match(submit, /var rows = selectionSummary\.eligibleRows/);
  assert.match(submit, /selectedOrderIds: orderIds/);
});
