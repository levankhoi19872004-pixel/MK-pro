'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('mobile sales order tracking uses deliveryCloseoutVersions for daily order debt, not AR/customer debt', () => {
  const helper = read('src/services/mobile/mobileSalesOrderTracking.service.js');
  const serviceSource = read('src/services/mobile/sales.service.source/part-03.jsfrag');
  const generatedService = read('src/services/mobile/sales.service.js');

  assert.match(helper, /function buildMobileSalesOrderTrackingSummary\(/);
  assert.match(helper, /function buildMobileSalesOrderTrackingSummaries\(/);
  assert.match(helper, /decorateMobileSalesOrderForTracking/);
  assert.match(helper, /ReturnOrder/);
  assert.match(helper, /DeliveryCloseoutVersion/);
  assert.doesNotMatch(helper, /FundLedger/);
  assert.doesNotMatch(helper, /arBalanceService/);
  assert.doesNotMatch(helper, /loadOrderBalances/);
  assert.doesNotMatch(helper, /accounting_confirmed_ar_ledger/);
  assert.match(helper, /calculateDailyDebtFromCloseout/);
  assert.match(helper, /calculateDeliveryDebtAmount/);
  assert.match(helper, /normalizeRewardOffsetAmount/);
  assert.match(helper, /newOffsetAmount/);
  assert.match(helper, /correctedOffsetAmount/);
  assert.match(helper, /finalOffsetAmount/);
  assert.match(helper, /offsetAmount: money\(moneySource\.offsetAmount\)/);
  assert.match(helper, /dailyDebtAmount/);
  assert.match(helper, /closeoutSource: latestVersion \? 'deliveryCloseoutVersions'/);
  assert.match(helper, /function orderTotalAmount\(order = \{\}\)/);
  assert.match(helper, /'payableAmount'[\s\S]*'finalAmount'[\s\S]*'totalAmount'/);
  assert.match(helper, /const totalAmount = orderTotalAmount\(order\)/);
  assert.match(helper, /const moneySource = latestVersionMoney\(latestVersion, orderMoneyBreakdown\(order\)\)/);
  assert.match(helper, /const returnAmount = latestVersion[\s\S]*latestVersionReturnAmount/);
  assert.match(helper, /const remainingDebt = dailyDebtAmount/);
  assert.match(helper, /'deliveryCloseoutVersions'/);
  assert.match(helper, /'order_delivery_fields'/);
  assert.match(helper, /'no_daily_closeout'/);
  assert.match(helper, /isInactiveDeliveryCloseoutVersion/);
  assert.match(helper, /isBetterDeliveryCloseoutVersion/);

  assert.match(serviceSource, /buildMobileSalesOrderTrackingSummaries\(visibleRows\)/);
  assert.match(serviceSource, /decorateMobileSalesOrderForTracking\(baseOrder, tracking\)/);
  assert.match(serviceSource, /MOBILE_SALES_ORDER_TRACKING_DERIVED/);
  assert.match(generatedService, /mobileSalesOrderTracking\.service/);
});

test('mobile sales app renders compact daily closeout KPI cards and in-app modal zoom', () => {
  const routes = read('src/routes/mobile/sales.routes.js');
  const controller = read('src/controllers/mobile/sales.controller.js');
  const serviceSource = read('src/services/mobile/sales.service.source/part-02.jsfrag');
  const ux = read('public/mobile/js/sales-ux.js');
  const generatedSales = read('public/mobile/js/sales.js');
  const mobileCssSource = read('public/mobile/mobile.source/mobile-04.css');

  assert.match(routes, /\/orders\/:id\/print\.pdf/);
  assert.ok(routes.indexOf('/orders/:id/print.pdf') < routes.indexOf("/orders/:id'"), 'print route must be registered before generic /orders/:id route');
  assert.match(controller, /renderOrderPrint/);
  assert.match(controller, /text\/html; charset=utf-8/);
  assert.match(serviceSource, /renderSalesOrderPrintHtml/);
  assert.match(serviceSource, /printDocumentService\.renderSalesOrder/);
  assert.match(serviceSource, /mobileSalesOwnerMongoFilter\(mobileUser\)/);

  assert.match(ux, /data-view-order/);
  assert.match(ux, /data-print-url/);
  assert.match(ux, /displayRewardOffsetAmount/);
  assert.match(ux, /tracking\.offsetAmount \?\? order\.offsetAmount/);
  assert.doesNotMatch(ux, /tracking\.bonusAmount \?\? tracking\.rewardAmount \?\? order\.bonusAmount \?\? order\.rewardAmount/);
  assert.match(ux, /mobile-order-print-modal/);
  assert.match(ux, /mobile-order-print-frame/);
  assert.match(ux, /data-mobile-order-print-zoom/);
  assert.match(ux, /MOBILE_ORDER_PRINT_ZOOM_MIN/);
  assert.match(ux, /MOBILE_ORDER_PRINT_ZOOM_MAX/);
  assert.match(ux, /applyMobileOrderPrintZoom/);
  assert.match(ux, /frame\.src = 'about:blank'/);
  assert.match(ux, /openMobileOrderPrintModal/);
  assert.match(ux, /document\.addEventListener\('click'/);
  assert.doesNotMatch(ux, /target="_blank"/);
  assert.doesNotMatch(ux, /window\.open/);
  assert.doesNotMatch(ux, /<small>Ngày<\/small>/);
  assert.doesNotMatch(ux, /<small>Đã thu<\/small>/);
  assert.doesNotMatch(ux, /<small>Tổng thu<\/small>/);
  assert.match(ux, /<small>PT<\/small>/);
  assert.match(ux, /<small>TM<\/small>/);
  assert.match(ux, /<small>CK<\/small>/);
  assert.match(ux, /<small>TT<\/small>/);
  assert.match(ux, /<small>HT<\/small>/);
  assert.match(ux, /<small>CN<\/small>/);
  assert.match(ux, /mobile-order-status-badges/);
  assert.match(ux, /Giao:/);
  assert.match(ux, /Kế toán:/);
  assert.match(ux, /Đã gộp/);
  assert.match(ux, /Chỉ xem/);
  assert.match(ux, /Xem đơn/);

  assert.match(mobileCssSource, /PHASE153_MOBILE_SALES_ORDER_COMPACT_CLOSEOUT_START/);
  assert.match(mobileCssSource, /mobile-order-tracking-metrics-compact/);
  assert.doesNotMatch(generatedSales, /window\.open/);
});
