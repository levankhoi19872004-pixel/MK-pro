'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const policyPath = path.join(ROOT, 'src/domain/orders/salesOrderMutationPolicy.js');
const middlewarePath = path.join(ROOT, 'src/middlewares/salesOrderMutation.middleware.js');
const commandServicePath = path.join(ROOT, 'src/services/sales-order/SalesOrderCommandService.js');
const orderRoutesPath = path.join(ROOT, 'src/routes/orderRoutes.js');
const mobileRoutesPath = path.join(ROOT, 'src/routes/mobile/sales.routes.js');
const routesIndexPath = path.join(ROOT, 'src/routes/index.js');
const controllerPath = path.join(ROOT, 'src/controllers/orderController.js');
const deletionPath = path.join(ROOT, 'src/domain/lifecycle/SalesOrderDeletionService.js');

const {
  canMutateSalesOrder,
  actorSalesStaffCode,
  orderSalesStaffCode
} = require(policyPath);
const { createSalesOrderMutationMiddleware } = require(middlewarePath);

function editableOrder(overrides = {}) {
  return {
    id: 'ORDER-A',
    code: 'A001',
    salesStaffCode: 'SALES_A',
    status: 'draft',
    version: 3,
    totalAmount: 100,
    ...overrides
  };
}

function actor(role, code, overrides = {}) {
  return { role, salesStaffCode: code, ...overrides };
}

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function expectDenied(input, status, code) {
  const result = canMutateSalesOrder(input);
  assert.equal(result.allowed, false);
  assert.equal(result.status, status);
  assert.equal(result.code, code);
}

test('policy matrix: owner sales may update an editable order', () => {
  const result = canMutateSalesOrder({
    actor: actor('sales', 'sales_a'),
    order: editableOrder(),
    command: 'update'
  });
  assert.equal(result.allowed, true);
  assert.equal(result.status, 200);
  assert.equal(result.actorCode, 'SALES_A');
  assert.equal(result.ownerCode, 'SALES_A');
});

test('policy matrix: cross-owner sales update and cancel are forbidden with 403', () => {
  for (const command of ['update', 'cancel']) {
    expectDenied({
      actor: actor('sales', 'SALES_B'),
      order: editableOrder(),
      command
    }, 403, 'ORDER_OWNERSHIP_FORBIDDEN');
  }
});

test('policy matrix: accounting-confirmed orders block owner update and cancel with 409', () => {
  for (const command of ['update', 'cancel']) {
    expectDenied({
      actor: actor('sales', 'SALES_A'),
      order: editableOrder({ accountingConfirmed: true, accountingStatus: 'confirmed' }),
      command
    }, 409, 'ORDER_ACCOUNTING_LOCKED');
  }
});

test('policy matrix: admin update and accountant cancel follow existing broad role policy', () => {
  const admin = canMutateSalesOrder({ actor: actor('admin'), order: editableOrder(), command: 'update' });
  const accountant = canMutateSalesOrder({ actor: actor('accountant'), order: editableOrder(), command: 'cancel' });
  assert.equal(admin.allowed, true);
  assert.equal(accountant.allowed, true);
});

test('policy matrix: anonymous is 401; missing order is 404; version conflict is 409', () => {
  expectDenied({ actor: null, order: editableOrder(), command: 'update' }, 401, 'AUTH_REQUIRED');
  expectDenied({ actor: actor('sales', 'SALES_A'), order: null, command: 'update' }, 404, 'ORDER_NOT_FOUND');
  expectDenied({ actor: actor('sales', 'SALES_A'), order: editableOrder({ version: 4 }), command: 'update', expectedVersion: 3 }, 409, 'ORDER_VERSION_CONFLICT');
});

test('policy matrix: merged/delivered/closed orders are state conflicts', () => {
  expectDenied({ actor: actor('sales', 'SALES_A'), order: editableOrder({ masterOrderId: 'MO-1' }), command: 'update' }, 409, 'ORDER_ALREADY_MERGED');
  expectDenied({ actor: actor('sales', 'SALES_A'), order: editableOrder({ deliveryStatus: 'delivered' }), command: 'cancel' }, 409, 'ORDER_ACCOUNTING_LOCKED');
  expectDenied({ actor: actor('sales', 'SALES_A'), order: editableOrder({ closeoutStatus: 'closed' }), command: 'update' }, 409, 'ORDER_ACCOUNTING_LOCKED');
});

test('ownership aliases normalize code only and never compare actor/order names', () => {
  assert.equal(actorSalesStaffCode({ salesmanCode: ' 33949 ' }), '33949');
  assert.equal(orderSalesStaffCode({ nvbhCode: ' 33949 ' }), '33949');
  assert.equal(actorSalesStaffCode({ salesStaffName: 'Nguyễn Văn A' }), '');
  assert.equal(orderSalesStaffCode({ salesmanName: 'Nguyễn Văn A' }), '');
  expectDenied({
    actor: { role: 'sales', salesStaffName: 'Nguyễn Văn A' },
    order: editableOrder({ salesStaffCode: '', salesStaffName: 'Nguyễn Văn A' }),
    command: 'update'
  }, 403, 'ORDER_OWNERSHIP_FORBIDDEN');
});

test('middleware blocks cross-owner request before all writer/stock/AR/Fund/audit side effects', async () => {
  const originalOrder = editableOrder();
  const snapshot = structuredClone(originalOrder);
  const effects = { next: 0, order: 0, stock: 0, ar: 0, fund: 0, audit: 0 };
  const middleware = createSalesOrderMutationMiddleware('cancel', {
    findOrder: async () => originalOrder
  });
  const req = {
    params: { id: originalOrder.id },
    body: {},
    headers: {},
    user: actor('sales', 'SALES_B')
  };
  const res = responseRecorder();

  await middleware(req, res, async () => {
    effects.next += 1;
    effects.order += 1;
    effects.stock += 1;
    effects.ar += 1;
    effects.fund += 1;
    effects.audit += 1;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'ORDER_OWNERSHIP_FORBIDDEN');
  assert.deepEqual(effects, { next: 0, order: 0, stock: 0, ar: 0, fund: 0, audit: 0 });
  assert.deepEqual(originalOrder, snapshot);
  assert.equal(req.salesOrderMutation, undefined);
});

test('middleware allows owner and exposes one immutable authorization context to the controller boundary', async () => {
  const order = editableOrder();
  let nextCount = 0;
  const middleware = createSalesOrderMutationMiddleware('update', { findOrder: async () => order });
  const req = {
    params: { id: order.id },
    body: { expectedVersion: 3 },
    headers: {},
    user: actor('sales', 'SALES_A')
  };
  const res = responseRecorder();
  await middleware(req, res, () => { nextCount += 1; });
  assert.equal(nextCount, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(req.salesOrderMutation.order, order);
  assert.equal(req.salesOrderMutation.actor, req.user);
  assert.equal(req.salesOrderMutation.command, 'update');
  assert.equal(req.salesOrderMutation.expectedVersion, 3);
});

function loadCommandService({ order, effects }) {
  const legacy = {
    createOrder: async () => ({}),
    updateVatInvoiceSetting: async () => ({}),
    syncMasterOrderSummary: async () => ({}),
    updateOrder: async () => { effects.update += 1; return { salesOrder: { ...order, updated: true } }; },
    cancelOrder: async () => { effects.cancel += 1; return { salesOrder: { ...order, status: 'cancelled' } }; },
    deleteOrder: async () => { effects.delete += 1; return { salesOrder: { ...order, deleted: true } }; }
  };
  const repository = { findByIdOrCode: async () => order };
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '../orderLegacy.service') return legacy;
    if (request === '../../repositories/orderRepository') return repository;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(commandServicePath)];
    return require(commandServicePath);
  } finally {
    Module._load = originalLoad;
  }
}

test('command service repeats authorization before legacy writer and never invokes writer when denied', async () => {
  const effects = { update: 0, cancel: 0, delete: 0 };
  const service = loadCommandService({ order: editableOrder(), effects });

  const update = await service.updateOrder('ORDER-A', {}, { actor: actor('sales', 'SALES_B') });
  const cancel = await service.cancelOrder('ORDER-A', {}, { actor: actor('sales', 'SALES_B') });
  assert.equal(update.status, 403);
  assert.equal(cancel.status, 403);
  assert.equal(update.code, 'ORDER_OWNERSHIP_FORBIDDEN');
  assert.deepEqual(effects, { update: 0, cancel: 0, delete: 0 });

  const allowed = await service.updateOrder('ORDER-A', {}, { actor: actor('sales', 'SALES_A') });
  assert.equal(allowed.salesOrder.updated, true);
  assert.equal(effects.update, 1);
});

test('canonical web and mobile aliases all register the centralized mutation boundary', () => {
  const orderRoutes = fs.readFileSync(orderRoutesPath, 'utf8');
  const mobileRoutes = fs.readFileSync(mobileRoutesPath, 'utf8');
  const routesIndex = fs.readFileSync(routesIndexPath, 'utf8');

  assert.match(orderRoutes, /router\.put\('\/:id', writeOrders, authorizeUpdate, orderController\.update\)/);
  assert.match(orderRoutes, /router\.patch\('\/:id', writeOrders, authorizeUpdate, orderController\.update\)/);
  assert.match(orderRoutes, /router\.post\('\/:id\/cancel', writeOrders, authorizeCancel, orderController\.cancel\)/);
  assert.match(orderRoutes, /router\.post\('\/:id\/delete', writeOrders, authorizeDelete, orderController\.remove\)/);
  assert.match(orderRoutes, /router\.delete\('\/:id', writeOrders, authorizeDelete, orderController\.remove\)/);
  assert.match(routesIndex, /app\.use\('\/api\/sales-orders', orderRoutes\)/);
  assert.match(routesIndex, /app\.use\('\/api\/orders', orderRoutes\)/);
  assert.match(mobileRoutes, /router\.put\('\/orders\/:id',[\s\S]*authorizeUpdate[\s\S]*controller\.updateOrder\)/);
  assert.match(mobileRoutes, /router\.delete\('\/orders\/:id',[\s\S]*authorizeDelete[\s\S]*controller\.deleteOrder\)/);
});

test('controller passes actor/order/version and maps policy/service status instead of blanket 400', () => {
  const source = fs.readFileSync(controllerPath, 'utf8');
  assert.match(source, /actor: req\.user \|\| \{\}/);
  assert.match(source, /order: beforeOrder/);
  assert.match(source, /expectedVersion: req\.salesOrderMutation\?\.expectedVersion/);
  assert.match(source, /return sendOrderControllerError\(res, err, 'Không sửa được đơn bán'\)/);
  assert.match(source, /return sendOrderControllerError\(res, err, 'Không hủy được đơn bán'\)/);
  assert.match(source, /return res\.status\(result\.status \|\| 400\)/);
});

test('delete authorization runs before transaction, stock reverse and deletion side effects', () => {
  const source = fs.readFileSync(deletionPath, 'utf8');
  const policyAt = source.indexOf('const authorization = canMutateSalesOrder');
  const txAt = source.indexOf('await tx.withMongoTransaction');
  const stockAt = source.indexOf('await InventoryPostingService.reverseMovement');
  const removeAt = source.indexOf('await orderRepository.removeResolved');
  assert.ok(policyAt > 0);
  assert.ok(txAt > policyAt);
  assert.ok(stockAt > policyAt);
  assert.ok(removeAt > policyAt);
});
