'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const arLedgerRead = require('../src/services/arLedgerRead.service');
const policy = require('../src/domain/ar/arLedgerQueryPolicy');
const { buildArSaleLedger, buildArSaleReversalLedger } = require('../src/domain/ar/arLedgerContract');
const { FakeModel, b0038423Order } = require('./helpers/phase79FakeModels');

function setupLedgerRows(rows) {
  const ArLedger = new FakeModel(rows);
  arLedgerRead.setModelsForTest({ ArLedger });
  return ArLedger;
}

test('buildCanonicalArLedgerMatch enforces confirmed active canonical AR categories', () => {
  const match = policy.buildCanonicalArLedgerMatch({ deliveryStaffCode: 'ghth', status: 'open' });
  assert.equal(match.account, 'AR');
  assert.equal(match.accountingConfirmed, true);
  assert.equal(match.accountingStatus, 'confirmed');
  assert.equal(match.active, true);
  assert.deepEqual(match.reversed, { $ne: true });
  assert.ok(match.category.$in.includes('AR-SALE'));
  assert.ok(match.$and.some((part) => JSON.stringify(part).includes('deliveryStaffCode')));
});

test('getCanonicalArLedgers rejects dirty AR-SALE and never computes by code regex', async () => {
  const sale = buildArSaleLedger(b0038423Order(), { accountant: 'kt01', timestamp: '1' });
  const dirty = { ...sale, id: 'AR-SALE-DIRTY-B0038423', code: 'AR-SALE-DIRTY-B0038423', category: '', ledgerType: '', entryType: '' };
  setupLedgerRows([sale, dirty]);
  const result = await arLedgerRead.getCanonicalArLedgers({ deliveryStaffCode: 'GHTH' }, { includeRejected: true });
  assert.equal(result.canonicalLedgers.length, 1);
  assert.equal(result.canonicalLedgers[0].sourceCode, 'B0038423');
  assert.equal(result.rejectedLedgers.length, 0, 'dirty row is excluded by Mongo match before validator; it is not accepted by code regex');
});

test('aggregateDebtByCustomer and aggregateDebtByOrder use debit minus credit only', async () => {
  const sale = buildArSaleLedger(b0038423Order({ amount: 10402373 }), { accountant: 'kt01', timestamp: '1' });
  const reversal = buildArSaleReversalLedger(sale, { accountant: 'kt01', timestamp: '2' });
  setupLedgerRows([sale, reversal]);
  const orders = await arLedgerRead.aggregateDebtByOrder({ status: 'all', deliveryStaffCode: 'ghth' });
  assert.equal(orders.length, 1);
  assert.equal(orders[0].debit, 10402373);
  assert.equal(orders[0].credit, 10402373);
  assert.equal(orders[0].remainingDebt, 0);
  const customers = await arLedgerRead.aggregateDebtByCustomer({ status: 'closed', salesStaffCode: '35095' });
  assert.equal(customers.length, 1);
  assert.equal(customers[0].customerCode, '4501221');
  assert.equal(customers[0].remainingDebt, 0);
});

test('normalizeDebtStatus maps Vietnamese UI label to open but API should use canonical value', () => {
  assert.equal(policy.normalizeDebtStatus('Khách còn nợ'), 'open');
  assert.equal(policy.normalizeDebtStatus(''), 'open');
  assert.equal(policy.normalizeDebtStatus('hết nợ'), 'closed');
  assert.equal(policy.normalizeDebtStatus('all'), 'all');
});
