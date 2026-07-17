'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

const {
  resolveDeliveryAccountingLockState,
  assertReturnMutationAllowed
} = require('../src/domain/returns/ReturnMutationGuard');
const returnOrderRepository = require('../src/repositories/returnOrderRepository');
const orderRepository = require('../src/repositories/orderRepository');
const DeliveryCloseoutVersion = require('../src/models/DeliveryCloseoutVersion');
const OrderPaymentAllocation = require('../src/models/OrderPaymentAllocation');
const AdminCorrectionRequest = require('../src/models/AdminCorrectionRequest');
const StockTransaction = require('../src/models/StockTransaction');
const InventoryPostingService = require('../src/domain/posting/InventoryPostingService');
const OrderPaymentAllocationService = require('../src/services/accounting/OrderPaymentAllocationService');
const auditService = require('../src/services/auditService');
const ReturnCorrectionRequestService = require('../src/services/returns/ReturnCorrectionRequestService');
const returnOrderService = require('../src/services/returnOrderLegacy.service');

function patch(object, key, value) {
  const old = object[key];
  object[key] = value;
  return () => { object[key] = old; };
}

function queryResult(value) {
  return {
    sort() { return this; },
    limit() { return this; },
    session() { return this; },
    select() { return this; },
    lean: async () => value
  };
}

function installFakeTransaction(t) {
  t.after(patch(mongoose, 'startSession', async () => ({
    async withTransaction(work) { return work({ id: 'fake-session' }); },
    async endSession() {}
  })));
  t.after(patch(auditService, 'log', async () => null));
  t.after(patch(auditService, 'record', async () => null));
}

test('Phase260B-R1 resolver locks canonical accounting statuses', () => {
  for (const status of ['confirmed', 'posted', 'locked', 'accounting_confirmed']) {
    assert.equal(resolveDeliveryAccountingLockState({ order: { accountingStatus: status } }).locked, true, status);
  }
  assert.equal(resolveDeliveryAccountingLockState({ order: { deliveryCloseout: { status: 'corrected_confirmed' } } }).locked, true);
  assert.equal(resolveDeliveryAccountingLockState({ order: {}, allocation: { status: 'posted' } }).locked, true);
  assert.equal(resolveDeliveryAccountingLockState({ order: { accountingStatus: 'pending' }, allocation: { status: 'draft' } }).locked, false);
});

test('Phase260B-R1 updateReturnDraftItems writer returns 409 and does not upsert when parent order is locked', async (t) => {
  let upsertCalled = false;
  t.after(patch(returnOrderRepository, 'findByIdOrCode', async () => ({
    id: 'RO1',
    code: 'RO-B001',
    salesOrderId: 'SO1',
    salesOrderCode: 'B001',
    items: [{ productCode: 'P1', returnQty: 1, price: 10, soldQty: 5 }]
  })));
  t.after(patch(orderRepository, 'findByIdOrCode', async () => ({ id: 'SO1', code: 'B001', accountingStatus: 'posted' })));
  t.after(patch(returnOrderRepository, 'upsert', async () => { upsertCalled = true; }));
  t.after(patch(DeliveryCloseoutVersion, 'findOne', () => queryResult(null)));
  t.after(patch(OrderPaymentAllocation, 'findOne', () => queryResult(null)));

  const result = await returnOrderService.updateReturnDraftItems('RO1', { items: [{ productCode: 'P1', returnQty: 2 }] });
  assert.equal(result.status, 409);
  assert.equal(result.code, 'DELIVERY_RETURN_LOCKED_AFTER_ACCOUNTING_CLOSEOUT');
  assert.equal(upsertCalled, false);
});

test('Phase260B-R1 warehouse projection lock blocks ready_to_stock_in and stockPosted objects', () => {
  assert.throws(() => assertReturnMutationAllowed({
    order: { id: 'SO2', code: 'B002' },
    returnOrder: { id: 'RO2', code: 'RO-B002', stockInStatus: 'ready_to_stock_in' },
    operation: 'update_return_items'
  }), { code: 'RETURN_ORDER_WAREHOUSE_VERIFICATION_LOCKED' });
  assert.throws(() => assertReturnMutationAllowed({
    order: { id: 'SO3', code: 'B003' },
    returnOrder: { id: 'RO3', code: 'RO-B003', stockPosted: true },
    operation: 'update_return_items'
  }), { code: 'RETURN_ORDER_WAREHOUSE_VERIFICATION_LOCKED' });
});

test('Phase260B-R1 correction lifecycle approve then apply creates inactive reset version without stock reversal when unposted', async (t) => {
  installFakeTransaction(t);
  const requests = new Map();
  const returnOrders = new Map();
  const original = {
    id: 'RO-OLD',
    code: 'RO-B100',
    salesOrderId: 'SO100',
    salesOrderCode: 'B100',
    version: 3,
    updatedAt: '2026-07-16T00:00:00.000Z',
    items: [{ productCode: 'P1', returnQty: 1, price: 100, soldQty: 3 }],
    stockPosted: false,
    inventoryPosted: false
  };
  returnOrders.set(original.id, original);
  const request = {
    id: 'RCR-1',
    correctionCode: 'RCR-1',
    entityType: 'returnOrder',
    entityId: original.id,
    entityCode: original.code,
    status: 'pending_approval',
    requestedBy: { username: 'maker', role: 'accountant' },
    reason: 'correct return',
    beforeSnapshot: { updatedAt: original.updatedAt },
    proposedPatch: { correctedReturnItems: [{ productCode: 'P1', returnQty: 2, price: 100 }] },
    metadata: { expectedVersion: '3', warehouseLock: { stockPosted: false, inventoryPosted: false } }
  };
  requests.set(request.id, request);
  let reversalCalled = false;

  t.after(patch(AdminCorrectionRequest, 'findOne', () => queryResult(requests.get('RCR-1'))));
  t.after(patch(AdminCorrectionRequest, 'findOneAndUpdate', (filter, update) => {
    const current = requests.get('RCR-1');
    const next = { ...current, ...(update.$set || {}) };
    requests.set('RCR-1', next);
    return queryResult(next);
  }));
  t.after(patch(returnOrderRepository, 'findByIdOrCode', async (id) => returnOrders.get(id) || [...returnOrders.values()].find((row) => row.code === id) || null));
  t.after(patch(returnOrderRepository, 'upsert', async (row) => { returnOrders.set(row.id, row); return row; }));
  t.after(patch(InventoryPostingService, 'reverseMovement', async () => { reversalCalled = true; return []; }));
  t.after(patch(StockTransaction, 'find', () => queryResult([])));

  const approved = await ReturnCorrectionRequestService.approveRequest('RCR-1', {}, { username: 'approver', role: 'accountant' });
  assert.equal(approved.status, 'approved');
  const applied = await ReturnCorrectionRequestService.applyRequest('RCR-1', {}, { username: 'approver', role: 'accountant' });
  assert.equal(applied.status, 'waiting_warehouse_recheck');
  assert.equal(reversalCalled, false);
  const newVersion = [...returnOrders.values()].find((row) => row.createdFromCorrection);
  assert.ok(newVersion, 'new correction version must be created');
  assert.equal(newVersion.previousVersionId, original.id);
  assert.equal(newVersion.isCurrentVersion, false);
  assert.equal(newVersion.active, false);
  assert.equal(newVersion.warehouseCheckStatus, 'pending');
  assert.equal(newVersion.stockPosted, false);
  assert.equal(original.items[0].returnQty, 1);
});

test('Phase260B-R1 posted correction apply creates one idempotent reversal set on retry', async (t) => {
  installFakeTransaction(t);
  const requests = new Map();
  const returnOrders = new Map();
  const original = {
    id: 'RO-POSTED',
    code: 'RO-B200',
    salesOrderId: 'SO200',
    salesOrderCode: 'B200',
    version: 1,
    updatedAt: '2026-07-16T00:00:00.000Z',
    items: [{ productCode: 'P1', returnQty: 1, price: 100 }],
    stockPosted: true,
    stockTransactionId: 'ST-1',
    stockTransactionIds: ['ST-1']
  };
  returnOrders.set(original.id, original);
  const request = {
    id: 'RCR-2',
    correctionCode: 'RCR-2',
    entityId: original.id,
    entityCode: original.code,
    status: 'approved',
    requestedBy: { username: 'maker', role: 'accountant' },
    reason: 'correct posted return',
    beforeSnapshot: { updatedAt: original.updatedAt },
    proposedPatch: { correctedReturnItems: [{ productCode: 'P1', returnQty: 2, price: 100 }] },
    metadata: { expectedVersion: '1' }
  };
  requests.set(request.id, request);
  let reversalCalls = 0;
  const reversalRows = [{ id: 'ST-REV-1', refId: 'RETURN-CORRECTION:RO-POSTED:RCR-2:REVERSE_STOCK', reversedFrom: 'ST-1' }];

  t.after(patch(AdminCorrectionRequest, 'findOne', () => queryResult(requests.get('RCR-2'))));
  t.after(patch(AdminCorrectionRequest, 'findOneAndUpdate', (filter, update) => {
    const current = requests.get('RCR-2');
    const next = { ...current, ...(update.$set || {}) };
    requests.set('RCR-2', next);
    return queryResult(next);
  }));
  t.after(patch(returnOrderRepository, 'findByIdOrCode', async (id) => returnOrders.get(id) || [...returnOrders.values()].find((row) => row.code === id) || null));
  t.after(patch(returnOrderRepository, 'upsert', async (row) => { returnOrders.set(row.id, row); return row; }));
  t.after(patch(StockTransaction, 'find', (filter) => {
    if (filter && filter.refId === reversalRows[0].refId && reversalCalls > 0) return queryResult(reversalRows);
    return queryResult([]);
  }));
  t.after(patch(InventoryPostingService, 'reverseMovement', async () => { reversalCalls += 1; return reversalRows; }));

  const first = await ReturnCorrectionRequestService.applyRequest('RCR-2', {}, { username: 'acc', role: 'accountant' });
  assert.equal(first.status, 'waiting_warehouse_recheck');
  requests.set('RCR-2', { ...request, status: 'approved' });
  const second = await ReturnCorrectionRequestService.applyRequest('RCR-2', {}, { username: 'acc', role: 'accountant' });
  assert.equal(second.status, 'waiting_warehouse_recheck');
  assert.equal(reversalCalls, 1);
});

test('Phase260B-R1 accounting finalize requires stock repost and syncs allocation only at final step', async (t) => {
  installFakeTransaction(t);
  const request = {
    id: 'RCR-3',
    correctionCode: 'RCR-3',
    entityId: 'RO-OLD',
    entityCode: 'RO-OLD',
    status: 'waiting_accounting_finalize',
    metadata: {
      oldReturnOrderVersion: { id: 'RO-OLD' },
      newReturnOrderVersion: { id: 'RO-NEW' }
    },
    reason: 'finalize'
  };
  let allocationSynced = false;
  t.after(patch(AdminCorrectionRequest, 'findOne', () => queryResult(request)));
  t.after(patch(AdminCorrectionRequest, 'findOneAndUpdate', (filter, update) => queryResult({ ...request, ...(update.$set || {}) })));
  t.after(patch(returnOrderRepository, 'findByIdOrCode', async (id) => {
    if (id === 'RO-NEW') return { id: 'RO-NEW', code: 'RO-NEW', salesOrderId: 'SO1', salesOrderCode: 'B1', totalAmount: 200, stockPosted: true };
    if (id === 'RO-OLD') return { id: 'RO-OLD', code: 'RO-OLD', items: [{ productCode: 'P1', returnQty: 1 }] };
    return null;
  }));
  t.after(patch(returnOrderRepository, 'upsert', async (row) => row));
  t.after(patch(orderRepository, 'findByIdOrCode', async () => ({ id: 'SO1', code: 'B1', customerCode: 'C1', receivableAmount: 1000 })));
  t.after(patch(DeliveryCloseoutVersion, 'findOne', () => queryResult({ id: 'DCOV1', code: 'DCOV1', closeoutVersion: 1, status: 'confirmed', returnAmount: 100 })));
  t.after(patch(DeliveryCloseoutVersion, 'findOneAndUpdate', () => queryResult({ id: 'DCOV2', code: 'DCOV2', closeoutVersion: 2 })));
  t.after(patch(OrderPaymentAllocationService, 'buildAndPostFromCloseout', async () => {
    allocationSynced = true;
    return { allocation: { allocationCode: 'OPA1', idempotencyKey: 'OPA1' } };
  }));

  const result = await ReturnCorrectionRequestService.accountingFinalize('RCR-3', {}, { username: 'acc', role: 'accountant' });
  assert.equal(result.status, 'applied');
  assert.equal(allocationSynced, true);
});
