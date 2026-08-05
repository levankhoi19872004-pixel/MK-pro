'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const resolver = require('../src/services/delivery/DeliveryPaymentStateReadService');
const ROOT = path.resolve(__dirname, '..');
const ROUTE_SOURCE = fs.readFileSync(path.join(ROOT, 'src/routes/deliveryRoutes.js'), 'utf8');
const ENGINE_SOURCE = [
  'src/engines/delivery.legacy.engine.source/part-01.jsfrag',
  'src/engines/delivery.legacy.engine.source/part-02.jsfrag',
  'src/engines/delivery.legacy.engine.source/part-03.jsfrag'
].map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('');

function loadBindDeliveryUser() {
  const match = ROUTE_SOURCE.match(/function bindDeliveryUser\(input = \{\}, user = \{\}\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'bindDeliveryUser must remain inspectable');
  return Function(`"use strict"; ${match[0]}; return bindDeliveryUser;`)();
}

test('AUTH-001: delivery query remains scoped to assigned delivery staff', () => {
  const bind = loadBindDeliveryUser();
  const query = bind({ includeCompleted: '1' }, { role: 'delivery', staffCode: 'GH-01', fullName: 'Giao hàng 01' });
  assert.equal(query.deliveryStaffCode, 'GH-01');
  assert.equal(query.enforceDeliveryOwnership, true);
  assert.match(ENGINE_SOURCE, /deliveryStaffCode/);
  assert.match(ENGINE_SOURCE, /findOrders\(query/);
});

test('AUTH-002: a delivery user cannot retain another delivery user filter', () => {
  const bind = loadBindDeliveryUser();
  const query = bind({ deliveryStaffCode: 'GH-OTHER', staffCode: 'GH-OTHER' }, { role: 'delivery', staffCode: 'GH-01', fullName: 'Giao hàng 01' });
  assert.equal(query.deliveryStaffCode, 'GH-01');
  assert.equal(query.staffCode, 'GH-01');
  assert.notEqual(query.deliveryStaffCode, 'GH-OTHER');
});

test('AUTH-003: query staff code cannot override token identity', () => {
  const bind = loadBindDeliveryUser();
  const query = bind({ actorStaffCode: 'ATTACKER', deliveryStaffName: 'Other' }, { role: 'delivery', code: 'GH-TOKEN', name: 'Token user' });
  assert.equal(query.actorStaffCode, 'GH-TOKEN');
  assert.equal(query.actorDeliveryStaffCode, 'GH-TOKEN');
  assert.equal(query.deliveryStaffName, 'Token user');
});

for (const [id, role] of [['AUTH-004', 'admin'], ['AUTH-005', 'manager'], ['AUTH-006', 'accountant']]) {
  test(`${id}: ${role} read access is preserved`, () => {
    assert.match(ROUTE_SOURCE, new RegExp(`deliveryReadRoles = requireRole\\(\\[[^\\]]*'${role}'`));
    const bind = loadBindDeliveryUser();
    const query = bind({ deliveryStaffCode: 'GH-01' }, { role });
    assert.equal(query.deliveryStaffCode, 'GH-01');
    assert.equal(query.enforceDeliveryOwnership, undefined);
  });
}

test('AUTH-007: unauthorized roles gain no read access', () => {
  const roleMatch = ROUTE_SOURCE.match(/deliveryReadRoles = requireRole\(\[([^\]]+)\]\)/);
  assert.ok(roleMatch);
  assert.doesNotMatch(roleMatch[1], /'sales'|'warehouse'|'cashier'/);
  assert.match(ROUTE_SOURCE, /router\.get\('\/orders', requireAuth, deliveryReadRoles/);
});

test('AUTH-008: foreign-tenant payment and return candidates are never overlaid', () => {
  const currentOrder = { id: 'SO-1', orderCode: 'B1', tenantId: 'TENANT-A', totalAmount: 10000, cashAmount: 100 };
  const versions = new Map([['SO-1', { id: 'V1', orderId: 'SO-1', orderCode: 'B1', tenantId: 'TENANT-B', closeoutVersion: 1, status: 'accounting_confirmed', originalAmount: 10000, cashAmount: 8000 }]]);
  const allocations = new Map([['SO-1', { allocationCode: 'OPA1', orderId: 'SO-1', orderCode: 'B1', tenantId: 'TENANT-B', sourceVersion: 1, status: 'posted', cashAmount: 9000, receivableAmount: 10000 }]]);
  const returnState = { returnAmount: 0, returnStateSource: 'returnOrders', returnOrderIds: [], diagnostics: [{ code: 'TENANT_MISMATCH_RETURN_EXCLUDED' }] };
  const state = resolver.resolvePaymentStateForOrder(currentOrder, versions, allocations, returnState);
  assert.equal(state.paymentStateSource, 'orders.top-level');
  assert.equal(state.cashAmount, 100);
  assert.ok(state.diagnostics.some((row) => row.code === 'TENANT_MISMATCH_RETURN_EXCLUDED'));
});
