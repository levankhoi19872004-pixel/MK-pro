'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(file) { return fs.readFileSync(file, 'utf8'); }

test('promotion module keeps 4 business tabs and removes separate quantity group tab', () => {
  const html = read('public/fragments/index/06-index-body.html');
  assert.match(html, /data-promotion-program-tab="productRules"/);
  assert.match(html, /data-promotion-program-tab="groupItems"/);
  assert.match(html, /data-promotion-program-tab="groupRules"/);
  assert.match(html, /data-promotion-program-tab="customerOrderValueDiscounts"/);
  assert.doesNotMatch(html, /data-promotion-program-tab="quantityGroupDiscounts"/);
  assert.doesNotMatch(html, /promotionQuantityGroupDiscountProgramForm/);
});

test('promotion routes keep backward-compatible APIs for advanced legacy rule types', () => {
  const routes = read('src/routes/promotionRoutes.js');
  assert.match(routes, /\/quantity-group-discounts/);
  assert.match(routes, /\/customer-order-value-discounts/);
  assert.match(routes, /router\.put\('\/quantity-group-discounts\/:id'/);
  assert.match(routes, /router\.put\('\/customer-order-value-discounts\/:id'/);
});

test('import template merges quantity threshold into promotionGroupRules using basis column', () => {
  const html = read('public/fragments/index/06-index-body.html');
  const preview = read('src/services/import/preview/importPreview.impl.js');
  const adminImport = read('src/services/import/operations/adminImport.impl.js');
  const templates = read('services/excelTemplateService.js');
  assert.match(html, /value="promotionGroupRules">Import điều kiện nhóm KM/);
  assert.doesNotMatch(html, /promotionQuantityGroupDiscounts">Import CK theo số lượng nhóm SP/);
  assert.match(preview, /normalizeGroupRuleBasis/);
  assert.match(adminImport, /normalizeGroupRuleBasis/);
  assert.match(templates, /'Tính theo'/);
  assert.match(templates, /'Ngưỡng từ'/);
  assert.match(templates, /'Doanh số'/);
  assert.match(templates, /'Số lượng'/);
  assert.doesNotMatch(templates, /mau-import-ck-theo-so-luong-nhom-sp/);
  assert.match(templates, /mau-import-ck-them-theo-doanh-so-khach-hang/);
});
