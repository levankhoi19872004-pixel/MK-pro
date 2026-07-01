'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'), 'utf8');

test('Delivery Today New has salesman grouping panel like legacy delivery screen', () => {
  assert.match(source, /NVBH thuộc NVGH/);
  assert.match(source, /delivery-new-salesman-panel/);
  assert.match(source, /delivery-new-salesman-row/);
  assert.match(source, /delivery-new-salesman-compact/);
  assert.doesNotMatch(source, /delivery-new-salesman-kpis/);
});

test('Delivery Today New salesman grouping supports checkbox selection', () => {
  assert.match(source, /type="checkbox"/);
  assert.match(source, /toggleSalesmanSelection/);
  assert.match(source, /selectedSalesmanKeys/);
  assert.match(source, /Bỏ chọn tất cả/);
  assert.match(source, /Chọn tất cả/);
});

test('Delivery Today New rows and compact selected-salesman total use selected salesman filter', () => {
  assert.match(source, /getVisibleRowsBySelectedSalesmen/);
  assert.match(source, /summarizeVisibleRows/);
  assert.match(source, /renderSelectedSalesmanCompactSummary/);
  assert.match(source, /renderSalesmanGroupPanel/);
  const renderRowsIndex = source.indexOf('function renderRows');
  const renderRowsBody = source.slice(renderRowsIndex, source.indexOf('function detailCell', renderRowsIndex));
  assert.match(renderRowsBody, /getVisibleRowsBySelectedSalesmen/);
  assert.doesNotMatch(renderRowsBody, /state\.rows\.map/);
});

test('Delivery Today New salesman grouping does not touch legacy accounting flows', () => {
  assert.doesNotMatch(source, /\/api\/return-orders/);
  assert.doesNotMatch(source, /AR-RETURN/);
  assert.doesNotMatch(source, /AR-SALE-REVERSAL/);
  assert.doesNotMatch(source, /stockTransactions/);
  assert.doesNotMatch(source, /InventoryPostingService/);
  assert.doesNotMatch(source, /ReturnArPostingService/);
});

test('Delivery Today New order list has selectable rows and clear header columns', () => {
  assert.match(source, /deliveryTodayNewSelectAllOrders/);
  assert.match(source, /deliveryTodayNewClearOrders/);
  assert.match(source, /deliveryTodayNewSelectionCount/);
  assert.match(source, /deliveryTodayNewOrderSelect/);
  assert.match(source, /selectedOrderIds:\s*new Set\(\)/);
  assert.match(source, /toggleOrderSelection/);
  assert.match(source, /selectAllVisibleOrders/);
  assert.match(source, /clearSelectedOrders/);
  assert.match(source, /getSelectedOrders/);
  assert.match(source, /closeoutScope:\s*'selected_orders'/);
  assert.doesNotMatch(source, /Đơn \/ Khách hàngPTTMCKTHHTCNTrạng tháiThao tác/);
});

test('Delivery Today New closeout is based on selected orderIds only', () => {
  const submitStart = source.indexOf('async function submitCloseout');
  const submitBody = source.slice(submitStart, source.indexOf('function detailCell', submitStart));
  assert.match(submitBody, /var rows = selectedCloseoutRows\(\)/);
  assert.match(submitBody, /var orderIds = rows\.map\(rowKey\)/);
  assert.match(submitBody, /orderIds: orderIds/);
  assert.match(submitBody, /closeoutScope:\s*'selected_orders'/);
  const selectedStart = source.indexOf('function selectedCloseoutRows');
  const selectedBody = source.slice(selectedStart, source.indexOf('function closeoutSummary', selectedStart));
  assert.match(selectedBody, /getSelectedOrders\(\)/);
});

test('Delivery Today New order header uses the same grid cells as order rows', () => {
  assert.match(source, /delivery-new-orders-header delivery-new-order-grid/);
  assert.match(source, /delivery-new-order-row delivery-new-order-grid/);
  assert.match(source, /delivery-new-orders-table/);
  assert.match(source, /delivery-new-order-cell delivery-new-order-checkbox-cell/);
  assert.match(source, /delivery-new-order-cell delivery-new-order-customer-cell">Đơn \/ Khách hàng/);
  ['PT', 'TM', 'CK', 'TH', 'HT', 'CN'].forEach((label) => {
    assert.match(source, new RegExp('delivery-new-money-cell[^>]*>' + label + '<'));
  });
  assert.match(source, /delivery-new-status-cell">Trạng thái/);
  assert.match(source, /delivery-new-action-cell">Thao tác/);
  assert.match(source, /id="deliveryTodayNewHeaderSelectAllOrders"/);
});

test('Delivery Today New order header and rows share a CSS grid contract', () => {
  assert.match(source, /\.delivery-new-order-grid\{display:grid;grid-template-columns:32px minmax\(260px,2fr\)/);
  assert.match(source, /\.delivery-new-orders-header\{/);
  assert.match(source, /\.delivery-new-order-row\{/);
  assert.match(source, /\.delivery-new-money-cell\{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap/);
  assert.match(source, /\.delivery-new-order-checkbox-cell\{display:flex;justify-content:center;align-items:center;\}/);
  assert.match(source, /\.delivery-new-status-cell\{text-align:center;display:flex;justify-content:center;align-items:center;\}/);
  assert.match(source, /\.delivery-new-action-cell\{text-align:right;display:flex;justify-content:flex-end;align-items:center;\}/);
  assert.doesNotMatch(source, /mk-delivery-list-head/);
  assert.doesNotMatch(source, /delivery-new-list-grid/);
});
