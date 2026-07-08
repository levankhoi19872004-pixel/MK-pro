'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const allocationService = fs.readFileSync(path.join(root, 'src/services/accounting/OrderPaymentAllocationService.js'), 'utf8');

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing marker ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `missing marker ${endMarker}`);
  return source.slice(start, end);
}

function bodyOfFunction(source, name) {
  if (name === 'buildAllocationFromCloseout') {
    return sliceBetween(source, 'function buildAllocationFromCloseout', 'async function upsertAllocation');
  }
  return sliceBetween(source, `function ${name}`, '\nfunction ');
}

test('order payment allocation has authoritative money picker that accepts explicit zero', () => {
  assert.match(allocationService, /function pickAuthoritativeMoney\(sources = \[\], fields = \[\], fallback = 0\)/);
  assert.match(allocationService, /hasOwnMoneyValue\(source, field\)/);
  assert.match(allocationService, /if \(Number\.isFinite\(amount\)\) return amount;/);
  assert.doesNotMatch(allocationService, /function pickAuthoritativeMoney[\s\S]*?if \(amount > 0\) return amount;/);
});

test('buildAllocationFromCloseout uses closeout/version final-state amounts before legacy order fallback', () => {
  const fn = bodyOfFunction(allocationService, 'buildAllocationFromCloseout');
  assert.match(fn, /const sourceObjects = \[closeout, order\]/);
  assert.match(fn, /const receivableAmount = pickAuthoritativeMoney\(sourceObjects, CLOSEOUT_RECEIVABLE_FIELDS\)/);
  assert.match(fn, /let cashAmount = pickAuthoritativeMoney\(sourceObjects, CLOSEOUT_CASH_FIELDS\)/);
  assert.match(fn, /const bankAmount = pickAuthoritativeMoney\(sourceObjects, CLOSEOUT_BANK_FIELDS\)/);
  assert.match(fn, /const rewardAmount = pickAuthoritativeMoney\(sourceObjects, CLOSEOUT_REWARD_FIELDS\)/);
  assert.match(fn, /const returnAmount = pickAuthoritativeMoney\(sourceObjects, CLOSEOUT_RETURN_FIELDS\)/);
  assert.doesNotMatch(fn, /const receivableAmount = pickFirstPositiveMoney\(sourceObjects, CLOSEOUT_RECEIVABLE_FIELDS\)/);
  assert.doesNotMatch(fn, /let cashAmount = pickFirstPositiveMoney\(sourceObjects, CLOSEOUT_CASH_FIELDS\)/);
  assert.doesNotMatch(fn, /const bankAmount = pickFirstPositiveMoney\(sourceObjects, CLOSEOUT_BANK_FIELDS\)/);
  assert.doesNotMatch(fn, /const rewardAmount = pickFirstPositiveMoney\(sourceObjects, CLOSEOUT_REWARD_FIELDS\)/);
  assert.doesNotMatch(fn, /const returnAmount = pickFirstPositiveMoney\(sourceObjects, CLOSEOUT_RETURN_FIELDS\)/);
});

test('legacy collectedAmount fallback is disabled when closeout explicitly carries zero cash/bank', () => {
  const fn = bodyOfFunction(allocationService, 'buildAllocationFromCloseout');
  assert.match(fn, /const closeoutHasExplicitCashOrBank = hasAuthoritativeMoney\(\[closeout\], CLOSEOUT_CASH_FIELDS\)/);
  assert.match(fn, /\|\| hasAuthoritativeMoney\(\[closeout\], CLOSEOUT_BANK_FIELDS\)/);
  assert.match(fn, /if \(!closeoutHasExplicitCashOrBank && cashAmount <= 0 && bankAmount <= 0\)/);
  assert.match(fn, /cashAmount: 0 \/ bankAmount: 0 from being overwritten by stale order values/);
});

test('explicit debt conflict guard remains active', () => {
  assert.match(allocationService, /ORDER_PAYMENT_ALLOCATION_EXPLICIT_DEBT_CONFLICT/);
  assert.match(allocationService, /finalDebtAmount\/debtAmount trong closeout lệch với normalizedDebtAmount sau Debt Zero Tolerance/);
  assert.match(allocationService, /if \(explicitDebtAmount !== null && Math\.abs\(money\(explicitDebtAmount\) - normalizedDebtAmount\) > zeroTolerance\)/);
});
