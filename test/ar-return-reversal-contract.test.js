'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const fakePaymentRepository = {
  _findAll: async () => [],
  _writes: [],
  async findAll(filter, options) { return this._findAll(filter, options); },
  async upsert(row) { this._writes.push(row); return row; },
  async deleteOne() { return null; }
};

const fakeReturnOrderRepository = {
  async findByIdOrCode() { return null; },
  async findAll() { return []; },
  async upsert(row) { return row; }
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  const normalized = String(request || '').replace(/\\/g, '/');
  if (normalized.endsWith('repositories/paymentRepository') || normalized.endsWith('repositories/paymentRepository.js')) {
    return fakePaymentRepository;
  }
  if (normalized.endsWith('repositories/returnOrderRepository') || normalized.endsWith('repositories/returnOrderRepository.js')) {
    return fakeReturnOrderRepository;
  }
  if (normalized.endsWith('repositories/customerRepository') || normalized.endsWith('repositories/customerRepository.js')) {
    return { async findByIdOrCode() { return null; } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const returnArPostingService = require('../src/services/accounting/returnArPostingService');
const postingEngine = require('../src/engines/posting.engine');
const deliveryAccountingCore = require('../src/services/master-order/deliveryAccountingCore.impl');

function confirmedReturnOrder(overrides = {}) {
  return {
    id: 'RO-B0038424',
    code: 'RO-B0038424',
    sourceModel: 'returnOrders',
    sourceType: 'returnOrder',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    customerId: 'CUS-1',
    customerCode: '4501256',
    customerName: 'Chị Sen',
    salesOrderId: 'SO178255038016695',
    salesOrderCode: 'SO178255038016695',
    deliveryStaffCode: 'ghth',
    deliveryStaffName: 'Thành GH Tiền Hải',
    amount: 276632,
    ...overrides
  };
}

test('AR-RETURN thường là credit, có accountingConfirmedBy fallback và không dùng direction để tính ngược', () => {
  const entry = returnArPostingService.buildReturnARLedgerEntry(confirmedReturnOrder());

  assert.equal(entry.type, 'ar_return');
  assert.equal(entry.ledgerType, 'AR-RETURN');
  assert.equal(entry.category, 'AR-RETURN');
  assert.equal(entry.debit, 0);
  assert.equal(entry.credit, 276632);
  assert.equal(entry.amount, 276632);
  assert.equal(entry.direction, 'credit');
  assert.equal(entry.accountingConfirmedBy, 'system');
});

test('reverseReturnOrderAR sinh AR-RETURN-REVERSAL debit và idempotent theo returnOrder key', async () => {
  fakePaymentRepository._writes = [];

  const first = await postingEngine.reverseReturnOrderAR(confirmedReturnOrder(), { confirmedBy: 'accountant' });
  const second = await postingEngine.reverseReturnOrderAR(confirmedReturnOrder(), { confirmedBy: 'accountant' });

  assert.equal(first.id, 'AR-RETURN-REVERSAL-RO-B0038424');
  assert.equal(second.id, first.id);
  assert.equal(first.idempotencyKey, 'AR-RETURN-REVERSAL:RO-B0038424');
  assert.equal(first.type, 'ar_return_reversal');
  assert.equal(first.category, 'AR-RETURN-REVERSAL');
  assert.equal(first.sourceCategory, 'AR-RETURN');
  assert.equal(first.entryType, 'reversal');
  assert.equal(first.debit, 276632);
  assert.equal(first.credit, 0);
  assert.equal(first.direction, 'debit');
  assert.equal(first.amountField, 'debit');
  assert.equal(first.accountingConfirmedBy, 'accountant');
  assert.ok(Array.isArray(first.auditTrail));
  assert.equal(first.auditTrail[0].action, 'reverse_ar_return');
  assert.equal(fakePaymentRepository._writes.length, 2, 'upsert được gọi lại nhưng cùng id/code nên không sinh duplicate document');
  assert.equal(fakePaymentRepository._writes[0].id, fakePaymentRepository._writes[1].id);
});

test('delivery re-accounting reverse AR-RETURN không giữ sót category/direction từ ledger cũ', async () => {
  fakePaymentRepository._writes = [];
  fakePaymentRepository._findAll = async () => ([{
    id: 'AR-RETURN-RO-B0038424',
    code: 'AR-RETURN-RO-B0038424',
    type: 'ar_return',
    ledgerType: 'AR-RETURN',
    category: 'AR-RETURN',
    direction: 'credit',
    amountField: 'amount',
    amount: 276632,
    debit: 0,
    credit: 276632,
    status: 'posted',
    accountingStatus: 'confirmed',
    accountingConfirmed: true,
    accountingConfirmedBy: '',
    auditTrail: [],
    orderId: 'SO178255038016695',
    orderCode: 'SO178255038016695',
    returnOrderId: 'RO-B0038424',
    returnOrderCode: 'RO-B0038424',
    customerCode: '4501256'
  }]);

  const result = await deliveryAccountingCore.reverseActiveArLedgersForOrder(
    { id: 'SO178255038016695', code: 'SO178255038016695' },
    { code: 'accountant' }
  );

  assert.equal(result.reversedRows.length, 1);
  const reversal = result.reversedRows[0];
  assert.equal(reversal.type, 'ar_return_reversal');
  assert.equal(reversal.ledgerType, 'AR-RETURN-REVERSAL');
  assert.equal(reversal.category, 'AR-RETURN-REVERSAL');
  assert.equal(reversal.sourceCategory, 'AR-RETURN');
  assert.equal(reversal.entryType, 'reversal');
  assert.equal(reversal.refType, 'AR_LEDGER_REVERSAL');
  assert.equal(reversal.debit, 276632);
  assert.equal(reversal.credit, 0);
  assert.equal(reversal.direction, 'debit');
  assert.equal(reversal.amountField, 'debit');
  assert.equal(reversal.accountingConfirmedBy, 'accountant');
  assert.ok(reversal.auditTrail.some((event) => event.action === 'reverse_ar_return'));
  assert.doesNotMatch(reversal.code, /AR-RETURN-REV-AR-RETURN/);

  const oldPatch = fakePaymentRepository._writes[1];
  assert.equal(oldPatch.status, 'reversed');
  assert.equal(oldPatch.accountingStatus, 'reversed');
  assert.ok(oldPatch.auditTrail.some((event) => event.action === 'mark_ar_ledger_reversed'));
  fakePaymentRepository._findAll = async () => [];
});

test('static guard: active AR-RETURN lookup loại reversal và không còn mẫu code lồng prefix', () => {
  const serviceSource = read('src/services/accounting/returnArPostingService.js');
  const coreSource = read('src/services/master-order/deliveryAccountingCore.impl.js');
  const postingSource = read('src/engines/posting.engine.js');
  const duplicateRepairSource = read('scripts/repair-ar-return-duplicates.js');

  assert.match(serviceSource, /entryType:\s*\{\s*\$ne:\s*'reversal'\s*\}/);
  assert.match(serviceSource, /'AR-RETURN-REVERSAL'/);
  assert.match(coreSource, /const sourceCategory = canonicalArSourceCategory/);
  assert.match(postingSource, /category:\s*'AR-RETURN-REVERSAL'/);
  assert.match(duplicateRepairSource, /category:\s*'AR-RETURN-REVERSAL'/);
  assert.doesNotMatch(coreSource, /AR-RETURN-REV-\$\{old\.(?:id|code)/);
  assert.doesNotMatch(`${coreSource}\n${postingSource}\n${duplicateRepairSource}`, /AR-RETURN-REV-AR-RETURN/);
});
