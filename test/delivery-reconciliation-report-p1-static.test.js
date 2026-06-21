'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const sourceBundle = require('./helpers/sourceBundle.util');

const ROOT = path.join(__dirname, '..');
const read = (file) => sourceBundle.readSource(path.join(ROOT, file));

const deliveryRoutesSource = read('src/routes/deliveryRoutes.js');
const mobileDeliveryRoutesSource = read('src/routes/mobile/delivery.routes.js');
const mobileDeliveryControllerSource = read('src/controllers/mobile/delivery.controller.js');
const mobileDeliveryServiceSource = read('src/services/mobile/delivery.service.js');
const reconciliationServiceSource = read('src/services/deliveryReconciliation.service.js');
const deliveryCoreSource = read('public/js/delivery/delivery-core.js');
const deliveryMobileViewSource = read('public/mobile/js/delivery-mobile-view.js');

test('canonical /api/delivery/reconciliation uses full report service and keeps response contract', () => {
  assert.match(deliveryRoutesSource, /deliveryReconciliationService = require\('\.\.\/services\/deliveryReconciliation\.service'\)/);
  assert.match(deliveryRoutesSource, /router\.get\('\/reconciliation', requireAuth, deliveryReadRoles/);
  assert.match(deliveryRoutesSource, /const query = bindDeliveryUser\(req\.query \|\| \{\}, req\.user\)/);
  assert.match(deliveryRoutesSource, /buildDeliveryReconciliationReport\(query\)/);
  assert.match(deliveryRoutesSource, /message: 'Đã tải báo cáo đối soát cuối ngày'/);
  assert.match(deliveryRoutesSource, /data: report/);
  assert.match(deliveryRoutesSource, /orders: report\.orders/);
  assert.match(deliveryRoutesSource, /returns: report\.returns/);
  assert.match(deliveryRoutesSource, /collections: report\.collections/);
  assert.match(deliveryRoutesSource, /fundLedgers: report\.fundLedgers/);
});

test('reconciliation service reads only canonical data sources and does not post ledgers', () => {
  assert.match(reconciliationServiceSource, /const SalesOrder = require\('\.\.\/models\/SalesOrder'\)/);
  assert.match(reconciliationServiceSource, /const MasterOrder = require\('\.\.\/models\/MasterOrder'\)/);
  assert.match(reconciliationServiceSource, /const ReturnOrder = require\('\.\.\/models\/ReturnOrder'\)/);
  assert.match(reconciliationServiceSource, /const ArLedger = require\('\.\.\/models\/ArLedger'\)/);
  assert.match(reconciliationServiceSource, /const FundLedger = require\('\.\.\/models\/FundLedger'\)/);
  assert.match(reconciliationServiceSource, /const DebtCollection = require\('\.\.\/models\/DebtCollection'\)/);
  assert.match(reconciliationServiceSource, /source:\s*\{[\s\S]*orders: 'salesOrders\/master_orders via DeliveryEngine'[\s\S]*returns: 'returnOrders'[\s\S]*ar: 'arLedgers'[\s\S]*collections: 'debtCollections'[\s\S]*fund: 'fundLedgers'/);
  assert.doesNotMatch(reconciliationServiceSource, /\.create\(/);
  assert.doesNotMatch(reconciliationServiceSource, /findOneAndUpdate\(/);
  assert.doesNotMatch(reconciliationServiceSource, /postFundLedger|postReceipt|postAR|createLedger/);
});

test('delivery role cannot spoof another NVGH in reconciliation mobile compatibility route', () => {
  assert.match(mobileDeliveryRoutesSource, /router\.get\('\/reconciliation'/);
  assert.match(mobileDeliveryControllerSource, /reconciliation: wrapMobile\(service, 'deliveryReconciliation'/);
  assert.match(mobileDeliveryServiceSource, /async function deliveryReconciliation/);
  assert.match(mobileDeliveryServiceSource, /const actorCode = String\(mobileUser\.staffCode \|\| mobileUser\.code \|\| ''\)\.trim\(\)/);
  assert.match(mobileDeliveryServiceSource, /deliveryStaffCode: actorCode/);
  assert.match(mobileDeliveryServiceSource, /enforceDeliveryOwnership: true/);
  assert.match(mobileDeliveryServiceSource, /compatibilityRoute: '\/api\/mobile\/delivery\/reconciliation'/);
  assert.match(mobileDeliveryServiceSource, /canonicalRoute: '\/api\/delivery\/reconciliation'/);
});

test('mobile app exposes lazy-loaded reconciliation through shortcut and workflow tab', () => {
  assert.match(deliveryCoreSource, /async loadReconciliation\(filters\)/);
  assert.match(deliveryCoreSource, /this\.state\.reconciliationReport = report/);
  assert.match(deliveryMobileViewSource, /mReconShortcut/);
  assert.match(deliveryMobileViewSource, /data-m-tab="reconciliation"/);
  assert.match(deliveryMobileViewSource, /function loadDeliveryReconciliation\(force\)/);
  assert.match(deliveryMobileViewSource, /function renderReconciliationApp\(body\)/);
  assert.match(deliveryMobileViewSource, /buildDeliveryReconciliationUrl\(\)/);
  assert.match(deliveryMobileViewSource, /\/api\/delivery\/reconciliation/);
  assert.match(deliveryMobileViewSource, /Phiếu thu nợ đã gửi/);
  assert.match(deliveryMobileViewSource, /Có chênh lệch cần xử lý/);
});
