'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const entrySource = fs.readFileSync('public/mobile/js/delivery-mobile-view.source.js', 'utf8');
const builtSource = fs.readFileSync('public/mobile/js/delivery-mobile-view.js', 'utf8');
const css = fs.readFileSync('public/mobile/mobile.source/mobile-04.css', 'utf8');
const combined = entrySource + '\n' + builtSource;

function headerMarkup(source) {
  const marker = "<header class=\"m-delivery-header workflow\">";
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'missing mobile delivery header');
  const end = source.indexOf("</header>", start);
  assert.notEqual(end, -1, 'missing mobile delivery header end');
  return source.slice(start, end);
}

function reconciliationRendererBlock(source) {
  const start = source.indexOf('function renderReconciliationApp(body)');
  assert.notEqual(start, -1, 'missing renderReconciliationApp');
  const end = source.indexOf('function lineQty', start);
  assert.notEqual(end, -1, 'missing end marker after renderReconciliationApp');
  return source.slice(start, end);
}

test('phase26 removes duplicated reconciliation shortcut from header while keeping the reconciliation tab', () => {
  const header = headerMarkup(entrySource);
  assert.doesNotMatch(header, /mReconShortcut/);
  assert.doesNotMatch(header, />Đối soát<\/button>/);
  assert.match(entrySource, /label: 'Đối soát'/);
});

test('phase26 keeps only the global Tải action and removes large reload buttons from reconciliation tab', () => {
  const header = headerMarkup(entrySource);
  const recon = reconciliationRendererBlock(entrySource);
  assert.match(header, /id="mReload"[^>]*>Tải<\/button>/);
  assert.doesNotMatch(recon, /mReloadReconciliation/);
  assert.doesNotMatch(recon, />Tải lại<\/button>/);
  assert.doesNotMatch(recon, /mLoadReconciliation/);
  assert.doesNotMatch(recon, />Tải đối soát<\/button>/);
  assert.match(recon, /Bấm Tải ở header/);
});

test('phase26 moves logout into menu instead of keeping Thoát as a primary header action', () => {
  const header = headerMarkup(entrySource);
  assert.match(header, /mDeliveryMenuToggle/);
  assert.match(header, /mDeliveryMenu/);
  assert.match(header, /Thông tin tài khoản/);
  assert.match(header, /Đăng xuất/);
  assert.doesNotMatch(header, />Thoát<\/button>/);
  assert.match(css, /DELIVERY_DEDUPLICATE_ACTIONS_UI_START/);
  assert.match(css, /m-delivery-menu/);
});

test('phase26 reconciliation sticky action remains a single completion action', () => {
  assert.match(entrySource, /step-only phase24 reconciliation/);
  assert.match(entrySource, /data-workflow-complete>Hoàn tất - về danh sách<\/button>/);
  const stickyBlock = entrySource.slice(entrySource.indexOf("state.tab === 'customerReconciliation'"), entrySource.indexOf("state.tab === 'debt'"));
  assert.doesNotMatch(stickyBlock, /data-workflow-tab/);
  assert.doesNotMatch(stickyBlock, />Đối soát<\/button>/);
});

test('phase26 keeps all delivery workflow tabs and does not touch backend/API contracts', () => {
  ['Khách giao', 'Hàng giao', 'Hàng trả', 'Thu tiền', 'Đối soát', 'Công nợ'].forEach((label) => {
    assert.match(entrySource, new RegExp(label));
  });
  assert.match(combined, /window\.DeliveryCore/);
  assert.match(entrySource, /\/api\/delivery\/reconciliation/);
  assert.doesNotMatch(combined, /fetch\(['"]\/api\/delivery\/reconciliation['"],\s*\{\s*method:\s*['"]POST/);
});
