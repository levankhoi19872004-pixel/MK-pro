"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const entrySource = fs.readFileSync("public/mobile/js/delivery-mobile-view.source.js", "utf8");
const uiUtilsSource = fs.readFileSync("public/mobile/js/delivery-ui-utils.js", "utf8");
const ordersViewSource = fs.readFileSync("public/mobile/js/delivery-orders-view.js", "utf8");
const css = fs.readFileSync("public/mobile/mobile.source/mobile-04.css", "utf8");
const combined = entrySource + "\n" + uiUtilsSource + "\n" + ordersViewSource;

test("phase24 keeps all Phase23 workflow tabs", () => {
  ["Khách giao", "Hàng giao", "Hàng trả", "Thu tiền", "Đối soát", "Công nợ"].forEach((label) => {
    assert.match(entrySource, new RegExp(label));
  });
});

test("phase24 uses compact selected customer header", () => {
  assert.match(uiUtilsSource, /m-selected-order compact phase24/);
  assert.match(uiUtilsSource, /Phải thu/);
  assert.doesNotMatch(uiUtilsSource, /Địa chỉ: /);
  assert.match(css, /m-selected-order\.compact\.phase24/);
});

test("phase24 product tab replaces large guidance and KPI cards with compact summary", () => {
  assert.match(entrySource, /m-product-compact-brief phase24/);
  assert.match(entrySource, /Nhập SL trả trên từng dòng hàng/);
  assert.doesNotMatch(entrySource, /Bước 1 · Hàng giao kiêm nhập hàng trả/);
  assert.doesNotMatch(entrySource, /<span>Số dòng<\/span>/);
  assert.doesNotMatch(entrySource, /<span>Tổng SL giao<\/span>/);
  assert.doesNotMatch(entrySource, /<span>Giá trị hàng<\/span>/);
});

test("phase24 sticky workflow bar only shows tab-specific actions", () => {
  assert.match(entrySource, /step-only phase24 products/);
  assert.match(entrySource, /Trả hết đơn/);
  assert.match(entrySource, /form="mProductReturnForm"/);
  assert.match(entrySource, /Xác nhận hàng & thu tiền/);
  assert.match(entrySource, /Còn thiếu: <b id="mWorkflowRemaining">0<\/b>/);
  assert.match(entrySource, /data-payment-submit/);
  assert.match(entrySource, /Hoàn tất - về danh sách/);
  assert.doesNotMatch(entrySource, /<button type="button" data-workflow-tab="products">Hàng<\/button>/);
  assert.doesNotMatch(entrySource, /<button type="button" data-workflow-tab="returns">Trả<\/button>/);
  assert.doesNotMatch(entrySource, /<button type="button" data-workflow-tab="payment" class="primary">Thu<\/button>/);
});

test("phase24 does not change backend API contracts", () => {
  assert.match(combined, /window\.DeliveryCore/);
  assert.match(entrySource, /DeliveryCore\.saveReturn/);
  assert.match(entrySource, /DeliveryCore\.savePayment/);
  assert.doesNotMatch(combined, /fetch\(['\"]\/api\/delivery\/reconciliation['\"],\s*\{\s*method:\s*['\"]POST/);
});
