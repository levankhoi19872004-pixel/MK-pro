'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const closeoutPath = path.join(root, 'src/services/accounting/AccountingCloseoutService.js');
const orderRepositoryPath = path.join(root, 'src/repositories/orderRepository.js');
const frontendPath = path.join(root, 'public/js/app/new/91-delivery-today-new.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('closeout has fast idempotent skip before transaction when all orders are already confirmed', () => {
  const source = read(closeoutPath);
  assert.match(source, /function\s+isAccountingConfirmed\s*\(/);
  assert.match(source, /function\s+buildAlreadyConfirmedResult\s*\(/);
  assert.match(source, /alreadyConfirmedOrders\s*=\s*orders\.filter\(isAccountingConfirmed\)/);
  assert.match(source, /pendingConfirmOrders\s*=\s*orders\.filter\(\(order\)\s*=>\s*!isAccountingConfirmed\(order\)\)/);
  const fastSkipIndex = source.indexOf('if (!pendingConfirmOrders.length)');
  const txIndex = source.indexOf('await withMongoTransaction', source.indexOf('async function confirmDeliveryAccountingInternal'));
  assert.ok(fastSkipIndex > -1, 'must have all-confirmed fast skip branch');
  assert.ok(txIndex > -1, 'must still use transaction for pending writes');
  assert.ok(fastSkipIndex < txIndex, 'fast skip must happen before opening transaction');
  const fastSkipBody = source.slice(fastSkipIndex, txIndex);
  assert.match(fastSkipBody, /status:\s*'idempotent'/);
  assert.match(fastSkipBody, /processed:\s*0/);
  assert.match(fastSkipBody, /readModelRebuilds:\s*\[\]/);
  assert.doesNotMatch(fastSkipBody, /patchAccountingCloseoutById\s*\(/);
  assert.doesNotMatch(fastSkipBody, /postDebtOpen\s*\(/);
});

test('confirmed orders are not passed to confirmOneOrder in mixed batch', () => {
  const source = read(closeoutPath);
  const internalStart = source.indexOf('async function confirmDeliveryAccountingInternal');
  const internal = source.slice(internalStart, source.indexOf('async function confirmDeliveryAccounting', internalStart + 1));
  assert.match(internal, /for\s*\(const order of pendingConfirmOrders\)/);
  assert.doesNotMatch(internal, /for\s*\(const order of orders\)/);
  assert.match(internal, /const\s+readModelAffectedResults\s*=\s*results\.filter\(\(row\)\s*=>\s*row\s*&&\s*row\.confirmed\s*&&\s*row\.readModelSyncNeeded\)/);
  assert.match(internal, /enqueueArDebtSyncJobs\s*\(/);
  assert.match(internal, /readModelSyncJobs/);
});

test('confirmOneOrder has guard before any update or AR posting for already confirmed orders', () => {
  const source = read(closeoutPath);
  const match = source.match(/async\s+function\s+confirmOneOrder[\s\S]*?\n}\n\nasync function confirmDeliveryAccountingInternal/);
  assert.ok(match, 'confirmOneOrder must exist');
  const body = match[0];
  const guardIndex = body.indexOf('if (isAccountingConfirmed(order)) return buildAlreadyConfirmedResult(order);');
  const updateIndex = body.indexOf('patchAccountingCloseoutById');
  const postIndex = body.indexOf('postDebtOpen');
  assert.ok(guardIndex > -1, 'confirmed guard must exist');
  assert.ok(updateIndex > guardIndex, 'update must be after confirmed guard');
  assert.ok(postIndex > guardIndex, 'AR posting must be after confirmed guard');
  const beforeUpdate = body.slice(guardIndex, updateIndex);
  assert.doesNotMatch(beforeUpdate, /postDebtOpen\s*\(/);
});

test('matchedCount zero does not continue into AR-DEBT-OPEN posting', () => {
  const source = read(closeoutPath);
  const match = source.match(/if\s*\(!patchResult\s*\|\|\s*Number\(patchResult\.matchedCount[\s\S]*?\n\s*}\n\s*const updatedOrderForLedger/);
  assert.ok(match, 'must handle matchedCount=0 before building ledger order');
  assert.match(match[0], /buildAlreadyConfirmedResult/);
  assert.match(match[0], /ORDER_NOT_FOUND_OR_NOT_UPDATABLE/);
  assert.doesNotMatch(match[0], /postDebtOpen\s*\(/);
});

test('repository closeout update returns matchedCount without throwing on zero match', () => {
  const source = read(orderRepositoryPath);
  const match = source.match(/async\s+function\s+patchAccountingCloseoutById[\s\S]*?\n}\n/);
  assert.ok(match, 'patchAccountingCloseoutById must exist');
  const body = match[0];
  assert.match(body, /Model\.updateOne\s*\(/);
  assert.match(body, /matchedCount:\s*result\.matchedCount/);
  assert.match(body, /modifiedCount:\s*result\.modifiedCount/);
  assert.match(body, /durationMs:/);
  assert.doesNotMatch(body, /if\s*\([^)]*matchedCount[^)]*\)\s*throw/);
  assert.doesNotMatch(body, /upsert\s*:\s*true/);
});



test('repository closeout update does not set deliveryCloseout and unset deliveryCloseout children in one Mongo update', () => {
  const source = read(orderRepositoryPath);
  const match = source.match(/async\s+function\s+patchAccountingCloseoutById[\s\S]*?\n}\n/);
  assert.ok(match, 'patchAccountingCloseoutById must exist');
  const body = match[0];
  assert.match(body, /\$set:\s*canonicalizeOperationalStaff\(patch\)/);
  assert.match(body, /\$inc:\s*\{\s*version:\s*1\s*\}/);
  assert.doesNotMatch(body, /\$unset\s*:/, 'must not combine $set.deliveryCloseout with child $unset paths');
  assert.doesNotMatch(body, /deliveryCloseout\.versions/);
  assert.doesNotMatch(body, /deliveryCloseout\.auditTrail/);
  assert.doesNotMatch(body, /deliveryCloseout\.activeReturnOrders/);
  assert.doesNotMatch(body, /deliveryCloseout\.paymentRows/);
  assert.doesNotMatch(body, /deliveryCloseout\.offsetRows/);
});

test('frontend treats accountingStatus confirmed as non-selectable and idempotent as success notice', () => {
  const source = read(frontendPath);
  assert.match(source, /row\.accountingStatus\s*===\s*'confirmed'/);
  assert.match(source, /Đơn đã được chốt trước đó\. Hệ thống đã bỏ qua/);
  assert.match(source, /Đã chốt '\s*\+\s*closed\s*\+\s*' đơn, bỏ qua '/);
  assert.match(source, /Công nợ đang đồng bộ nền/);
});
