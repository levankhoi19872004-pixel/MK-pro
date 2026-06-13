'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const SalesOrder = require('../src/models/SalesOrder');
const ReturnOrder = require('../src/models/ReturnOrder');
const MobileLog = require('../src/models/MobileLog');
const IdempotencyRequest = require('../src/models/IdempotencyRequest');
const { createMobileDeliveryService } = require('../src/services/mobile/delivery.service');

function patch(target, replacements) {
  const originals = {};
  for (const [key, value] of Object.entries(replacements)) {
    originals[key] = target[key];
    target[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(originals)) target[key] = value;
  };
}

function queryResult(value) {
  return {
    session() { return this; },
    lean: async () => (typeof value === 'function' ? value() : value)
  };
}

function makeContext() {
  return {
    getPrimaryDataSnapshot: async () => { throw new Error('confirmDelivery must not read primary snapshot'); },
    persistPrimaryDataSnapshot: async () => { throw new Error('confirmDelivery must not persist primary snapshot'); },
    normalizeText: (value) => String(value || '').trim().toLowerCase(),
    toNumber: (value) => Number(value || 0),
    buildDebtLedgerRows: () => [],
    getOrderDeliveryDate: () => '',
    isOrderApprovedForDelivery: () => true,
    getOrderDeliveryInfo: () => ({}),
    isOrderAssignedToDeliveryUser: () => true,
    buildDeliveryOrderRow: (order) => order,
    isDeliveryOrderActive: () => true,
    createReceiptDocument: () => ({}),
    auditLog: () => {},
    writeMobileLog: () => {},
    writeMobileLogDirect: async (user, action, meta, options) => MobileLog.create([{ id: 'ML-1', action, ...meta }], options),
    buildReturnItemsFromRequest: (order) => order.items || [],
    createReturnOrderDocument: () => ({}),
    makeId: () => 'ID-1',
    buildCashCode: () => 'CB-1',
    findCustomer: () => null
  };
}

function baseOrder() {
  return {
    id: 'SO-1',
    code: 'SO-1',
    salesOrderId: 'SO-1',
    salesOrderCode: 'SO-1',
    deliveryStaffCode: 'NVGH-01',
    deliveryStaffName: 'Giao hàng 01',
    deliveryDate: '2026-06-13',
    status: 'assigned',
    deliveryStatus: 'assigned',
    totalAmount: 100000,
    paidAmount: 0,
    debtAmount: 100000,
    items: [{ productCode: 'P1', productName: 'SP 1', quantity: 1, price: 100000 }]
  };
}

test('mobile confirm persists the canonical sales order and never reports snapshot-only success', async () => {
  const stored = baseOrder();
  const logs = [];
  const idem = new Map();
  const restoreSession = patch(mongoose, {
    startSession: async () => ({
      withTransaction: async (work) => work(),
      endSession: async () => {}
    })
  });
  const restoreSales = patch(SalesOrder, {
    findOne: () => queryResult(() => ({ ...stored })),
    findOneAndUpdate: async (filter, update) => {
      Object.assign(stored, update.$set || {});
      return { ...stored };
    }
  });
  const restoreReturns = patch(ReturnOrder, {
    find: () => queryResult([])
  });
  const restoreLogs = patch(MobileLog, {
    create: async (rows) => { logs.push(...rows); return rows; }
  });
  const restoreIdempotency = patch(IdempotencyRequest, {
    findOne: (filter) => queryResult(() => idem.get(filter.key) || null),
    create: async (rows) => { rows.forEach((row) => idem.set(row.key, { ...row })); return rows; },
    updateOne: async (filter, update) => { Object.assign(idem.get(filter.key), update.$set || {}); return { modifiedCount: 1 }; }
  });

  try {
    const service = createMobileDeliveryService(makeContext());
    const response = await service.confirmDelivery({
      body: { orderId: 'SO-1', status: 'success', idempotencyKey: 'confirm-so-1' },
      mobileUser: { id: 'U1', code: 'NVGH-01', name: 'Giao hàng 01', role: 'delivery' }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.order.deliveryStatus, 'delivered');
    assert.equal(stored.deliveryStatus, 'delivered');
    assert.equal(stored.status, 'delivered');
    assert.equal(logs.length, 1);
  } finally {
    restoreIdempotency();
    restoreLogs();
    restoreReturns();
    restoreSales();
    restoreSession();
  }
});

test('mobile confirm rejects an order assigned to another delivery staff', async () => {
  const stored = baseOrder();
  let updateCount = 0;
  const idem = new Map();
  const restoreSession = patch(mongoose, {
    startSession: async () => ({
      withTransaction: async (work) => work(),
      endSession: async () => {}
    })
  });
  const restoreSales = patch(SalesOrder, {
    findOne: () => queryResult(() => ({ ...stored })),
    findOneAndUpdate: async () => { updateCount += 1; return { ...stored }; }
  });
  const restoreReturns = patch(ReturnOrder, {
    find: () => queryResult([])
  });
  const restoreIdempotency = patch(IdempotencyRequest, {
    findOne: (filter) => queryResult(() => idem.get(filter.key) || null),
    create: async (rows) => { rows.forEach((row) => idem.set(row.key, { ...row })); return rows; },
    updateOne: async () => ({ modifiedCount: 1 })
  });

  try {
    const service = createMobileDeliveryService(makeContext());
    const response = await service.confirmDelivery({
      body: { orderId: 'SO-1', status: 'success', idempotencyKey: 'confirm-so-1-other' },
      mobileUser: { id: 'U2', code: 'NVGH-02', name: 'Giao hàng 02', role: 'delivery' }
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 'DELIVERY_ORDER_FORBIDDEN');
    assert.equal(updateCount, 0);
    assert.equal(stored.deliveryStatus, 'assigned');
  } finally {
    restoreIdempotency();
    restoreReturns();
    restoreSales();
    restoreSession();
  }
});
