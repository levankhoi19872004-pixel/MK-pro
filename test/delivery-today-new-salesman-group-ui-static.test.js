'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'), 'utf8');

test('Delivery Today New renders a compact NVBH grid above the order list', () => {
  assert.match(source, /NVBH thuộc NVGH đang chọn/);
  assert.match(source, /delivery-new-salesman-panel/);
  assert.match(source, /delivery-new-salesman-grid/);
  assert.match(source, /delivery-new-salesman-compact-header/);
  ['Chọn', 'NVBH', 'Đơn', 'PT', 'TM', 'CK', 'TT', 'HT', 'CN'].forEach((label) => {
    assert.match(source, new RegExp('>' + label + '<'));
  });
  assert.doesNotMatch(source, /delivery-new-salesman-title-row/);
  assert.doesNotMatch(source, /delivery-new-salesman-order-group/);
  assert.doesNotMatch(source, /renderGroupKpiCompact/);
});

test('Delivery Today New compact NVBH grid does not render bulk NVBH buttons', () => {
  assert.match(source, /type="checkbox" data-salesman-key/);
  assert.match(source, /toggleSalesmanSelection/);
  assert.match(source, /selectedSalesmanKeys/);
  assert.doesNotMatch(source, /Chọn tất cả NVBH/);
  assert.doesNotMatch(source, /Bỏ chọn tất cả NVBH/);
  assert.doesNotMatch(source, /deliveryTodayNewSelectAllSalesmen/);
  assert.doesNotMatch(source, /deliveryTodayNewClearAllSalesmen/);
  assert.doesNotMatch(source, /function selectAllSalesmen/);
  assert.doesNotMatch(source, /function clearAllSalesmen/);
});

test('Delivery Today New KPI cards are based on selected closeout orders', () => {
  assert.match(source, /selectDefaultOrdersForSelectedSalesmen/);
  assert.match(source, /groupSelectionState/);
  assert.match(source, /input\.indeterminate\s*=/);
  const selectedKpiStart = source.indexOf('function updateTopKpisFromSelectedSalesmen');
  const selectedKpiBody = source.slice(selectedKpiStart, source.indexOf('function ensureSelectedOrderSet', selectedKpiStart));
  assert.match(selectedKpiBody, /applySummary\(summarizeVisibleRows\(getSelectedOrders\(\)\)\)/);
});

test('Delivery Today New order rows are flat and carry an NVBH column after the compact grid', () => {
  const shellStart = source.indexOf('delivery-new-orders-header delivery-new-order-grid');
  const shell = source.slice(shellStart, source.indexOf('deliveryTodayNewTable', shellStart));
  assert.match(shell, /Đơn \/ Khách hàng/);
  assert.match(shell, />NVBH</);
  ['Phải thu', 'Tiền mặt', 'Chuyển khoản', 'Trả thưởng', 'Hàng trả', 'Còn nợ', 'Trạng thái', 'Thao tác'].forEach((label) => {
    assert.match(shell, new RegExp(label));
  });
  const renderRowsIndex = source.indexOf('function renderRows');
  const renderRowsBody = source.slice(renderRowsIndex, source.indexOf('function selectedCloseoutRows', renderRowsIndex));
  assert.match(renderRowsBody, /visibleRows\.map\(renderOrderRow\)/);
  assert.doesNotMatch(renderRowsBody, /delivery-new-salesman-title-row/);
  assert.doesNotMatch(renderRowsBody, /groups\.map\(function \(group\)/);
  assert.match(source, /delivery-new-staff-cell/);
});

test('Delivery Today New grouping does not touch legacy accounting flows', () => {
  assert.doesNotMatch(source, /\/api\/return-orders/);
  assert.doesNotMatch(source, /AR-RETURN/);
  assert.doesNotMatch(source, /AR-SALE-REVERSAL/);
  assert.doesNotMatch(source, /InventoryPostingService/);
  assert.doesNotMatch(source, /ReturnArPostingService/);
});

