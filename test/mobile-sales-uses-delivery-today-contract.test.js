'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('mobile sales tracking is bound to delivery-today-orders contract and source priority', () => {
  const helper = read('src/services/mobile/mobileSalesOrderTracking.service.js');
  const route = read('src/routes/newOperationsRoutes.js');
  const deliveryToday = read('src/services/v2/deliveryTodayNew.service.js');
  const mobileSource = read('src/services/mobile/sales.service.source/part-03.jsfrag');

  assert.match(route, /\/delivery-today\/orders/);
  assert.match(route, /deliveryTodayNewService\.listOrders/);
  assert.match(deliveryToday, /buildSourceNote\('delivery-today-orders'/);
  assert.match(deliveryToday, /loadLatestVersionsForOrders/);
  assert.match(deliveryToday, /returnOrders/);
  assert.match(deliveryToday, /deliveryCloseoutVersions/);

  assert.match(helper, /DELIVERY_TODAY_ORDERS_CONTRACT = 'delivery-today-orders'/);
  assert.match(helper, /sourcePriority: 'orders \+ deliveryCloseoutVersions \+ returnOrders'/);
  assert.match(helper, /resolveDeliveryTodayContractMoney/);
  assert.match(helper, /inferRewardOffsetFromVersionDebt/);
  assert.match(helper, /rawFinalDebtAmount/);
  assert.match(helper, /rawDebtAmount/);
  assert.match(helper, /closeoutMatchedBy/);
  assert.match(helper, /deliveryDate/);
  assert.doesNotMatch(helper, /arDebtCustomers/);
  assert.doesNotMatch(helper, /reportService\.debtCustomers/);
  assert.doesNotMatch(helper, /reporting_snapshots/);

  assert.match(mobileSource, /deliveryDate: 1/);
  assert.match(mobileSource, /deliveryCloseout: 1/);
  assert.match(mobileSource, /offsetAmount: 1/);
  assert.match(mobileSource, /deliveryStaffCode: 1/);
});
