'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const ContextLoader = require('../src/services/accounting/closeout/CloseoutContextLoader');
const { validateCloseoutContext } = require('../src/services/accounting/closeout/CloseoutContextValidator');
const { writerCacheOptions } = require('../src/services/accounting/closeout/CloseoutCanonicalExecutor');
const OrderPaymentAllocationService = require('../src/services/accounting/OrderPaymentAllocationService');
const fundLedgerRepository = require('../src/repositories/fundLedgerRepository');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function fakeOrder(overrides = {}) {
  return {
    id: 'SO1001',
    code: 'B1001',
    orderCode: 'B1001',
    salesOrderId: 'SO1001',
    salesOrderCode: 'B1001',
    customerCode: 'C001',
    customerName: 'Customer',
    deliveryStatus: 'delivered',
    accountingConfirmed: false,
    deliveryStaffCode: 'NVGH01',
    salesStaffCode: 'NVBH01',
    deliveryDate: '2026-07-11',
    totalAmount: 100000,
    cashAmount: 25000,
    bankAmount: 15000,
    rewardAmount: 10000,
    returnAmount: 0,
    version: 1,
    ...overrides
  };
}

test('Phase242C validator is pure and does not import/query DB', () => {
  const source = read('src/services/accounting/closeout/CloseoutContextValidator.js');
  assert.doesNotMatch(source, /require\(['"].*models|require\(['"].*repositories|\.find(?:One)?\s*\(|updateOne\s*\(|aggregate\s*\(/);
  assert.equal(validateCloseoutContext({
    command: { selectedOrderIds: ['SO1001'], body: {}, date: '2026-07-11' },
    orders: [fakeOrder()],
    returnOrders: []
  }, {
    validateSelectedOrderScope: () => null,
    assertReturnOrdersInventoryReady: () => true
  }), true);
});

test('Phase242C context key collector dedupes AR/Fund idempotency keys', () => {
  const context = {
    command: { actor: 'KT', reason: 'closeout', date: '2026-07-11' },
    pendingConfirmOrders: [fakeOrder()],
    returnOrders: [],
    closeoutScope: { scopeHash: 'scope-1' },
    closeoutScopeHash: 'scope-1',
    selectedOrderCodes: ['B1001'],
    selectedSalesStaffCodes: ['NVBH01']
  };
  const keys = ContextLoader.collectWriterIdempotencyKeys(context, {
    attachCloseoutScope: (closeout) => ({ ...closeout, closeoutScopeHash: 'scope-1', scopeHash: 'scope-1' })
  });
  assert.equal(keys.arIdempotencyKeys.length, new Set(keys.arIdempotencyKeys).size);
  assert.equal(keys.fundIdempotencyKeys.length, new Set(keys.fundIdempotencyKeys).size);
  assert(keys.arIdempotencyKeys.some((key) => key.includes('AR-SALE')));
  assert(keys.fundIdempotencyKeys.some((key) => key.endsWith(':cash')));
  assert(keys.fundIdempotencyKeys.some((key) => key.endsWith(':bank')));
});

test('Phase242C writer cache options pass preloaded idempotency maps to canonical writers', async () => {
  const arLedger = { idempotencyKey: 'AR-CACHED', debit: 10, credit: 0, category: 'AR-SALE' };
  const fundLedger = { idempotencyKey: 'FUND-CACHED', amount: 10 };
  const options = writerCacheOptions({
    writerIdempotency: {
      existingArLedgerByIdempotencyKey: new Map([[arLedger.idempotencyKey, arLedger]]),
      existingFundLedgerByIdempotencyKey: new Map([[fundLedger.idempotencyKey, fundLedger]])
    }
  });

  const cachedAr = await OrderPaymentAllocationService._internal.findActiveArByIdempotency('AR-CACHED', options);
  const cachedFund = await fundLedgerRepository.findByIdempotencyKey('FUND-CACHED', options);
  assert.equal(cachedAr, arLedger);
  assert.equal(cachedFund, fundLedger);
});

test('Phase242C closeout service cuts over before legacy preflight graph', () => {
  const source = read('src/services/accounting/AccountingCloseoutService.js');
  const fnStart = source.indexOf('async function confirmDeliveryAccountingInternal');
  const fnBody = source.slice(fnStart, source.indexOf('async function confirmDeliveryAccounting', fnStart + 1));
  assert.match(fnBody, /loadCanonicalCloseoutContext/);
  assert.match(fnBody, /validateCloseoutContext/);
  assert.match(fnBody, /executeCanonicalCloseoutWriters/);
  assert.match(fnBody, /return buildCloseoutResult/);
  assert(fnBody.indexOf('return buildCloseoutResult') < fnBody.indexOf("const date = normalized.date"), 'canonical path must return before legacy graph');
});

test('Phase242C loader batches existing FundLedger idempotency lookup with $in', () => {
  const source = read('src/services/accounting/closeout/CloseoutContextLoader.js');
  assert.match(source, /context\.existingFundLedgers/);
  assert.match(source, /fundLedgerRepository\.findAll\(\{\s*idempotencyKey:\s*\{\s*\$in:\s*keys\.fundIdempotencyKeys/s);
  assert.doesNotMatch(source, /keys\.fundIdempotencyKeys\.map\(\(idempotencyKey\)/);
});
