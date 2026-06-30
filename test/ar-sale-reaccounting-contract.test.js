'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  validateArLedgerContract,
  assertValidArLedgerContract,
  isCanonicalArDebtLedger
} = require('../src/domain/ar/arLedgerValidator');
const { buildArSaleLedger } = require('../src/domain/ar/arLedgerContract');

const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function functionBody(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${startNeedle} is missing`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `${endNeedle} is missing`);
  return source.slice(start, end);
}

function b0038353Order() {
  return {
    id: 'SO178255038025639',
    code: 'B0038353',
    customerCode: '4500290',
    customerName: 'Hà Phương',
    deliveryDate: '2026-06-29',
    debtBeforeCollection: 389550,
    totalAmount: 389550,
    salesStaffCode: '39534',
    salesStaffName: 'Lương Thị Kiều',
    deliveryStaffCode: 'ghkx',
    deliveryStaffName: 'Hào Giao Hàng KX',
    masterOrderId: 'MO1782550580497158',
    masterOrderCode: 'DT1782550580497663',
    accountingConfirmed: true,
    accountingStatus: 'confirmed'
  };
}

test('AR-SALE builder creates canonical re-accounting ledger accepted by debt read model', () => {
  const batchId = 'ACC-SO178255038025639-1782806002885';
  const ledger = buildArSaleLedger(b0038353Order(), {
    accountant: 'accountant',
    accountingBatchId: batchId,
    id: `AR-SALE-SO178255038025639-${batchId}`,
    code: `AR-SALE-B0038353-${batchId}`,
    idempotencyKey: `AR-SALE:salesOrder:SO178255038025639:${batchId}`,
    amount: 389550,
    timestamp: '1782806002885'
  });

  assert.equal(ledger.category, 'AR-SALE');
  assert.equal(ledger.ledgerType, 'AR-SALE');
  assert.equal(ledger.entryType, 'normal');
  assert.equal(ledger.active, true);
  assert.equal(ledger.reversed, false);
  assert.equal(ledger.direction, 'debit');
  assert.equal(ledger.amountField, 'debit');
  assert.equal(ledger.debit, 389550);
  assert.equal(ledger.credit, 0);
  assert.equal(ledger.sourceType, 'salesOrder');
  assert.equal(ledger.sourceId, 'SO178255038025639');
  assert.equal(ledger.sourceCode, 'B0038353');
  assert.equal(ledger.idempotencyKey, `AR-SALE:salesOrder:SO178255038025639:${batchId}`);
  assert.doesNotThrow(() => assertValidArLedgerContract(ledger));
  assert.equal(isCanonicalArDebtLedger(ledger), true);
});

test('dirty re-accounting AR-SALE missing contract is rejected', () => {
  const dirty = {
    account: 'AR',
    id: 'AR-SALE-SO178255038025639-ACC-SO178255038025639-1782806002885',
    code: 'AR-SALE-B0038353',
    accountingBatchId: 'ACC-SO178255038025639-1782806002885',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    amount: 389550,
    amountField: 'debit',
    category: '',
    ledgerType: '',
    entryType: '',
    customerCode: '4500290',
    customerName: 'Hà Phương',
    date: '2026-06-29',
    debit: 389550,
    credit: 0,
    direction: 'debit',
    sourceType: 'salesOrder',
    sourceId: 'SO178255038025639',
    sourceCode: 'B0038353',
    idempotencyKey: 'AR-SALE:salesOrder:SO178255038025639'
  };

  const result = validateArLedgerContract(dirty);
  const codes = result.errors.map((item) => item.code);
  assert.equal(result.ok, false);
  assert.ok(codes.includes('DIRTY_LEDGER_MISSING_CATEGORY'));
  assert.ok(codes.includes('DIRTY_LEDGER_MISSING_LEDGER_TYPE'));
  assert.ok(codes.includes('DIRTY_LEDGER_MISSING_ENTRY_TYPE'));
  assert.equal(isCanonicalArDebtLedger(dirty), false);
});

test('delivery re-accounting posts new AR-SALE through canonical builder, not makeArBaseRow', () => {
  const source = read('src/services/master-order/deliveryAccountingCore.impl.js');
  const fn = functionBody(source, 'async function postDeliveryArLedgerRowsAfterReAccounting', 'function compactAllocations');
  assert.match(fn, /buildCanonicalArSaleRow\(order/);
  assert.match(fn, /paymentRepository\.upsert\(entry, options\)/);
  assert.doesNotMatch(fn, /makeArBaseRow\(order/);
  assert.doesNotMatch(fn, /category:\s*['"]{2}/);
  assert.doesNotMatch(fn, /ledgerType:\s*['"]{2}/);
  assert.doesNotMatch(fn, /entryType:\s*['"]{2}/);
});

test('batch delivery AR-SALE writer uses canonical builder and deterministic ACC-suffixed code', () => {
  const source = read('src/services/master-order/deliveryAccountingCore.impl.js');
  const makeBatch = functionBody(source, 'function makeBatchArRow', 'function returnAmountForOrderFromMap');
  const batchPost = functionBody(source, 'async function batchPostDeliveryArLedgers', 'async function postDeliveryArIfAccountingConfirmed');
  assert.match(makeBatch, /buildCanonicalArSaleRow\(order/);
  assert.match(batchPost, /code:\s*`AR-SALE-\$\{code \|\| idSeed\}-\$\{accountingBatchId\}`/);
  assert.doesNotMatch(makeBatch, /category:\s*['"]{2}/);
  assert.doesNotMatch(makeBatch, /ledgerType:\s*['"]{2}/);
  assert.doesNotMatch(makeBatch, /entryType:\s*['"]{2}/);
});
