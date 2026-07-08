'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

test('delivery adjustment deep-link has resolver API and does not depend on listOrders', () => {
  const routes = read('src/routes/newOperationsRoutes.js');
  const service = read('src/services/deliveryCloseoutCorrection.service.js');
  const ui = read('public/js/app/new/91-delivery-today-new.js');
  const notificationUi = read('public/js/app/notification-center.js');
  const formatter = read('src/services/events/notificationFormatter.js');
  const registry = read('src/services/source-contracts/SourceContractRegistry.js');

  assert.match(routes, /\/delivery-today\/adjustments\/resolve/);
  assert.match(routes, /resolveAdjustmentDeepLink/);
  assert.match(service, /function resolveAdjustmentDeepLink/);
  assert.match(service, /adjustmentFound: true/);
  assert.match(service, /orderFound: Boolean\(order\)/);
  assert.match(service, /Không tìm thấy đơn gốc trong orders, nhưng đã tìm thấy bản ghi điều chỉnh/);
  assert.match(ui, /resolveAdjustmentDeepLink/);
  assert.match(ui, /\/api\/new\/delivery-today\/adjustments\/resolve/);
  assert.match(ui, /resolverPayloadFromResult/);
  assert.match(ui, /findRowByDeepLink\(payload\) \|\| rowFromResolver/);
  assert.match(notificationUi, /isCloseoutContextId/);
  assert.match(notificationUi, /closeoutVersionId/);
  assert.match(formatter, /canonicalOrderId/);
  assert.match(formatter, /closeoutVersionId/);
  assert.match(registry, /delivery-adjustment-resolver/);
  assert.match(registry, /DeliveryAdjustmentResolver\.resolve/);
});

test('resolver contract covers missing-order and closeout-context-id cases', () => {
  const service = read('src/services/deliveryCloseoutCorrection.service.js');
  const ui = read('public/js/app/new/91-delivery-today-new.js');
  const notificationUi = read('public/js/app/notification-center.js');

  assert.match(service, /isCloseoutContextId\(rawOrderId\)/);
  assert.match(service, /orderLookupFromResolver/);
  assert.match(service, /!isCloseoutContextId\(rawOrderId\) \? rawOrderId : ''/);
  assert.match(service, /syntheticOrderFromAdjustment/);
  assert.match(service, /orderFound: false/);
  assert.match(service, /row,[\s\S]*rows: row \? \[row\] : \[\]/);
  assert.match(service, /filtersAfter/);
  assert.match(ui, /isCloseoutContextId\(payload\.orderId\)/);
  assert.match(ui, /rowFromResolver/);
  assert.match(ui, /Đã tìm thấy bản ghi điều chỉnh nhưng không tìm thấy đơn gốc trong orders/);
  assert.match(notificationUi, /isCloseoutContextId\(rawOrderId\) \? '' : rawOrderId/);
});
