'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = (file) => fs.readFileSync(file, 'utf8');

const routeIndexSource = read('src/routes/index.js');
const deliveryRoutesSource = read('src/routes/deliveryRoutes.js');
const mobileDeliveryRoutesSource = read('src/routes/mobile/delivery.routes.js');
const mobileDeliveryServiceSource = read('src/services/mobile/delivery.service.js');
const deliveryCoreSource = read('public/js/delivery/delivery-core.js');

test('current frontend keeps canonical /api/delivery route family for delivery app', () => {
  assert.match(routeIndexSource, /Canonical delivery routes: one core API for web \+ mobile delivery UIs/);
  assert.match(deliveryCoreSource, /\/api\/delivery\/orders/);
  assert.match(deliveryCoreSource, /\/api\/delivery\/returns/);
  assert.match(deliveryCoreSource, /\/api\/delivery\/return/);
  assert.match(deliveryCoreSource, /\/api\/delivery\/payment/);
  assert.match(deliveryCoreSource, /\/api\/delivery\/confirm/);
  assert.doesNotMatch(deliveryCoreSource, /\/api\/mobile\/delivery\/(?:orders|returns|return|payment|confirm)/);
});

test('canonical /api/delivery routes expose stable success/data/message/error shape without breaking legacy keys', () => {
  assert.match(deliveryRoutesSource, /function buildErrorPayload/);
  assert.match(deliveryRoutesSource, /ok: false,\s*success: false,[\s\S]*error: code/);
  assert.match(deliveryRoutesSource, /message: 'Đã tải đơn giao hàng',[\s\S]*data: \{[\s\S]*orders: result\.rows[\s\S]*items: result\.rows/);
  assert.match(deliveryRoutesSource, /orders: result\.rows/);
  assert.match(deliveryRoutesSource, /message: 'Đã tải danh sách hàng trả',[\s\S]*data: \{[\s\S]*returnOrders: result\.rows/);
  assert.match(deliveryRoutesSource, /message: result\.message \|\| 'Đã lưu tiền thu',[\s\S]*data: \{ order: result\.order, allocation: result\.allocation \}/);
  assert.match(deliveryRoutesSource, /message: result\.message \|\| 'Đã xác nhận giao hàng',[\s\S]*data: \{ order: result\.order \}/);
});

test('compatibility /api/mobile/delivery routes stay mounted and use mobile auth/role guard', () => {
  assert.match(mobileDeliveryRoutesSource, /const onlyDelivery = \[requireMobileLogin, requireMobileRole\(\['delivery'\]\)\]/);
  assert.match(mobileDeliveryRoutesSource, /router\.get\('\/orders'/);
  assert.match(mobileDeliveryRoutesSource, /router\.get\('\/returns'/);
  assert.match(mobileDeliveryRoutesSource, /router\.post\('\/confirm'/);
  assert.match(mobileDeliveryRoutesSource, /router\.post\('\/return'/);
  assert.match(mobileDeliveryRoutesSource, /router\.post\('\/payment'/);
});

test('mobile compatibility service delegates write rules to DeliveryEngine owner-guarded methods', () => {
  assert.match(mobileDeliveryServiceSource, /const \{ DeliveryEngine \} = require\('\.\.\/\.\.\/engines\/delivery\.engine'\)/);
  assert.match(mobileDeliveryServiceSource, /enforceDeliveryOwnership: true/);
  assert.match(mobileDeliveryServiceSource, /engine\.saveReturn\(/);
  assert.match(mobileDeliveryServiceSource, /engine\.savePayment\(/);
  assert.match(mobileDeliveryServiceSource, /engine\.confirm\(/);
  assert.match(mobileDeliveryServiceSource, /engine\.listReturns\(scopedQuery\)/);
  assert.doesNotMatch(mobileDeliveryServiceSource, /ReturnOrder\.create\(/);
  assert.doesNotMatch(mobileDeliveryServiceSource, /SalesOrder\.findOneAndUpdate\(/);
});

test('mobile compatibility responses identify canonical route and expose success/data/error fields', () => {
  assert.match(mobileDeliveryServiceSource, /compatibilityRoute: '\/api\/mobile\/delivery\/orders'/);
  assert.match(mobileDeliveryServiceSource, /canonicalRoute: '\/api\/delivery\/orders'/);
  assert.match(mobileDeliveryServiceSource, /success: true,[\s\S]*message: 'Đã tải đơn giao hàng mobile',[\s\S]*data: \{ items, orders: items, rows: items/);
  assert.match(mobileDeliveryServiceSource, /compatibilityRoute: '\/api\/mobile\/delivery\/return'/);
  assert.match(mobileDeliveryServiceSource, /canonicalRoute: '\/api\/delivery\/return'/);
  assert.match(mobileDeliveryServiceSource, /success: false,[\s\S]*error: err\.code \|\| `MOBILE_DELIVERY_/);
  assert.match(mobileDeliveryServiceSource, /MOBILE_DELIVERY_MISSING_ORDER/);
  assert.match(mobileDeliveryServiceSource, /MOBILE_DELIVERY_INVALID_STATUS/);
});
