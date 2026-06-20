'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  INVOICE_TYPES,
  normalizeInvoiceType,
  resolveInvoiceType,
  isActiveInvoiceOrder,
  buildInvoiceTypeMongoClause,
  partitionInvoiceOrders
} = require('../src/services/invoiceExportClassifier');

test('invoice type aliases are validated and normalized', () => {
  assert.equal(normalizeInvoiceType('VAT'), INVOICE_TYPES.VAT);
  assert.equal(normalizeInvoiceType('non-vat'), INVOICE_TYPES.NON_VAT);
  assert.equal(normalizeInvoiceType('khong vat'), INVOICE_TYPES.NON_VAT);
  assert.equal(normalizeInvoiceType('unknown'), '');
});

test('legacy missing VAT flag remains VAT compatible', () => {
  assert.equal(resolveInvoiceType({}), INVOICE_TYPES.VAT);
  assert.equal(resolveInvoiceType({ vatInvoiceRequired: null }), INVOICE_TYPES.VAT);
  assert.equal(resolveInvoiceType({ vatInvoiceRequired: true }), INVOICE_TYPES.VAT);
  assert.equal(resolveInvoiceType({ vatInvoiceRequired: 'true' }), INVOICE_TYPES.VAT);
});

test('explicit false-like values are classified as NON_VAT', () => {
  for (const value of [false, 0, 'false', ' FALSE ', '0', 'no', 'non_vat', 'non-vat', 'khong', 'không']) {
    assert.equal(resolveInvoiceType({ vatInvoiceRequired: value }), INVOICE_TYPES.NON_VAT, String(value));
  }
});

test('cancelled and soft-deleted orders are excluded regardless of which status field carries the value', () => {
  assert.equal(isActiveInvoiceOrder({ status: 'pending', lifecycleStatus: 'cancelled' }), false);
  assert.equal(isActiveInvoiceOrder({ status: 'pending', deliveryStatus: 'VOID' }), false);
  assert.equal(isActiveInvoiceOrder({ status: 'pending', deleted: true }), false);
  assert.equal(isActiveInvoiceOrder({ status: 'pending', isDeleted: '1' }), false);
  assert.equal(isActiveInvoiceOrder({ status: 'pending', deletedAt: '2026-06-20T00:00:00.000Z' }), false);
  assert.equal(isActiveInvoiceOrder({ status: 'pending', deleted: false, deletedAt: '' }), true);
});

test('partition is exhaustive and mutually exclusive for active orders', () => {
  const orders = [
    { id: 'VAT-MISSING' },
    { id: 'VAT-TRUE', vatInvoiceRequired: true },
    { id: 'NON-BOOL', vatInvoiceRequired: false },
    { id: 'NON-STRING', vatInvoiceRequired: 'false' },
    { id: 'CANCEL', vatInvoiceRequired: true, status: 'cancelled' },
    { id: 'DELETED', vatInvoiceRequired: false, deleted: true }
  ];
  const result = partitionInvoiceOrders(orders);
  assert.deepEqual(result.VAT.map((row) => row.id), ['VAT-MISSING', 'VAT-TRUE']);
  assert.deepEqual(result.NON_VAT.map((row) => row.id), ['NON-BOOL', 'NON-STRING']);
  assert.deepEqual(result.excluded.map((row) => row.id), ['CANCEL', 'DELETED']);
  const vatIds = new Set(result.VAT.map((row) => row.id));
  assert.equal(result.NON_VAT.some((row) => vatIds.has(row.id)), false);
  assert.equal(result.VAT.length + result.NON_VAT.length + result.excluded.length, orders.length);
});

test('Mongo clauses normalize boolean, numeric and string representations on the server', () => {
  const vatClause = buildInvoiceTypeMongoClause('VAT');
  const nonVatClause = buildInvoiceTypeMongoClause('NON_VAT');
  assert.ok(vatClause?.$expr?.$not);
  assert.ok(nonVatClause?.$expr?.$in);
  assert.match(JSON.stringify(nonVatClause), /vatInvoiceRequired/);
  assert.match(JSON.stringify(nonVatClause), /false/);
});
