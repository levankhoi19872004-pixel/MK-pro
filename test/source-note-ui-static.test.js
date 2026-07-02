'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('public/js/app/shared/source-note-ui.js', 'utf8');

test('shared source note UI renderer exists and respects visibility', () => {
  assert.match(ui, /renderSourceNote/);
  assert.match(ui, /Nguồn/);
  assert.match(ui, /Chi tiết nguồn/);
  assert.match(ui, /sourceStatus/);
  assert.match(ui, /primaryCollections/);
  assert.match(ui, /visibleOnUi/);
  assert.match(ui, /return ''/);
});

test('selective UI files call shared renderer, not all pages', () => {
  const dashboard = fs.readFileSync('public/js/app/00-dashboard.js', 'utf8');
  const debtNew = fs.readFileSync('public/js/app/new/92-debt-new.js', 'utf8');
  const deliveryNew = fs.readFileSync('public/js/app/new/91-delivery-today-new.js', 'utf8');
  const salesOrder = fs.readFileSync('public/js/app/05-sales-orders.source/part-01.jsfrag', 'utf8');
  assert.match(dashboard, /renderDashboardSourceNote/);
  assert.match(debtNew, /renderDebtSourceNote/);
  assert.match(deliveryNew, /renderDeliverySourceNote/);
  assert.doesNotMatch(salesOrder, /renderSourceNote|source-note/);
});
