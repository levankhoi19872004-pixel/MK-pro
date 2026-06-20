'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourceBundle = require('./helpers/sourceBundle.util');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const readSource = (file) => sourceBundle.readSource(path.join(ROOT, file));

test('shared mobile UI runtime exposes lifecycle, debounce, request gate, state and chunked list contracts', () => {
  const source = readSource('public/mobile/js/ui-runtime.js');
  assert.match(source, /function createLifecycle\(/);
  assert.match(source, /function debounce\(/);
  assert.match(source, /function createRequestGate\(/);
  assert.match(source, /function renderState\(/);
  assert.match(source, /function createChunkedHtmlRenderer\(/);
  assert.match(source, /function bindDebouncedInput\(/);
  assert.doesNotMatch(source, /inventory|arLedgers|fundLedgers|returnOrders|\/api\//i);
});

test('mobile pages load shared runtime before feature code', () => {
  const salesHtml = read('public/mobile/sales.html');
  const deliveryHtml = read('public/mobile/delivery.html');
  assert.ok(salesHtml.indexOf('ui-runtime.js') < salesHtml.indexOf('js/sales.js'));
  assert.ok(deliveryHtml.indexOf('ui-runtime.js') < deliveryHtml.indexOf('delivery-mobile-view.js'));
});

test('mobile sales uses chunked renderers and delegated list actions without per-row listener rebinding', () => {
  const sales = readSource('public/mobile/js/sales.js');
  assert.match(sales, /createChunkedHtmlRenderer\(customerList/);
  assert.match(sales, /createChunkedHtmlRenderer\(debtList/);
  assert.match(sales, /createChunkedHtmlRenderer\(todayOrders/);
  assert.match(sales, /mobileSalesLifecycle\.delegate\(customerList/);
  assert.match(sales, /mobileSalesLifecycle\.delegate\(debtList/);
  assert.doesNotMatch(sales, /customerList\.querySelectorAll\('\[data-customer-index\]'/);
  assert.doesNotMatch(sales, /debtList\.querySelectorAll\('\[data-debt-index\]/);
});

test('mobile delivery uses one delegated order handler, chunked lists and stale-response guards', () => {
  const view = readSource('public/mobile/js/delivery-mobile-view.js');
  const core = read('public/js/delivery/delivery-core.js');
  assert.match(view, /createChunkedHtmlRenderer\(el\('mBody'\)/);
  assert.match(view, /deliveryLifecycle\.delegate\(el\('mBody'\), 'click', '\[data-order-key\]'/);
  assert.match(view, /deliveryLifecycle\.delegate\(el\('mBody'\), 'click', '\[data-debt-index\]/);
  assert.match(view, /deliveryLoadGate\.begin\(\)/);
  assert.match(view, /deliveryLoadGate\.isCurrent\(requestToken\)/);
  assert.doesNotMatch(view, /body\.querySelectorAll\('\[data-order-key\]'\)\.forEach/);
  assert.match(core, /requestSeq:\s*\{ orders: 0, returns: 0 \}/);
  assert.match(core, /requestSeq !== this\.state\.requestSeq\.orders/);
  assert.match(core, /requestSeq !== this\.state\.requestSeq\.returns/);
});

test('request gate invalidates prior work and aborts its signal', () => {
  const context = {
    window: {},
    document: {},
    setTimeout,
    clearTimeout,
    AbortController
  };
  context.window = context;
  vm.runInNewContext(read('public/mobile/js/ui-runtime.js'), context);
  const gate = context.MobileUiRuntime.createRequestGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  gate.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(gate.isCurrent(second), false);
});

test('debounce collapses ten rapid inputs into one callback and lifecycle cleanup cancels listeners', async () => {
  const context = {
    window: {},
    document: {},
    setTimeout,
    clearTimeout,
    AbortController
  };
  context.window = context;
  vm.runInNewContext(read('public/mobile/js/ui-runtime.js'), context);
  let calls = 0;
  const debounced = context.MobileUiRuntime.debounce(() => { calls += 1; }, 15);
  for (let i = 0; i < 10; i += 1) debounced(i);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls, 1);
});
