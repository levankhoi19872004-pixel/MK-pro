'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function valueMatches(actual, expected) {
  if (expected instanceof RegExp) return expected.test(String(actual || ''));
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (Object.prototype.hasOwnProperty.call(expected, '$in')) {
      return (expected.$in || []).some((value) => valueMatches(actual, value));
    }
    if (Object.prototype.hasOwnProperty.call(expected, '$nin')) {
      return !(expected.$nin || []).some((value) => valueMatches(actual, value));
    }
    if (Object.prototype.hasOwnProperty.call(expected, '$exists')) {
      const exists = actual !== undefined;
      return Boolean(expected.$exists) ? exists : !exists;
    }
    if (Object.prototype.hasOwnProperty.call(expected, '$ne')) {
      return actual !== expected.$ne;
    }
  }
  return actual === expected;
}

function matches(row = {}, filter = {}) {
  if (!filter) return true;
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return (expected || []).some((child) => matches(row, child));
    if (key === '$and') return (expected || []).every((child) => matches(row, child));
    return valueMatches(row[key], expected);
  });
}

function queryResult(value) {
  return {
    select() { return this; },
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    session() { return this; },
    allowDiskUse() { return this; },
    exec: async () => clone(value),
    lean: async () => clone(value),
    then(resolve, reject) { return Promise.resolve(clone(value)).then(resolve, reject); }
  };
}

function createMemoryModel(initialRows = []) {
  const rows = initialRows.map((row) => clone(row));
  const calls = [];
  return {
    rows,
    calls,
    find(filter = {}) {
      return queryResult(rows.filter((row) => matches(row, filter)));
    },
    findOne(filter = {}) {
      calls.push({ op: 'findOne', filter: clone(filter) });
      return queryResult(rows.find((row) => matches(row, filter)) || null);
    },
    async findOneAndUpdate(filter = {}, update = {}, _options = {}) {
      calls.push({ op: 'findOneAndUpdate', filter: clone(filter), update: clone(update) });
      const row = rows.find((candidate) => matches(candidate, filter));
      if (!row) return null;
      if (update.$set) Object.assign(row, clone(update.$set));
      if (update.$inc) {
        for (const [field, value] of Object.entries(update.$inc)) {
          row[field] = Number(row[field] || 0) + Number(value || 0);
        }
      }
      return clone(row);
    }
  };
}

function salesOrderFixture(overrides = {}) {
  return {
    id: overrides.id || 'SO-PAY-STALENESS',
    code: overrides.code || overrides.id || 'SO-PAY-STALENESS',
    salesOrderId: overrides.salesOrderId || overrides.id || 'SO-PAY-STALENESS',
    salesOrderCode: overrides.salesOrderCode || overrides.code || overrides.id || 'SO-PAY-STALENESS',
    customerCode: 'C-STALENESS',
    customerName: 'Khách kiểm chứng stale payment',
    deliveryDate: '2026-06-23',
    salesStaffCode: 'NVBH01',
    salesStaffName: 'Nhân viên bán hàng 01',
    deliveryStaffCode: 'GH01',
    deliveryStaffName: 'Nhân viên giao hàng 01',
    totalAmount: 5986707,
    cashAmount: 0,
    bankAmount: 0,
    rewardAmount: 0,
    returnAmount: 0,
    deliveryStatus: 'assigned',
    status: 'assigned',
    version: overrides.version ?? 7,
    items: [{ productCode: 'P1', productName: 'Sản phẩm', quantity: 1, price: 5986707, salePrice: 5986707 }],
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T00:00:00.000Z'
  };
}

test('payment then confirm keeps SalesOrder.version in canonical order and does not raise false stale conflict', async () => {
  const SalesOrder = createMemoryModel([salesOrderFixture({ version: 7 })]);
  const ReturnOrder = createMemoryModel([]);
  const { DeliveryEngine } = require('../src/engines/delivery.engine');
  const engine = new DeliveryEngine({ SalesOrder, ReturnOrder, MasterOrder: null, StockTransaction: {}, ArLedger: {}, User: null });
  const actor = {
    actorDeliveryStaffCode: 'GH01',
    actorStaffCode: 'GH01',
    enforceDeliveryOwnership: true,
    deliveryStaffCode: 'GH01',
    deliveryStaffName: 'Nhân viên giao hàng 01'
  };

  const payment = await engine.savePayment({ ...actor, orderId: 'SO-PAY-STALENESS', cashAmount: 5986721 });
  assert.equal(payment.order.version, 8);
  assert.equal(payment.order.amounts.cash, 5986721);
  assert.equal(payment.order.reconciliation.balanced, true, 'thu vượt 14đ vẫn trong tolerance 1.000đ');

  const confirmed = await engine.confirm({ ...actor, orderId: 'SO-PAY-STALENESS', deliveryStatus: 'delivered' });
  assert.equal(confirmed.order.version, 9);
  assert.equal(confirmed.order.status.deliveryStatus, 'delivered');
  assert.equal(SalesOrder.rows[0].version, 9);

  const updateFilters = SalesOrder.calls.filter((call) => call.op === 'findOneAndUpdate').map((call) => JSON.stringify(call.filter));
  assert.match(updateFilters[0], /"version":7/, 'savePayment phải dùng version mới nhất từ canonical SalesOrder');
  assert.match(updateFilters[1], /"version":8/, 'confirm phải reload và dùng version sau savePayment');
});

test('DeliveryEngine order projection includes version for optimistic locking in payment flow', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../src/engines/delivery.legacy.engine.source/part-01.jsfrag'), 'utf8');
  assert.match(source, /DELIVERY_ORDER_SELECT[\s\S]*'updatedAt', 'version'/, 'DeliveryEngine must read SalesOrder.version before versioned updates');
});
