'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCanonicalOrder, buildOrderReconciliation } = require('../src/engines/delivery.engine');

test('DeliveryEngine builds canonical order from returnOrders and reconciles money', () => {
  const order = {
    id: 'SO1', code: 'SO001', customerCode: 'C1', customerName: 'Khách A', deliveryDate: '2026-06-05',
    totalAmount: 100000,
    cashAmount: 40000,
    bankAmount: 20000,
    rewardAmount: 10000,
    items: [{ productCode: 'P1', productName: 'SP 1', quantity: 10, price: 3000 }]
  };
  const returns = [{ salesOrderId: 'SO1', status: 'active', items: [{ productCode: 'P1', productName: 'SP 1', returnQty: 10, price: 3000 }] }];
  const row = buildCanonicalOrder(order, returns);
  assert.equal(row.amounts.receivable, 100000);
  assert.equal(row.amounts.returnAmount, 30000);
  assert.equal(row.amounts.debt, 0);
  assert.equal(row.reconciliation.balanced, true);
});

test('DeliveryEngine reconciliation detects money mismatch', () => {
  const r = buildOrderReconciliation({ receivable: 100000, cash: 40000, bank: 10000, reward: 0, returnAmount: 0, debt: 30000 });
  assert.equal(r.balanced, false);
  assert.equal(r.difference, 20000);
});
