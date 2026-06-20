'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const sourceBundle = require('./helpers/sourceBundle.util');

const ROOT = path.join(__dirname, '..');
const read = (file) => sourceBundle.readSource(path.join(ROOT, file));
const html = read('public/mobile/sales.html');
const sales = read('public/mobile/js/sales.js');
const salesUx = read('public/mobile/js/sales-ux.js');
const salesRuntime = `${sales}
${salesUx}`;
const css = read('public/mobile/mobile.css');

test('phase 3 uses a four-item thumb-friendly bottom navigation without a separate cart tab item', () => {
  assert.match(html, /class="mobile-tabs mobile-bottom-nav"/);
  const nav = html.slice(html.indexOf('<nav class="mobile-tabs mobile-bottom-nav"'), html.indexOf('</nav>') + 6);
  assert.equal((nav.match(/class="tab-btn/g) || []).length, 4);
  assert.match(nav, /data-tab="customersTab"/);
  assert.match(nav, /data-tab="orderTab"/);
  assert.match(nav, /data-tab="reportTab"/);
  assert.match(nav, /data-tab="debtTab"/);
  assert.doesNotMatch(nav, /data-tab="cartTab"/);
  assert.match(css, /\.mobile-tabs\.mobile-bottom-nav[\s\S]*position:\s*fixed/);
  assert.match(css, /grid-template-columns:\s*repeat\(4/);
});

test('Android back and tab changes preserve navigation state and scroll position', () => {
  assert.match(salesRuntime, /const scrollPositions = new Map\(\)/);
  assert.match(salesRuntime, /window\.history\.pushState/);
  assert.match(salesRuntime, /window\.history\.replaceState/);
  assert.match(salesRuntime, /window\.addEventListener\('popstate'/);
  assert.match(salesRuntime, /scrollPositions\.set\(activePanel/);
  assert.match(salesRuntime, /window\.scrollTo\(\{ top: target, behavior: 'auto' \}\)/);
});

test('product quantity fields retain fixed case and loose labels after values are entered', () => {
  assert.match(html, /<label class="mobile-qty-field" for="caseQtyInput"><span>Thùng<\/span>/);
  assert.match(html, /<label class="mobile-qty-field" for="looseQtyInput"><span>Lẻ<\/span>/);
  assert.match(html, /id="caseQtyInput"[\s\S]*inputmode="numeric"/);
  assert.match(html, /id="looseQtyInput"[\s\S]*inputmode="numeric"/);
});

test('cart exposes customer context, direct quantity editing and three monetary totals', () => {
  assert.match(html, /id="cartCustomerContext"/);
  assert.match(html, /id="cartGrossTotal"/);
  assert.match(html, /id="cartDiscountTotal"/);
  assert.match(html, /id="cartTotal"/);
  assert.match(salesRuntime, /data-cart-case=/);
  assert.match(salesRuntime, /data-cart-loose=/);
  assert.match(salesRuntime, /data-cart-update=/);
  assert.match(sales, /async function updateCartItemQuantity/);
  assert.match(sales, /recalculateCartPromotions\(\{ silent: true \}\)/);
});

test('cart and order screens expose sticky primary actions above the bottom navigation', () => {
  assert.match(html, /id="orderDraftBar"/);
  assert.match(html, /id="openCartBtn"/);
  assert.match(html, /class="cart-action-bar"/);
  assert.match(html, /id="backToOrderBtn"/);
  assert.match(css, /\.order-draft-bar[\s\S]*position:\s*sticky/);
  assert.match(css, /\.cart-action-bar[\s\S]*position:\s*sticky/);
});

test('order list supports server-backed date and keyword filters plus local status filtering', () => {
  assert.match(html, /id="orderSearch"/);
  assert.match(html, /id="orderDateFilter" type="date"/);
  assert.match(html, /id="orderStatusFilter"/);
  assert.match(sales, /orderSearch\?\.addEventListener\('input'/);
  assert.match(sales, /orderDateFilter\?\.addEventListener\('change'/);
  assert.match(sales, /orderStatusFilter\?\.addEventListener\('change'/);
  assert.match(sales, /date:\s*String\(orderDateFilter\?\.value \|\| todayValue\(\)\)/);
  assert.match(sales, /q:\s*String\(orderSearch\?\.value \|\| ''\)\.trim\(\)/);
});

test('loading error and empty states are centralized and expose retry actions', () => {
  assert.match(sales, /function renderMobileListState/);
  assert.match(sales, /state:\s*'loading'/);
  assert.match(sales, /state:\s*'error'/);
  assert.match(sales, /state:\s*'empty'/);
  assert.match(sales, /data-mobile-retry/);
  assert.match(sales, /retryAction:\s*'customers'/);
  assert.match(sales, /retryAction:\s*'orders'/);
  assert.match(sales, /retryAction:\s*'debts'/);
});

test('network and global operation status remain visible after tab changes', () => {
  assert.match(html, /id="networkStatus"[\s\S]*aria-live="polite"/);
  assert.match(html, /id="mobileGlobalStatus"[\s\S]*aria-live="polite"/);
  assert.match(sales, /function updateNetworkStatus/);
  assert.match(sales, /window\.addEventListener\('online'/);
  assert.match(sales, /window\.addEventListener\('offline'/);
  assert.match(salesRuntime, /createStatusAnnouncer/);
  assert.match(salesRuntime, /const announceMobileStatus = createStatusAnnouncer/);
});

test('mobile controls meet minimum touch target and keyboard focus requirements', () => {
  assert.match(css, /\.sales-app-page button,[\s\S]*min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:\s*3px solid/);
  assert.match(html, /id="submitOrderBtn" type="button"/);
  assert.match(html, /id="openCartBtn" type="button"/);
});

test('phase 3 preserves server-authoritative order submission and does not alter pricing rules', () => {
  assert.match(sales, /mobileApi\.updateSalesOrder\(editingOrderId, payload\)/);
  assert.match(sales, /mobileApi\.createSalesOrder\(payload\)/);
  assert.match(sales, /await recalculateCartPromotions\(\{ silent: true \}\)/);
  assert.doesNotMatch(sales, /InventoryPostingService|arLedgers|fundLedgers/);
});
