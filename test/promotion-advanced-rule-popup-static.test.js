'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('advanced promotion tabs have dedicated popup containers and close bindings', () => {
  const html = read('public/fragments/index/06-index-body.html');
  assert.match(html, /id="promotionQuantityGroupDiscountPopup"/);
  assert.match(html, /id="promotionQuantityGroupDiscountPopupBody"/);
  assert.match(html, /data-promotion-popup-close="quantityGroupDiscounts"/);
  assert.match(html, /id="promotionCustomerOrderValueDiscountPopup"/);
  assert.match(html, /id="promotionCustomerOrderValueDiscountPopupBody"/);
  assert.match(html, /data-promotion-popup-close="customerOrderValueDiscounts"/);
});

test('advanced promotion create buttons are mapped to popupConfig and open rule-specific titles', () => {
  const js = read('public/js/app/admin/08e-promotion-programs.js');
  assert.match(js, /quantityGroupDiscounts:\s*\{[\s\S]*overlay:\s*'promotionQuantityGroupDiscountPopup'/);
  assert.match(js, /customerOrderValueDiscounts:\s*\{[\s\S]*overlay:\s*'promotionCustomerOrderValueDiscountPopup'/);
  assert.match(js, /Tạo rule SL nhóm SP/);
  assert.match(js, /Tạo rule CK thêm theo DS/);
  assert.match(js, /openPromotionWorkspace\(type,'create'\)/);
});

test('advanced promotion forms enforce minimum required fields in the UI', () => {
  const html = read('public/fragments/index/06-index-body.html');
  assert.match(html, /name="programCode" required placeholder="VD: QTY-NXV-202607"/);
  assert.match(html, /name="minQty" type="number" min="1" step="1" required/);
  assert.match(html, /name="productCodes" rows="4" required/);
  assert.match(html, /name="programCode" required placeholder="VD: CUST-DS-202607"/);
  assert.match(html, /name="minOrderAmount" type="number" min="1000" step="1000" required/);
  assert.match(html, /name="customerCodes" rows="4" required/);
});
