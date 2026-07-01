'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('Debt New popup displays and allocates by availableToCollect instead of remainingDebt only', () => {
  const source = read('public/js/app/new/92-debt-new.js');

  assert.match(source, /function parseVndAmount/);
  assert.match(source, /raw\.replace\(\/\[\^0-9\]\//);
  assert.doesNotMatch(source, /Number\(String\(value \|\| 0\)\.replace\(\/\[\^0-9\.\-\]\//);
  assert.match(source, /function orderRemainingDebt/);
  assert.match(source, /function orderPendingCollectionAmount/);
  assert.match(source, /function orderAvailableToCollect/);
  assert.match(source, /availableToCollect/);
  assert.match(source, /Đã lập phiếu chờ xác nhận/);
  assert.match(source, /Còn có thể thu/);
  assert.match(source, /Popup phân bổ theo <b>Còn có thể thu<\/b>/);

  const allocationStart = source.indexOf('function allocateAmount');
  const allocationEnd = source.indexOf('function renderAllocationPreview', allocationStart);
  const allocationBlock = source.slice(allocationStart, allocationEnd);
  assert.match(allocationBlock, /var debt = orderAvailableToCollect\(order\)/);

  const payloadStart = source.indexOf('function buildCollectionPayload');
  const payloadEnd = source.indexOf('async function submitCollection', payloadStart);
  const payloadBlock = source.slice(payloadStart, payloadEnd);
  assert.match(payloadBlock, /var maxAmount = selected\.reduce\(function \(sum, order\) \{ return sum \+ openDebt\(order\); \}, 0\)/);
  assert.match(payloadBlock, /pendingCollectionAmount: orderPendingCollectionAmount\(row\.order\)/);
  assert.match(payloadBlock, /availableToCollect: orderAvailableToCollect\(row\.order\)/);
});

test('Debt New backend attaches pending lock and availableToCollect to AR-DEBT customer orders', () => {
  const source = read('src/services/v2/debtNew.service.js');
  assert.match(source, /const PENDING_COLLECTION_STATUSES/);
  assert.match(source, /async function attachCollectibleState/);
  assert.match(source, /loadPendingCollectionsForOrders/);
  assert.match(source, /availableToCollect = Math\.max\(0, normalizeDebtAmount\(remainingDebt - pendingCollectionAmount/);
  assert.match(source, /order\.pendingCollectionAmount = pendingCollectionAmount/);
  assert.match(source, /order\.availableToCollect = availableToCollect/);
  assert.match(source, /customer\.pendingCollectionAmount = pendingCollectionAmount/);
  assert.match(source, /customer\.availableToCollect = availableToCollect/);
});
