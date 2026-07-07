'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }

test('Delivery closeout uses selected order scope and stable scope hash', () => {
  const source = read('src/services/accounting/AccountingCloseoutService.js');
  assert.match(source, /function\s+buildCloseoutScopeKey\s*\(/);
  assert.match(source, /selectedOrderCodes\.join\('\|'\)/);
  assert.match(source, /scopeHash:\s*sha256\(scopePayload\)/);
  assert.match(source, /closeoutScope:\s*'selected_orders'/);
  assert.match(source, /resolveSelectedOrderCodes\(orders, selectedOrderIds\)/);
  assert.match(source, /closeoutScopeHash:\s*closeoutScope\.scopeHash/);
});

test('Delivery closeout rebuilds stale order closeout from SSoT instead of blocking selected scope', () => {
  const source = read('src/services/accounting/AccountingCloseoutService.js');
  assert.match(source, /DeliveryCloseoutService\.buildCloseout\(order, returnOrders, \[\]/);
  assert.match(source, /const\s+scopedComputed\s*=\s*attachCloseoutScope\(computed, order, options\)/);
  assert.match(source, /DELIVERY_CLOSEOUT_REBUILT_FROM_SSOT/);
  assert.match(source, /previousCloseoutMismatches/);
  const confirmOneOrder = source.match(/async\s+function\s+confirmOneOrder[\s\S]*?\n}\n\nasync function confirmDeliveryAccountingInternal/)[0];
  assert.doesNotMatch(confirmOneOrder, /DELIVERY_CLOSEOUT_CALCULATION_MISMATCH[\s\S]{0,240}throw err/);
});

test('Closeout route and frontend send selectedOrderCodes plus selectedSalesStaffCodes aliases', () => {
  const route = read('src/routes/newOperationsRoutes.js');
  const frontend = read('public/js/app/new/91-delivery-today-new.js');
  assert.match(route, /Array\.isArray\(body\.selectedOrderCodes\)/);
  assert.match(frontend, /selectedOrderCodes/);
  assert.match(frontend, /selectedSalesStaffCodes:\s*salesStaffCodes/);
  assert.match(frontend, /selectedOrderIds:\s*orderIds/);
});
