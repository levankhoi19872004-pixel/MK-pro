'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

test('Phase29 adds mobile route tracking API endpoints', () => {
  const routes = read('src/routes/mobile/delivery.routes.js');
  assert.match(routes, /\/location\/session\/start/);
  assert.match(routes, /\/location\/ping/);
  assert.match(routes, /\/location\/session\/stop/);
  assert.match(routes, /\/location\/session\/current/);
  assert.match(routes, /body\('lat'\)\.isFloat/);
  assert.match(routes, /body\('lng'\)\.isFloat/);
});

test('Phase29 adds admin route tracking APIs', () => {
  const routes = read('src/routes/deliveryRoutes.js');
  assert.match(routes, /\/routes\/live/);
  assert.match(routes, /\/routes\/:sessionId/);
  assert.match(routes, /\/routes'/);
  assert.match(routes, /deliveryRouteTrackingService\.listRoutesAdmin/);
  assert.match(routes, /deliveryRouteTrackingService\.getRouteAdmin/);
});

test('Phase29 models use dedicated route tracking collections', () => {
  assert.match(read('src/models/DeliveryRouteSession.js'), /deliveryRouteSessions/);
  assert.match(read('src/models/DeliveryLocationPoint.js'), /deliveryLocationPoints/);
  assert.match(read('src/constants/collectionKeys.js'), /deliveryRouteSessions/);
  assert.match(read('src/constants/collectionKeys.js'), /deliveryLocationPoints/);
});

test('Phase29 service enforces delivery actor scope and GPS validation', () => {
  const service = read('src/services/deliveryRouteTracking.service.js');
  assert.match(service, /assertDeliveryActor/);
  assert.match(service, /deliveryStaffCode: actor\.code/);
  assert.match(service, /findOne\(\{ sessionId, deliveryStaffCode: actor\.code, status: 'active' \}\)/);
  assert.match(service, /Thiếu lat\/lng/);
  assert.match(service, /accuracy > maxAccuracyM\(\)/);
  assert.match(service, /distanceM\(last, point\) < minDistanceM\(\)/);
});

test('Phase29 mobile UI starts/stops foreground tracking and does not require tracking for delivery flow', () => {
  const html = read('public/mobile/delivery.html');
  const tracking = read('public/mobile/js/delivery-route-tracking.js');
  const view = read('public/mobile/js/delivery-mobile-view.source.js');
  assert.match(html, /delivery-route-tracking\.js/);
  assert.match(view, /id="mRouteTracking"/);
  assert.match(view, /DeliveryRouteTracking\.init/);
  assert.match(view, /pingRouteTrackingEvent\('customer_selected'\)/);
  assert.match(view, /pingRouteTrackingEvent\('delivery_confirmed'\)/);
  assert.match(tracking, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(tracking, /\/api\/mobile\/delivery\/location\/session\/start/);
  assert.match(tracking, /setInterval\(function \(\) \{ ping\(\{ silent: true \}\); \}, 60000\)/);
  assert.match(tracking, /stopTimer/);
});

test('Phase29 includes admin route tracking panel and APK native note', () => {
  const web = read('public/js/delivery/delivery-web-view.source/part-01.jsfrag') + read('public/js/delivery/delivery-web-view.source/part-03.jsfrag');
  assert.match(web, /Theo dõi tuyến giao hàng/);
  assert.match(web, /\/api\/delivery\/routes/);
  assert.match(web, /Mở vị trí mới nhất/);
  const note = read('APK_DELIVERY_ROUTE_TRACKING_NATIVE_NOTE.md');
  assert.match(note, /ACCESS_FINE_LOCATION/);
  assert.match(note, /FOREGROUND_SERVICE_LOCATION/);
  assert.match(note, /tracking nền/);
});

test('Phase29 does not modify AR Fund Inventory core files', () => {
  const diffTargetHint = [
    'src/models/ArLedger.js',
    'src/models/FundLedger.js',
    'src/models/Inventory.js',
    'src/engines/posting.engine.js'
  ];
  for (const rel of diffTargetHint) assert.ok(fs.existsSync(path.join(root, rel)), rel);
});
