'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('mobile sales orders expose delivery tracking from accounting-safe sources', () => {
  const helper = read('src/services/mobile/mobileSalesOrderTracking.service.js');
  const serviceSource = read('src/services/mobile/sales.service.source/part-03.jsfrag');
  const generatedService = read('src/services/mobile/sales.service.js');

  assert.match(helper, /function buildMobileSalesOrderTrackingSummary\(/);
  assert.match(helper, /function buildMobileSalesOrderTrackingSummaries\(/);
  assert.match(helper, /decorateMobileSalesOrderForTracking/);
  assert.match(helper, /ReturnOrder/);
  assert.match(helper, /FundLedger/);
  assert.match(helper, /DeliveryCloseoutVersion/);
  assert.match(helper, /arBalanceService\.loadOrderBalances/);
  assert.match(helper, /calculateDeliveryDebtAmount/);
  assert.match(helper, /'accounting_confirmed_ar_ledger'/);
  assert.match(helper, /'delivery_pending_accounting'/);
  assert.match(helper, /'sales_order_snapshot'/);
  assert.match(helper, /source\n\s*};/);

  assert.match(serviceSource, /buildMobileSalesOrderTrackingSummaries\(visibleRows\)/);
  assert.match(serviceSource, /decorateMobileSalesOrderForTracking\(baseOrder, tracking\)/);
  assert.match(serviceSource, /MOBILE_SALES_ORDER_TRACKING_DERIVED/);
  assert.match(generatedService, /mobileSalesOrderTracking\.service/);
});

test('mobile sales app has view-order print route and button without unlocking edits', () => {
  const routes = read('src/routes/mobile/sales.routes.js');
  const controller = read('src/controllers/mobile/sales.controller.js');
  const serviceSource = read('src/services/mobile/sales.service.source/part-02.jsfrag');
  const ux = read('public/mobile/js/sales-ux.js');
  const generatedSales = read('public/mobile/js/sales.js');

  assert.match(routes, /\/orders\/:id\/print\.pdf/);
  assert.ok(routes.indexOf("/orders/:id/print.pdf") < routes.indexOf("/orders/:id'"), 'print route must be registered before generic /orders/:id route');
  assert.match(controller, /renderOrderPrint/);
  assert.match(controller, /text\/html; charset=utf-8/);
  assert.match(serviceSource, /renderSalesOrderPrintHtml/);
  assert.match(serviceSource, /printDocumentService\.renderSalesOrder/);
  assert.match(serviceSource, /mobileSalesOwnerMongoFilter\(mobileUser\)/);

  assert.match(ux, /data-view-order/);
  assert.match(ux, /target=\"_blank\"/);
  assert.match(ux, />Xem đơn<\/a>/);
  assert.match(ux, /deliveryTracking/);
  assert.match(ux, /Hàng trả/);
  assert.match(ux, /Trả thưởng/);
  assert.match(ux, /Không thể sửa\/xóa trên app/);
  assert.doesNotMatch(generatedSales, /data-view-order/);
});
