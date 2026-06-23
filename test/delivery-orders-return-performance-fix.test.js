'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function valueMatches(actual, expected) {
  if (expected instanceof RegExp) return expected.test(String(actual || ''));
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (hasOwn(expected, '$in')) return (expected.$in || []).some((value) => valueMatches(actual, value));
    if (hasOwn(expected, '$nin')) return !(expected.$nin || []).some((value) => valueMatches(actual, value));
    if (hasOwn(expected, '$exists')) {
      const exists = actual !== undefined;
      return Boolean(expected.$exists) ? exists : !exists;
    }
    if (hasOwn(expected, '$gt')) return actual > expected.$gt;
    if (hasOwn(expected, '$gte')) return actual >= expected.$gte;
    if (hasOwn(expected, '$lte')) return actual <= expected.$lte;
    if (hasOwn(expected, '$ne')) return actual !== expected.$ne;
    if (hasOwn(expected, '$type')) return expected.$type === 'string' ? typeof actual === 'string' : true;
  }
  return actual === expected;
}

function matches(row = {}, filter = {}) {
  return Object.entries(filter || {}).every(([key, expected]) => {
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
    lean: async () => clone(value),
    exec: async () => clone(value),
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
      calls.push({ op: 'find', filter: clone(filter) });
      return queryResult(rows.filter((row) => matches(row, filter)));
    },
    findOne(filter = {}) {
      calls.push({ op: 'findOne', filter: clone(filter) });
      return queryResult(rows.find((row) => matches(row, filter)) || null);
    }
  };
}

function salesOrder(overrides = {}) {
  return {
    id: overrides.id || 'SO-PENDING',
    code: overrides.code || overrides.id || 'SO-PENDING',
    salesOrderId: overrides.id || 'SO-PENDING',
    salesOrderCode: overrides.code || overrides.id || 'SO-PENDING',
    customerCode: 'C001',
    customerName: 'Khách test giao hàng',
    deliveryDate: '2026-06-23',
    deliveryStaffCode: 'GH01',
    deliveryStaffName: 'Giao hàng 01',
    salesStaffCode: 'BH01',
    salesStaffName: 'Bán hàng 01',
    masterOrderId: 'MO-1',
    totalAmount: 100000,
    debtAmount: 100000,
    cashAmount: 0,
    bankAmount: 0,
    returnAmount: 0,
    status: overrides.status || 'assigned',
    deliveryStatus: overrides.deliveryStatus || 'assigned',
    version: overrides.version ?? 1,
    items: [{ productCode: 'P1', productName: 'SP1', quantity: 1, price: 100000, salePrice: 100000 }],
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-06-23T00:00:00.000Z'
  };
}

function returnOrder(overrides = {}) {
  return {
    id: overrides.id || 'RO-SO-RETURN',
    code: overrides.code || overrides.id || 'RO-SO-RETURN',
    salesOrderId: overrides.salesOrderId || 'SO-RETURN',
    salesOrderCode: overrides.salesOrderCode || 'SO-RETURN',
    orderId: overrides.salesOrderId || 'SO-RETURN',
    orderCode: overrides.salesOrderCode || 'SO-RETURN',
    customerCode: 'C001',
    customerName: 'Khách test giao hàng',
    deliveryDate: '2026-06-23',
    deliveryStaffCode: 'GH01',
    deliveryStaffName: 'Giao hàng 01',
    status: 'active',
    items: [{ productCode: 'P1', productName: 'SP1', returnQty: 1, price: 100000 }],
    totalAmount: 100000,
    createdAt: '2026-06-23T00:00:00.000Z'
  };
}

test('GET /api/delivery/orders default processing list excludes delivered orders after confirm', async () => {
  const SalesOrder = createMemoryModel([
    salesOrder({ id: 'SO-PENDING', status: 'assigned', deliveryStatus: 'assigned' }),
    salesOrder({ id: 'SO-DELIVERED', status: 'delivered', deliveryStatus: 'delivered' })
  ]);
  const ReturnOrder = createMemoryModel([]);
  const { DeliveryEngine } = require('../src/engines/delivery.engine');
  const engine = new DeliveryEngine({ SalesOrder, ReturnOrder, MasterOrder: null, StockTransaction: {}, ArLedger: {}, User: null });

  const result = await engine.listOrders({ date: '2026-06-23', deliveryStaffCode: 'GH01' });

  assert.deepEqual(result.rows.map((row) => row.orderId), ['SO-PENDING']);
  assert.equal(result.rows.some((row) => row.orderId === 'SO-DELIVERED'), false);
  assert.ok(SalesOrder.calls.some((call) => call.op === 'find' && JSON.stringify(call.filter).includes('deliveryStatus')),
    'query phải đẩy điều kiện deliveryStatus xuống Mongo, không chỉ lọc JS sau khi load');
});

test('GET /api/delivery/orders can still show delivered orders when explicitly requested', async () => {
  const SalesOrder = createMemoryModel([
    salesOrder({ id: 'SO-PENDING', status: 'assigned', deliveryStatus: 'assigned' }),
    salesOrder({ id: 'SO-DELIVERED', status: 'delivered', deliveryStatus: 'delivered' })
  ]);
  const ReturnOrder = createMemoryModel([]);
  const { DeliveryEngine } = require('../src/engines/delivery.engine');
  const engine = new DeliveryEngine({ SalesOrder, ReturnOrder, MasterOrder: null, StockTransaction: {}, ArLedger: {}, User: null });

  const delivered = await engine.listOrders({ date: '2026-06-23', deliveryStaffCode: 'GH01', statusFilter: 'delivered' });
  assert.deepEqual(delivered.rows.map((row) => row.orderId), ['SO-DELIVERED']);

  const all = await engine.listOrders({ date: '2026-06-23', deliveryStaffCode: 'GH01', includeCompleted: '1' });
  assert.deepEqual(new Set(all.rows.map((row) => row.orderId)), new Set(['SO-PENDING', 'SO-DELIVERED']));
});

test('GET /api/delivery/returns direct order query no longer falls back to SalesOrder.findOne when no returnOrders exist', async () => {
  const SalesOrder = createMemoryModel([salesOrder({ id: 'SO-NO-RETURN' })]);
  const ReturnOrder = createMemoryModel([]);
  const { DeliveryEngine } = require('../src/engines/delivery.engine');
  const engine = new DeliveryEngine({ SalesOrder, ReturnOrder, MasterOrder: null, StockTransaction: {}, ArLedger: {}, User: null });

  const result = await engine.listReturns({
    orderId: 'SO-NO-RETURN',
    deliveryStaffCode: 'GH01',
    actorDeliveryStaffCode: 'GH01',
    enforceDeliveryOwnership: true
  });

  assert.deepEqual(result.rows, []);
  assert.equal(SalesOrder.calls.some((call) => call.op === 'findOne'), false, 'không được SalesOrder.findOne theo từng đơn chỉ để trả []');
  assert.equal(ReturnOrder.calls.some((call) => call.op === 'find'), true, 'vẫn đọc returnOrders là SSoT');
});

test('GET /api/delivery/returns direct order query flattens returnOrders without SalesOrder.findOne fallback', async () => {
  const SalesOrder = createMemoryModel([salesOrder({ id: 'SO-RETURN' })]);
  const ReturnOrder = createMemoryModel([returnOrder({ salesOrderId: 'SO-RETURN', salesOrderCode: 'SO-RETURN' })]);
  const { DeliveryEngine } = require('../src/engines/delivery.engine');
  const engine = new DeliveryEngine({ SalesOrder, ReturnOrder, MasterOrder: null, StockTransaction: {}, ArLedger: {}, User: null });

  const result = await engine.listReturns({
    orderId: 'SO-RETURN',
    deliveryStaffCode: 'GH01',
    actorDeliveryStaffCode: 'GH01',
    enforceDeliveryOwnership: true
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].salesOrderId, 'SO-RETURN');
  assert.equal(result.rows[0].returnQty, 1);
  assert.equal(SalesOrder.calls.some((call) => call.op === 'findOne'), false, 'returnOrders đã đủ dữ liệu hiển thị, không cần fallback SalesOrder.findOne');
});

test('phase42 index contract keeps delivery list and return lookup indexes explicit', () => {
  const indexSource = fs.readFileSync('src/services/mongoIndexService.js', 'utf8');
  assert.match(indexSource, /idx_orders_delivery_staff_master_id_status/);
  assert.match(indexSource, /idx_orders_delivery_staff_master_code_status/);
  assert.match(indexSource, /uniq_salesOrders_id/);
  assert.match(indexSource, /idx_return_orders_sales_order_id_status/);
  assert.match(indexSource, /idx_return_orders_order_id_status/);
  assert.match(indexSource, /idx_return_orders_delivery_order_id_status/);
});
