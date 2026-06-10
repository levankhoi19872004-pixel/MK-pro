'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// Unit test phần pure của aggregate customer debt không cần kết nối Mongo/Mongoose.
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../models/ArLedger') {
    return { aggregate: () => ({ allowDiskUse: () => ({ exec: async () => [] }) }) };
  }
  return originalLoad.apply(this, arguments);
};
const { buildCustomerDebtAggregatePipeline, normalizeCustomerDebtAggregateRows } = require('../src/services/debtAggregate.service');
Module._load = originalLoad;

function legacyReduceCustomerDebt(rows = []) {
  const byCustomer = new Map();
  for (const row of rows) {
    const key = row.customerId || row.customerCode || row.customerName;
    if (!key) continue;
    if (!byCustomer.has(key)) {
      byCustomer.set(key, {
        customerId: row.customerId || '',
        customerCode: row.customerCode || '',
        customerName: row.customerName || '',
        debit: 0,
        credit: 0,
        debt: 0,
        receiptAmount: 0,
        returnAmount: 0,
        bonusAmount: 0
      });
    }
    const target = byCustomer.get(key);
    const type = String(row.type || '').toLowerCase();
    const amount = Number(row.amount || 0);
    const debit = Number(row.debit || 0) || (type.includes('sale') ? amount : 0);
    const credit = Number(row.credit || 0) || (type.includes('sale') ? 0 : amount);
    target.debit += debit;
    target.credit += credit;
    target.debt += debit - credit;
    if (/receipt|payment|collection|debt/.test(type)) target.receiptAmount += credit;
    if (/return/.test(type)) target.returnAmount += credit;
    if (/bonus|discount|allowance/.test(type)) target.bonusAmount += credit;
  }
  return Array.from(byCustomer.values()).filter((row) => row.debt > 1000).sort((a, b) => b.debt - a.debt);
}

test('customer debt aggregate pipeline groups by customer and filters open balance', () => {
  const pipeline = buildCustomerDebtAggregatePipeline({ status: 'active' }, { limit: 100 });
  assert.deepEqual(pipeline[0], { $match: { status: 'active' } });
  assert.ok(pipeline.some((stage) => stage.$group && stage.$group._id.customerId === '$customerId'));
  assert.ok(pipeline.some((stage) => stage.$match && stage.$match.debt && stage.$match.debt.$gt === 1000));
});

test('normalized aggregate customer debt matches legacy reducer totals', () => {
  const ledgerRows = [
    { customerId: 'C1', customerCode: 'KH01', customerName: 'Khach 1', type: 'AR-SALE', debit: 100000, credit: 0, amount: 100000 },
    { customerId: 'C1', customerCode: 'KH01', customerName: 'Khach 1', type: 'AR-RECEIPT', debit: 0, credit: 25000, amount: 25000 },
    { customerId: 'C1', customerCode: 'KH01', customerName: 'Khach 1', type: 'AR-RETURN', debit: 0, credit: 10000, amount: 10000 },
    { customerId: 'C2', customerCode: 'KH02', customerName: 'Khach 2', type: 'AR-SALE', debit: 500, credit: 0, amount: 500 }
  ];
  const legacy = legacyReduceCustomerDebt(ledgerRows);
  const aggregateRows = [{
    _id: { customerId: 'C1', customerCode: 'KH01', customerName: 'Khach 1' },
    debit: 100000,
    credit: 35000,
    receiptAmount: 25000,
    returnAmount: 10000,
    bonusAmount: 0,
    firstDate: '2026-06-01',
    lastDate: '2026-06-01',
    orderCodes: ['SO1']
  }];
  const normalized = normalizeCustomerDebtAggregateRows(aggregateRows, { now: '2026-06-10' });

  assert.equal(normalized.length, legacy.length);
  assert.equal(normalized[0].customerCode, legacy[0].customerCode);
  assert.equal(normalized[0].debit, legacy[0].debit);
  assert.equal(normalized[0].credit, legacy[0].credit);
  assert.equal(normalized[0].debt, legacy[0].debt);
  assert.equal(normalized[0].receiptAmount, legacy[0].receiptAmount);
  assert.equal(normalized[0].returnAmount, legacy[0].returnAmount);
});

test('normalized aggregate customer debt keeps open debt per order for debt allocation UI', () => {
  const normalized = normalizeCustomerDebtAggregateRows([{
    _id: { customerId: 'C1', customerCode: '4501007', customerName: 'Chị Tuyết' },
    debit: 19298808,
    credit: 0,
    receiptAmount: 0,
    returnAmount: 0,
    bonusAmount: 0,
    firstDate: '2026-06-09',
    lastDate: '2026-06-09',
    orders: [{
      orderId: 'SO1',
      orderCode: 'HU90202292',
      documentDate: '2026-06-09',
      debit: 19298808,
      credit: 0,
      receiptAmount: 0,
      returnAmount: 0,
      bonusAmount: 0
    }]
  }], { now: '2026-06-10' });

  assert.equal(normalized[0].debt, 19298808);
  assert.equal(normalized[0].orderCount, 1);
  assert.equal(normalized[0].orders[0].orderCode, 'HU90202292');
  assert.equal(normalized[0].orders[0].debt, 19298808);
  assert.equal(normalized[0].orders[0].status, 'overdue');
});
