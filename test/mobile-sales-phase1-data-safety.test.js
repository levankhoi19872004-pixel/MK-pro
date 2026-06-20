'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { readSource } = require('./helpers/sourceBundle.util');
const { bindSalesPayload } = require('../src/services/mobile/MobileSyncService');

const salesService = readSource('src/services/mobile/sales.service.js');
const salesFrontend = readSource('public/mobile/js/sales.js');
const salesCustomerDomain = readSource('public/mobile/js/sales/customer.js');
const offlineSync = readSource(path.join(__dirname, '..', 'public/mobile/js/offline-sync.js'));
const syncController = readSource(path.join(__dirname, '..', 'src/controllers/mobile/sync.controller.js'));
const syncRoutes = readSource(path.join(__dirname, '..', 'src/routes/mobile/sync.routes.js'));


test('offline sales payload cannot override authenticated NVBH identity', () => {
  const bound = bindSalesPayload({
    salesStaffCode: 'MALICIOUS',
    salesStaffName: 'Người khác',
    staffCode: 'OTHER',
    staffName: 'Other'
  }, {
    role: 'sales',
    salesStaffCode: '35128',
    salesStaffName: 'Nguyễn Thị Thùy'
  });

  assert.equal(bound.salesStaffCode, '35128');
  assert.equal(bound.salesmanCode, '35128');
  assert.equal(bound.nvbhCode, '35128');
  assert.equal(bound.salesStaffName, 'Nguyễn Thị Thùy');
  assert.equal(bound.staffCode, '');
  assert.equal(bound.staffName, '');
});


test('online create and update scope customer lookup by authenticated sales user', () => {
  assert.match(salesService, /customerOwnershipFilterForSalesUser/);
  assert.match(salesService, /findCustomerForOrderBody\(body, mobileUser, session\)/);
  assert.match(salesService, /findCustomerForOrderBody\(customerLookupBody, mobileUser\)/);
  assert.match(salesService, /Khách hàng không thuộc phạm vi nhân viên bán hàng/);
});


test('mobile create and update calculate price from product catalog on server', () => {
  assert.match(salesService, /MOBILE_SALES_SERVER_AUTHORITATIVE_PRICING_START/);
  assert.match(salesService, /const catalogSalePrice = toNumber\(product\.salePrice \?\? product\.price \?\? 0\)/);
  assert.match(salesService, /buildAuthoritativeMobileItems\(rawItems\)/g);
  assert.doesNotMatch(salesService, /const salePrice = toNumber\(rawItem\.salePrice/);
  assert.match(salesService, /promotionService\.calculatePromotions\(baseItems\)/);
  assert.match(salesService, /const requiredQtyByProduct = new Map\(\)/);
  assert.match(salesService, /requiredQtyByProduct\.set\(code/);
});


test('offline sync production route reuses mobile sales command path', () => {
  assert.match(syncController, /createMobileSyncService\(ctx\)/);
  assert.match(syncRoutes, /createMobileSyncController\(ctx\)/);
  assert.match(readSource(path.join(__dirname, '..', 'src/services/mobile/MobileSyncService.js')), /context\.mobileSalesService\.createSalesOrder/);
});


test('customer search, debt merge and order draft guards are hardened on mobile', () => {
  assert.match(salesFrontend, /const requestSeq = \+\+state\.customer\.requestSeq/);
  assert.match(salesFrontend, /if \(requestSeq !== state\.customer\.requestSeq\) return/);
  assert.match(salesFrontend, /sales\/customer\.js/);
  assert.match(salesCustomerDomain, /legacyNameRows|ambiguousNames/);
  assert.match(salesFrontend, /Giỏ hiện tại đang thuộc khách hàng khác/);
  assert.match(salesFrontend, /cartCustomerContext/);
  assert.match(salesFrontend, /OrderDraftStore/);
});


test('offline conflicts remain visible but are not automatically retried', () => {
  assert.match(offlineSync, /statuses: \['pending', 'failed'\]/);
  assert.doesNotMatch(offlineSync, /\['pending', 'failed', 'conflict'\]\.includes\(row\.status\)/);
  assert.match(salesFrontend, /statuses: \['pending', 'failed', 'conflict', 'needs_attention'\]/);
  assert.match(salesFrontend, /Chờ đồng bộ/);
});
