'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildArSaleLedger, buildArSaleReversalLedger } = require('../src/domain/ar/arLedgerContract');
const { groupCanonicalLedgers } = require('../src/services/arDebtReadModel.service');
const { b0038423Order } = require('./helpers/phase79FakeModels');

test('AR-SALE confirmed appears in debt read model and dirty ledgers are rejected', () => {
  const sale = buildArSaleLedger(b0038423Order(), { accountant: 'kt01', timestamp: '1' });
  const dirty = { ...sale, id: 'DIRTY', code: 'AR-SALE-DIRTY', category: '', ledgerType: '', entryType: '' };
  const result = groupCanonicalLedgers([sale, dirty], { rebuiltAt: '2026-06-29T10:00:00.000Z' });
  assert.equal(result.canonicalLedgers.length, 1);
  assert.equal(result.rejectedLedgers.length, 1);
  assert.equal(result.debtOrders.length, 1);
  assert.equal(result.debtOrders[0].sourceId, 'SO1782550380164673');
  assert.equal(result.debtOrders[0].remainingDebt, 10402373);
  assert.equal(result.debtCustomers.length, 1);
  assert.equal(result.debtCustomers[0].customerCode, '4501221');
  assert.equal(result.debtCustomers[0].remainingDebt, 10402373);
});

test('rebuild read model matches canonical ledger aggregate', () => {
  const sale = buildArSaleLedger(b0038423Order(), { accountant: 'kt01', timestamp: '1' });
  const reversal = buildArSaleReversalLedger(sale, { accountant: 'kt01', timestamp: '2' });
  const result = groupCanonicalLedgers([sale, reversal]);
  assert.equal(result.rejectedLedgers.length, 0);
  assert.equal(result.debtOrders[0].debit, sale.debit);
  assert.equal(result.debtOrders[0].credit, reversal.credit);
  assert.equal(result.debtOrders[0].remainingDebt, 0);
  assert.equal(result.debtCustomers[0].remainingDebt, 0);
});
