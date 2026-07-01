'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(file) { return fs.readFileSync(file, 'utf8'); }

test('promotion module exposes 2 new business tabs in UI', () => {
  const html = read('public/fragments/index/06-index-body.html');
  assert.match(html, /data-promotion-program-tab="quantityGroupDiscounts"/);
  assert.match(html, /data-promotion-program-tab="customerOrderValueDiscounts"/);
  assert.match(html, /promotionQuantityGroupDiscountProgramForm/);
  assert.match(html, /promotionCustomerOrderValueDiscountProgramForm/);
});

test('promotion routes expose production-grade APIs for 2 new rule types', () => {
  const routes = read('src/routes/promotionRoutes.js');
  assert.match(routes, /\/quantity-group-discounts/);
  assert.match(routes, /\/customer-order-value-discounts/);
  assert.match(routes, /router\.put\('\/quantity-group-discounts\/:id'/);
  assert.match(routes, /router\.put\('\/customer-order-value-discounts\/:id'/);
});

test('import supports templates, preview and commit for 2 new rule types', () => {
  const html = read('public/fragments/index/06-index-body.html');
  const preview = read('src/services/import/preview/importPreview.impl.js');
  const adminImport = read('src/services/import/operations/adminImport.impl.js');
  const templates = read('services/excelTemplateService.js');
  assert.match(html, /promotionQuantityGroupDiscounts/);
  assert.match(html, /promotionCustomerOrderValueDiscounts/);
  assert.match(preview, /promotionQuantityGroupDiscounts/);
  assert.match(preview, /promotionCustomerOrderValueDiscounts/);
  assert.match(adminImport, /importPromotionQuantityGroupDiscounts/);
  assert.match(adminImport, /importPromotionCustomerOrderValueDiscounts/);
  assert.match(templates, /mau-import-ck-theo-so-luong-nhom-sp/);
  assert.match(templates, /mau-import-ck-them-theo-doanh-so-khach-hang/);
});
