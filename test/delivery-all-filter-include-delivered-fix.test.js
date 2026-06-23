'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
  const id = overrides.id || 'SO-PENDING';
  const code = overrides.code || id;
  return {
    id,
    code,
    salesOrderId: id,
    salesOrderCode: code,
    orderCode: code,
    customerCode: overrides.customerCode || 'C001',
    customerName: overrides.customerName || 'Khách test giao hàng',
    deliveryDate: '2026-06-23',
    deliveryStaffCode: 'GH01',
    deliveryStaffName: 'Giao hàng 01',
    salesStaffCode: 'BH01',
    salesStaffName: 'Bán hàng 01',
    masterOrderId: 'MO-1',
    masterOrderCode: 'MO-1',
    totalAmount: overrides.totalAmount ?? 100000,
    debtAmount: overrides.debtAmount ?? 100000,
    cashAmount: overrides.cashAmount ?? 0,
    bankAmount: overrides.bankAmount ?? 0,
    rewardAmount: overrides.rewardAmount ?? 0,
    status: overrides.status || 'assigned',
    deliveryStatus: overrides.deliveryStatus || 'assigned',
    version: overrides.version ?? 1,
    items: [{ productCode: 'P1', productName: 'SP1', quantity: 1, price: 100000, salePrice: 100000 }],
    createdAt: overrides.createdAt || '2026-06-23T00:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-06-23T00:00:00.000Z'
  };
}

function returnOrder(overrides = {}) {
  return {
    id: overrides.id || 'RO-SO-D1',
    code: overrides.code || overrides.id || 'RO-SO-D1',
    salesOrderId: overrides.salesOrderId || 'SO-D1',
    salesOrderCode: overrides.salesOrderCode || 'SO-D1',
    orderId: overrides.salesOrderId || 'SO-D1',
    orderCode: overrides.salesOrderCode || 'SO-D1',
    customerCode: 'C001',
    customerName: 'Khách test giao hàng',
    deliveryDate: '2026-06-23',
    deliveryStaffCode: 'GH01',
    deliveryStaffName: 'Giao hàng 01',
    status: 'active',
    items: [{ productCode: 'P1', productName: 'SP1', returnQty: 1, price: overrides.amount || 16257 }],
    totalAmount: overrides.amount || 16257,
    amount: overrides.amount || 16257,
    totalReturnAmount: overrides.amount || 16257,
    createdAt: '2026-06-23T00:00:00.000Z'
  };
}

function createEngine() {
  const pendingOrders = Array.from({ length: 17 }, (_, index) => salesOrder({
    id: `SO-P${String(index + 1).padStart(2, '0')}`,
    code: `SO-P${String(index + 1).padStart(2, '0')}`,
    status: 'assigned',
    deliveryStatus: 'assigned'
  }));
  const deliveredOrders = [
    salesOrder({ id: 'SO-D1', code: 'SO-D1', status: 'delivered', deliveryStatus: 'delivered', debtAmount: 0 }),
    salesOrder({ id: 'SO-D2', code: 'SO-D2', status: 'delivered', deliveryStatus: 'delivered', debtAmount: 0 })
  ];
  const SalesOrder = createMemoryModel([...pendingOrders, ...deliveredOrders]);
  const ReturnOrder = createMemoryModel([returnOrder({ salesOrderId: 'SO-D1', salesOrderCode: 'SO-D1', amount: 16257 })]);
  const { DeliveryEngine } = require('../src/engines/delivery.engine');
  return new DeliveryEngine({ SalesOrder, ReturnOrder, MasterOrder: null, StockTransaction: {}, ArLedger: {}, User: null });
}

test('phase43 statusFilter=all includes pending and delivered orders in one dataset', async () => {
  const engine = createEngine();

  const result = await engine.listOrders({
    date: '2026-06-23',
    deliveryStaffCode: 'GH01',
    statusFilter: 'all',
    includeDelivered: '1',
    includeCompleted: '1'
  });

  const ids = result.rows.map((row) => row.orderId).sort();
  assert.equal(result.rows.length, 19);
  assert.equal(ids.filter((id) => id.startsWith('SO-P')).length, 17);
  assert.equal(ids.filter((id) => id.startsWith('SO-D')).length, 2);
  assert.equal(result.summary.returnAmount, 16257);
  assert.equal(result.rows.length, ids.length, 'summary cards phải dùng cùng dataset với list');
});

test('phase43 explicit statusFilter=all alone is not treated as the default open list', async () => {
  const engine = createEngine();

  const result = await engine.listOrders({ date: '2026-06-23', deliveryStaffCode: 'GH01', statusFilter: 'all' });

  assert.equal(result.rows.length, 19);
  assert.equal(result.rows.some((row) => row.orderId === 'SO-D1'), true);
  assert.equal(result.summary.returnAmount, 16257);
});

test('phase43 statusFilter=open keeps delivered orders out of the processing list', async () => {
  const engine = createEngine();

  const result = await engine.listOrders({ date: '2026-06-23', deliveryStaffCode: 'GH01', statusFilter: 'open' });

  assert.equal(result.rows.length, 17);
  assert.equal(result.rows.some((row) => row.orderId.startsWith('SO-D')), false);
});

test('phase43 statusFilter=delivered returns only completed delivery orders', async () => {
  const engine = createEngine();

  const result = await engine.listOrders({ date: '2026-06-23', deliveryStaffCode: 'GH01', statusFilter: 'delivered', includeDelivered: '1' });

  assert.deepEqual(result.rows.map((row) => row.orderId).sort(), ['SO-D1', 'SO-D2']);
  assert.equal(result.summary.returnAmount, 16257);
});

test('phase43 default delivery list still excludes delivered orders for phase42 processing behavior', async () => {
  const engine = createEngine();

  const result = await engine.listOrders({ date: '2026-06-23', deliveryStaffCode: 'GH01' });

  assert.equal(result.rows.length, 17);
  assert.equal(result.rows.some((row) => row.orderId.startsWith('SO-D')), false);
});

test('phase43 frontend core sends explicit include flags for all/delivered filters and clears stale flags for open', () => {
  const root = path.resolve(__dirname, '..');
  const core = fs.readFileSync(path.join(root, 'public/js/delivery/delivery-core.js'), 'utf8');
  const mobileView = fs.readFileSync(path.join(root, 'public/mobile/js/delivery-mobile-view.source.js'), 'utf8');
  const webView = fs.readFileSync(path.join(root, 'public/js/delivery/delivery-web-view.source/part-01.jsfrag'), 'utf8');

  assert.match(core, /function normalizeDeliveryOrderFilters/);
  assert.match(core, /filters\.includeCompleted = includeDelivered \? '1' : '0'/);
  assert.match(core, /filters\.includeDelivered = includeDelivered \? '1' : '0'/);
  assert.match(mobileView, /statusFilter: el\('mStatusFilter'\)/);
  assert.match(webView, /statusFilter: byId\('deliveryCoreStatus'\)/);
});

test('phase43 mobile compatibility route accepts the same all/delivered contract', () => {
  const root = path.resolve(__dirname, '..');
  const route = fs.readFileSync(path.join(root, 'src/routes/mobile/delivery.routes.js'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'src/services/mobile/delivery.service.js'), 'utf8');

  assert.match(route, /query\('statusFilter'\)/);
  assert.match(route, /query\('includeDelivered'\)/);
  assert.match(service, /MOBILE_ALL_DELIVERY_STATUS_FILTERS\.includes\(status\)/);
  assert.match(service, /MOBILE_DELIVERED_STATUS_FILTERS\.includes\(status\)/);
  assert.match(service, /MOBILE_OPEN_STATUS_FILTERS\.includes\(status\)/);
});
