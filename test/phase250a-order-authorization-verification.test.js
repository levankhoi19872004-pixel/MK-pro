'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const orderRoutes = fs.readFileSync(path.join(ROOT, 'src/routes/orderRoutes.js'), 'utf8');
const mobileRoutes = fs.readFileSync(path.join(ROOT, 'src/routes/mobile/sales.routes.js'), 'utf8');
const controllerSource = fs.readFileSync(path.join(ROOT, 'src/controllers/orderController.js'), 'utf8');
const commandSource = fs.readFileSync(path.join(ROOT, 'src/services/sales-order/SalesOrderCommandService.js'), 'utf8');
const deletionSource = fs.readFileSync(path.join(ROOT, 'src/domain/lifecycle/SalesOrderDeletionService.js'), 'utf8');
const { canMutateSalesOrder } = require(path.join(ROOT, 'src/domain/orders/salesOrderMutationPolicy.js'));

test('Track C remediated: web update/cancel/delete routes retain role middleware and add canonical authorization', () => {
  assert.match(orderRoutes, /router\.put\('\/:id', writeOrders, authorizeUpdate, orderController\.update\)/);
  assert.match(orderRoutes, /router\.patch\('\/:id', writeOrders, authorizeUpdate, orderController\.update\)/);
  assert.match(orderRoutes, /router\.post\('\/:id\/cancel', writeOrders, authorizeCancel, orderController\.cancel\)/);
  assert.match(orderRoutes, /router\.post\('\/:id\/delete', writeOrders, authorizeDelete, orderController\.remove\)/);
  assert.match(orderRoutes, /router\.delete\('\/:id', writeOrders, authorizeDelete, orderController\.remove\)/);
});

test('Track C remediated: controller passes actor and pre-authorized order/version to command service', () => {
  assert.match(controllerSource, /actor: req\.user \|\| \{\}/);
  assert.match(controllerSource, /order: beforeOrder/);
  assert.match(controllerSource, /order: req\.salesOrderMutation\?\.order/);
  assert.match(controllerSource, /expectedVersion: req\.salesOrderMutation\?\.expectedVersion/);
});

test('Track C remediated: command and deletion services repeat centralized policy before writers', () => {
  assert.match(commandSource, /canMutateSalesOrder/);
  assert.match(commandSource, /authorizeCommand\('update'/);
  assert.match(commandSource, /authorizeCommand\('cancel'/);
  const authAt = deletionSource.indexOf('const authorization = canMutateSalesOrder');
  const txAt = deletionSource.indexOf('await tx.withMongoTransaction');
  assert.ok(authAt > 0 && txAt > authAt);
});

test('Track C remediated: owner code is enforced for web and mobile aliases', () => {
  const owner = { role: 'sales', salesStaffCode: 'SALES_A' };
  const other = { role: 'sales', salesStaffCode: 'SALES_B' };
  const order = { id: 'O1', salesStaffCode: 'SALES_A', status: 'draft' };
  assert.equal(canMutateSalesOrder({ actor: owner, order, command: 'update' }).allowed, true);
  assert.equal(canMutateSalesOrder({ actor: other, order, command: 'update' }).status, 403);
  assert.match(mobileRoutes, /authorizeUpdate/);
  assert.match(mobileRoutes, /authorizeDelete/);
});
