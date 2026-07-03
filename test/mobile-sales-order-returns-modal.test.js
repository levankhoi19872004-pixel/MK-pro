'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('mobile sales returns helper maps returnOrders fields, aliases and inactive states', () => {
  const helper = read('src/services/mobile/mobileSalesOrderReturns.service.js');

  assert.match(helper, /function buildMobileSalesOrderReturnsSummary\(/);
  assert.match(helper, /function loadReturnOrdersForSalesOrder\(/);
  assert.match(helper, /function returnOrderIdentityFilter\(/);
  assert.match(helper, /salesOrderId/);
  assert.match(helper, /sourceOrderId/);
  assert.match(helper, /originalOrderId/);
  assert.match(helper, /orderCode/);
  assert.match(helper, /salesOrderCode/);
  assert.match(helper, /returnItems/);
  assert.match(helper, /function returnOrderItemRows\(/);
  assert.match(helper, /'items', 'lines', 'products', 'returnItems'/);
  assert.match(helper, /function productCodeOf\(/);
  assert.match(helper, /productCode \|\| item\.code \|\| item\.sku/);
  assert.match(helper, /function itemReturnQty\(/);
  assert.match(helper, /returnQty/);
  assert.match(helper, /qtyReturn/);
  assert.match(helper, /returnQuantity/);
  assert.match(helper, /function itemUnitPrice\(/);
  assert.match(helper, /unitPrice/);
  assert.match(helper, /salePrice/);
  assert.match(helper, /function itemReturnAmount\(/);
  assert.match(helper, /Math\.round\(itemReturnQty\(item\) \* money\(unitPrice\)\)/);
  assert.match(helper, /function specificationOf\(/);
  assert.match(helper, /conversionRate/);
  assert.match(helper, /quyCach/);
  assert.match(helper, /INACTIVE_RETURN_STATUSES/);
  assert.match(helper, /cancelled/);
  assert.match(helper, /void/);
  assert.match(helper, /rejected/);
  assert.match(helper, /deletedAt/);
  assert.match(helper, /cancelledAt/);
  assert.match(helper, /voidedAt/);
  assert.match(helper, /hasReturns: rows\.length > 0/);
  assert.match(helper, /totalReturnAmount/);
  assert.doesNotMatch(helper, /DeliveryCloseoutVersion/);
  assert.doesNotMatch(helper, /arLedger|AR ledger|DebtReadService|arDebt/i);
});

test('mobile sales returns API is read-only and scoped before generic order route', () => {
  const routes = read('src/routes/mobile/sales.routes.js');
  const controller = read('src/controllers/mobile/sales.controller.js');
  const serviceSource = read('src/services/mobile/sales.service.source/part-02.jsfrag');
  const serviceReturnSource = read('src/services/mobile/sales.service.source/part-03.jsfrag');
  const helper = read('src/services/mobile/mobileSalesOrderReturns.service.js');

  assert.match(routes, /\/orders\/:id\/returns/);
  assert.ok(routes.indexOf('/orders/:id/returns') < routes.indexOf("/orders/:id'"), 'returns route must be registered before generic /orders/:id route');
  assert.match(controller, /getOrderReturns/);
  assert.match(serviceSource, /getSalesOrderReturns/);
  assert.match(serviceReturnSource, /getSalesOrderReturns/);
  assert.match(serviceSource, /buildMobileSalesOrderReturnsSummary\(order\)/);
  assert.match(serviceSource, /mobileSalesOwnerMongoFilter\(mobileUser\)/);
  assert.match(helper, /ReturnOrder/);
  assert.match(helper, /Product/);
  assert.match(helper, /returnOrderIdentityFilter/);
  assert.match(helper, /salesOrderId/);
  assert.match(helper, /orderCode/);
  assert.match(helper, /sourceOrderId/);
  assert.match(helper, /isInactiveReturnOrder/);
  assert.doesNotMatch(helper, /DeliveryCloseoutVersion/);
  assert.doesNotMatch(helper, /arLedger|AR ledger|DebtReadService|arDebt/i);
});

test('mobile sales order card has Xem hàng trả button and in-app returns modal', () => {
  const ux = read('public/mobile/js/sales-ux.js');
  const generatedSalesSource = read('public/mobile/js/sales.source/part-01.jsfrag');
  const html = read('public/mobile/sales.html');

  assert.match(ux, /Xem hàng trả/);
  assert.match(ux, /data-view-returns/);
  assert.match(ux, /data-returns-url/);
  assert.match(ux, /mobileOrderReturnsModal/);
  assert.match(ux, /openMobileOrderReturnsModal/);
  assert.match(ux, /closeMobileOrderReturnsModal/);
  assert.match(ux, /Đơn không có hàng trả về/);
  assert.match(ux, /Mã SP/);
  assert.match(ux, /Tên SP/);
  assert.match(ux, /Quy cách/);
  assert.match(ux, /Số lượng trả/);
  assert.match(ux, /Giá trị 1 đơn vị SP/);
  assert.match(ux, /Tổng giá trị trả/);
  assert.match(ux, /fetch\(url/);
  assert.doesNotMatch(ux, /data-view-returns[\s\S]{0,250}target="_blank"/);
  assert.doesNotMatch(ux, /window\.open/);
  assert.match(generatedSalesSource, /sales-ux\.js\?v=phase155-returns-modal-v1/);
  assert.match(html, /sales\.js\?v=(phase155-returns-modal-v1|phase158-customer-compact-v1)/);
});
