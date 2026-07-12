'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'), 'utf8');

function bodyOf(functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} exists`);
  const end = nextFunctionName ? source.indexOf(`function ${nextFunctionName}`, start + 1) : source.length;
  return source.slice(start, end === -1 ? source.length : end);
}

test('checking or unchecking an NVBH selects or removes its view-selectable orders', () => {
  const body = bodyOf('toggleSalesmanSelection', 'renderSalesmanGroupPanel');
  assert.match(body, /state\.selectedSalesmanKeys\[key\]\s*=\s*Boolean\(checked\)/);
  assert.match(body, /selectGroupOrders\(group, Boolean\(checked\)\)/);
  assert.match(body, /applySelectedSalesmanFilter\(\)/);
});

test('manual order checkbox updates NVBH checkbox state and KPI', () => {
  const body = bodyOf('toggleOrderSelection', 'selectAllVisibleOrders');
  assert.match(body, /findRowByOrderKey\(key\)/);
  assert.match(body, /salesmanKey\(row\)/);
  assert.match(body, /groupSelectedCount\(group\) > 0/);
  assert.match(body, /updateTopKpisFromSelectedSalesmen\(\)/);
  assert.match(body, /renderSalesmanGroupPanel\(\)/);
});

test('default load ticks all NVBH and selects view-selectable orders for tracking', () => {
  assert.match(source, /state\.salesmanGroups\.forEach\(function \(group\) \{ state\.selectedSalesmanKeys\[group\.key\] = true; \}\);\n\s*selectDefaultOrdersForSelectedSalesmen\(\);/);
  const body = bodyOf('selectDefaultOrdersForSelectedSalesmen', 'pruneSelectedOrderIds');
  assert.match(body, /state\.selectedOrderIds = new Set\(\)/);
  assert.match(body, /selectGroupOrders\(group, true\)/);
});

test('selected KPI and closeout use selected orders, not every visible order', () => {
  const kpiBody = bodyOf('updateTopKpisFromSelectedSalesmen', 'ensureSelectedOrderSet');
  assert.match(kpiBody, /summarizeVisibleRows\(getSelectedOrders\(\)\)/);
  const closeoutRowsBody = bodyOf('selectedCloseoutRows', 'closeoutSummary');
  assert.match(closeoutRowsBody, /getSelectedOrders\(\)/);
  const submitBody = bodyOf('submitCloseout', 'rowKey');
  assert.match(submitBody, /var rows = selectedCloseoutRows\(\)/);
  assert.match(submitBody, /orderIds: orderIds/);
  assert.match(submitBody, /closeoutScope:\s*'selected_orders'/);
});

test('unselecting all NVBH gives an empty selected-state message and disabled closeout', () => {
  assert.match(source, /Chưa chọn NVBH nào\./);
  const renderRowsBody = bodyOf('renderRows', 'selectedCloseoutRows');
  assert.match(renderRowsBody, /!visibleRows\.length/);
  assert.match(renderRowsBody, /delivery-new-no-salesman-selected/);
  const canCloseoutBody = bodyOf('canCloseoutSelectedOrders', 'applySelectedSalesmanFilter');
  assert.match(canCloseoutBody, /selectedCloseoutRows\(\)\.length > 0/);
});
