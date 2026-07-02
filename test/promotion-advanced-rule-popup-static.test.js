'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('promotion UI removes separate SL nhóm SP tab and keeps CK thêm theo DS tab', () => {
  const html = read('public/fragments/index/06-index-body.html');
  assert.doesNotMatch(html, /data-promotion-program-tab="quantityGroupDiscounts"/);
  assert.doesNotMatch(html, /promotionQuantityGroupDiscountProgramForm/);
  assert.doesNotMatch(html, /promotionQuantityGroupDiscountPopup/);
  assert.match(html, /data-promotion-program-tab="customerOrderValueDiscounts"/);
  assert.match(html, /promotionCustomerOrderValueDiscountPopupBody/);
});

test('Điều kiện KM Ontop popup has calculation basis selector and dynamic threshold input', () => {
  const html = read('public/fragments/index/06-index-body.html');
  const js = read('public/js/app/admin/08e-promotion-programs.js');
  assert.match(html, /name="basis" id="promotionTierBasisSelect"/);
  assert.match(html, /value="ORDER_VALUE">Tính theo doanh số/);
  assert.match(html, /value="QUANTITY">Tính theo số lượng/);
  assert.match(html, /id="promotionTierThresholdLabel">Doanh số từ/);
  assert.match(html, /<th>Tính theo<\/th><th>Ngưỡng từ<\/th>/);
  assert.match(js, /function updateTierBasisUi/);
  assert.match(js, /Số lượng từ/);
  assert.match(js, /Doanh số từ/);
});

test('promotion program config no longer loads hidden quantityGroupDiscounts tab', () => {
  const js = read('public/js/app/admin/08e-promotion-programs.js');
  assert.doesNotMatch(js, /quantityGroupDiscounts:\s*\{/);
  assert.doesNotMatch(js, /Tạo rule SL nhóm SP/);
  assert.match(js, /customerOrderValueDiscounts:\s*\{/);
  assert.match(js, /tierBasisText/);
});
