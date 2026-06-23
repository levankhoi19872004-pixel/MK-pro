'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const source = fs.readFileSync('public/mobile/js/delivery-mobile-view.source.js', 'utf8');
const css = fs.readFileSync('public/mobile/mobile.source/mobile-04.css', 'utf8');

function block(startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing ${endNeedle}`);
  return source.slice(start, end);
}

test('delivery payment sticky confirm button uses direct click handler for WebView compatibility', () => {
  const workflowBar = block('function renderWorkflowBar()', 'function render()');
  assert.match(workflowBar, /data-payment-submit/);
  assert.match(workflowBar, /type="button"/);
  assert.doesNotMatch(workflowBar, /form="mPaymentForm"/);
  assert.match(source, /delegate\(el\('mWorkflowBar'\), 'click', '\[data-payment-submit\]'/);
  assert.match(source, /savePayment\(event\)/);
});

test('delivery payment submit validates over-collection and reports inline error', () => {
  const validateBlock = block('function validatePaymentAmounts(order, values)', 'function renderPayment(body)');
  assert.match(validateBlock, /over > 1000/);
  assert.match(validateBlock, /Thu vượt/);
  assert.match(source, /id="mPaymentError"/);
  assert.match(source, /showPaymentError\(validatePaymentAmounts\(order, values\)\)/);
  assert.match(css, /\.m-payment-error/);
});

test('delivery payment submit is double-submit safe and returns to delivery list after success', () => {
  const saveBlock = block('async function savePayment(event)', 'async function confirmDelivery()');
  assert.match(saveBlock, /state\.paymentSubmitting/);
  assert.match(saveBlock, /setPaymentSubmittingUI\(true\)/);
  assert.match(saveBlock, /DeliveryCore\.savePayment/);
  assert.match(saveBlock, /DeliveryCore\.confirmDelivery/);
  assert.match(saveBlock, /state\.selectedKey = ''/);
  assert.match(saveBlock, /switchToListMode\(\{ clearSelected: true, forceOrders: true \}\)/);
  assert.match(saveBlock, /load\(\{ force: true, refreshActiveTab: true \}\)/);
});
