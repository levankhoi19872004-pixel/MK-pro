'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const debtNew = require('../src/services/v2/debtNew.service');
const { buildDebtBusinessEventIdentity } = require('../src/domain/ar/debtBusinessEventIdentity');
const { resolveDebtLedgerOwnership } = require('../src/domain/ar/DebtLedgerOwnershipResolver');
const { COMPONENTS, financialComponentForLedger } = require('../src/domain/ar/debtFinancialComponent');

function side(debit, credit) {
  return debit > 0 ? 'debit' : 'credit';
}

function ledger(category, debit, credit, overrides = {}) {
  const amount = Math.max(debit, credit);
  const direction = side(debit, credit);
  const orderId = overrides.orderId || 'SO-B0039294';
  const orderCode = overrides.orderCode || 'B0039294';
  const allocationId = overrides.allocationId || 'OPA-B0039294-v1';
  const id = overrides.id || `${category}-${orderCode}-${allocationId}`;
  return {
    id,
    code: overrides.code || id,
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    active: true,
    reversed: false,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    status: 'confirmed',
    sourceType: overrides.sourceType || 'ORDER_PAYMENT_ALLOCATION',
    sourceId: overrides.sourceId || allocationId,
    sourceCode: overrides.sourceCode || allocationId,
    allocationId,
    orderPaymentAllocationId: allocationId,
    componentId: overrides.componentId,
    componentCode: overrides.componentCode,
    sourceVersion: overrides.sourceVersion || '1',
    orderId,
    orderCode,
    salesOrderId: orderId,
    salesOrderCode: orderCode,
    customerCode: overrides.customerCode || '4501118',
    customerName: overrides.customerName || 'Anh Lin',
    debit,
    credit,
    amount,
    direction,
    amountField: direction,
    idempotencyKey: overrides.idempotencyKey || `OPA:${allocationId}:${category}`
  };
}

test('Phase260G maps AR categories to shared financial components', () => {
  assert.equal(financialComponentForLedger({ category: 'AR-DEBT-OPEN' }), COMPONENTS.OPENING);
  assert.equal(financialComponentForLedger({ category: 'AR-SALE' }), COMPONENTS.OPENING);
  assert.equal(financialComponentForLedger({ category: 'AR-RECEIPT-CASH' }), COMPONENTS.CASH);
  assert.equal(financialComponentForLedger({ category: 'AR-RECEIPT-BANK' }), COMPONENTS.BANK);
  assert.equal(financialComponentForLedger({ category: 'AR-RECEIPT' }), COMPONENTS.RECEIPT);
  assert.equal(financialComponentForLedger({ category: 'AR-DEBT-PAYMENT' }), COMPONENTS.DEBT_PAYMENT);
  assert.equal(financialComponentForLedger({ category: 'AR-REWARD-ALLOWANCE' }), COMPONENTS.REWARD_ALLOWANCE);
  assert.equal(financialComponentForLedger({ category: 'AR-RETURN' }), COMPONENTS.RETURN);
  assert.equal(financialComponentForLedger({ category: 'AR-EXTERNAL-DEBT' }), COMPONENTS.EXTERNAL_DEBT);
  assert.equal(financialComponentForLedger({ category: 'AR-NOT-KNOWN' }), COMPONENTS.UNKNOWN);
});

test('Phase260G identity separates cash reward bank return and ignores amount/createdAt', () => {
  const cash = buildDebtBusinessEventIdentity(ledger('AR-RECEIPT-CASH', 0, 1817372, { componentId: 'cash-slot' }));
  const reward = buildDebtBusinessEventIdentity(ledger('AR-REWARD-ALLOWANCE', 0, 185000));
  const bank = buildDebtBusinessEventIdentity(ledger('AR-RECEIPT-BANK', 0, 1817372));
  const ret = buildDebtBusinessEventIdentity(ledger('AR-RETURN', 0, 185000, { sourceType: 'RETURN_ORDER', sourceId: 'RO-B0039294', returnOrderId: 'RO-B0039294' }));
  const cashSameSourceDifferentAmount = buildDebtBusinessEventIdentity(ledger('AR-RECEIPT-CASH', 0, 1, { componentId: 'cash-slot', createdAt: '2026-07-01' }));
  const cashOtherLine = buildDebtBusinessEventIdentity(ledger('AR-RECEIPT-CASH', 0, 1817372, { componentId: 'cash-slot-2' }));

  assert.notEqual(cash.businessEventIdentity, reward.businessEventIdentity);
  assert.notEqual(cash.businessEventIdentity, bank.businessEventIdentity);
  assert.notEqual(bank.businessEventIdentity, reward.businessEventIdentity);
  assert.notEqual(ret.businessEventIdentity, reward.businessEventIdentity);
  assert.equal(cash.businessEventIdentity, cashSameSourceDifferentAmount.businessEventIdentity);
  assert.notEqual(cash.businessEventIdentity, cashOtherLine.businessEventIdentity);
  assert.match(cash.businessEventIdentity, /PAYMENT_REDUCTION\|CASH\|ORDER_PAYMENT_ALLOCATION:OPA-B0039294-V1\|ORDER:SO-B0039294\|COMPONENT:CASH-SLOT\|V:1/);
  assert.match(reward.businessEventIdentity, /PAYMENT_REDUCTION\|REWARD_ALLOWANCE\|ORDER_PAYMENT_ALLOCATION:OPA-B0039294-V1/);
});

test('Phase260G B0039294 keeps cash and reward credits selected', () => {
  const result = debtNew.groupLedgers([
    ledger('AR-SALE', 2002372, 0),
    ledger('AR-RECEIPT-CASH', 0, 1817372),
    ledger('AR-REWARD-ALLOWANCE', 0, 185000)
  ], { status: 'all' });

  assert.deepEqual(result.ledgers.map((row) => row.category).sort(), ['AR-RECEIPT-CASH', 'AR-REWARD-ALLOWANCE', 'AR-SALE'].sort());
  assert.equal(result.shadowedLedgers.length, 0);
  assert.equal(result.summary.totalDebit, 2002372);
  assert.equal(result.summary.totalCredit, 2002372);
  assert.equal(result.summary.totalDebt, 0);
  assert.equal(result.orders[0].rawBalance, 0);
  assert.equal(result.orders[0].debtAmount, 0);
  assert.equal(result.orders[0].creditBalance, 0);
});

test('Phase260G cash bank reward components all participate in projection', () => {
  const result = debtNew.groupLedgers([
    ledger('AR-SALE', 5000000, 0, { orderCode: 'B-CBR', orderId: 'SO-CBR', allocationId: 'OPA-CBR' }),
    ledger('AR-RECEIPT-CASH', 0, 2000000, { orderCode: 'B-CBR', orderId: 'SO-CBR', allocationId: 'OPA-CBR' }),
    ledger('AR-RECEIPT-BANK', 0, 2500000, { orderCode: 'B-CBR', orderId: 'SO-CBR', allocationId: 'OPA-CBR' }),
    ledger('AR-REWARD-ALLOWANCE', 0, 500000, { orderCode: 'B-CBR', orderId: 'SO-CBR', allocationId: 'OPA-CBR' })
  ], { status: 'all' });

  assert.equal(result.summary.totalDebit, 5000000);
  assert.equal(result.summary.totalCredit, 5000000);
  assert.equal(result.summary.totalDebt, 0);
  assert.equal(result.ledgers.filter((row) => row.semanticRole === 'PAYMENT_REDUCTION').length, 3);
});

test('Phase260G duplicate same cash component is not double counted but same amount different source is selected', () => {
  const duplicate = debtNew.groupLedgers([
    ledger('AR-SALE', 1000000, 0, { orderCode: 'B-DUP-CASH', orderId: 'SO-DUP-CASH', allocationId: 'OPA-DUP-CASH' }),
    ledger('AR-RECEIPT-CASH', 0, 1000000, { id: 'CASH-1', orderCode: 'B-DUP-CASH', orderId: 'SO-DUP-CASH', allocationId: 'OPA-DUP-CASH', componentId: 'cash-slot' }),
    ledger('AR-RECEIPT-CASH', 0, 1000000, { id: 'CASH-2', orderCode: 'B-DUP-CASH', orderId: 'SO-DUP-CASH', allocationId: 'OPA-DUP-CASH', componentId: 'cash-slot' })
  ], { status: 'all' });
  assert.equal(duplicate.summary.totalCredit, 1000000);
  assert.equal(duplicate.summary.duplicateLedgerCount, 1);

  const distinct = debtNew.groupLedgers([
    ledger('AR-SALE', 2000000, 0, { orderCode: 'B-DIST-CASH', orderId: 'SO-DIST-CASH', allocationId: 'OPA-DIST-CASH' }),
    ledger('AR-RECEIPT-CASH', 0, 1000000, { id: 'CASH-A', orderCode: 'B-DIST-CASH', orderId: 'SO-DIST-CASH', allocationId: 'OPA-DIST-CASH-A', componentId: 'cash-slot-a' }),
    ledger('AR-RECEIPT-CASH', 0, 1000000, { id: 'CASH-B', orderCode: 'B-DIST-CASH', orderId: 'SO-DIST-CASH', allocationId: 'OPA-DIST-CASH-B', componentId: 'cash-slot-b' })
  ], { status: 'all' });
  assert.equal(distinct.summary.totalCredit, 2000000);
  assert.equal(distinct.summary.duplicateLedgerCount, 0);
});

test('Phase260G resolver exposes financial component diagnostics', () => {
  const ownership = resolveDebtLedgerOwnership([
    ledger('AR-RECEIPT-CASH', 0, 1817372),
    ledger('AR-REWARD-ALLOWANCE', 0, 185000)
  ]);
  assert.equal(ownership.shadowedEntries.length, 0);
  assert.deepEqual(ownership.selectedEntries.map((row) => row.financialComponent).sort(), ['CASH', 'REWARD_ALLOWANCE']);
});

test('Phase260G static guards forbid component identity shortcuts', () => {
  const identity = fs.readFileSync(path.join(__dirname, '..', 'src/domain/ar/debtBusinessEventIdentity.js'), 'utf8');
  const component = fs.readFileSync(path.join(__dirname, '..', 'src/domain/ar/debtFinancialComponent.js'), 'utf8');
  assert.doesNotMatch(identity, /amount|createdAt/);
  assert.equal(component.includes('.includes('), false);
  assert.match(identity, /financialComponent/);
  assert.match(identity, /componentSourceIdentity/);
});
