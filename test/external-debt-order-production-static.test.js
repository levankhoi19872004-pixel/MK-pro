'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('external debt order stores one order and one AR row with both assignees', () => {
  const model = read('src/models/ExternalDebtOrder.js');
  const service = read('src/services/ExternalDebtOrderService.js');
  const routes = read('src/routes/externalDebtOrderRoutes.js');
  const routeIndex = read('src/routes/index.js');

  for (const field of ['salesStaffCode', 'salesStaffName', 'deliveryStaffCode', 'deliveryStaffName']) {
    assert.match(model, new RegExp(field));
    assert.match(service, new RegExp(field));
  }

  assert.match(service, /orderType:\s*'external_debt'/);
  assert.match(service, /orderName:\s*'Nợ ngoài luồng bán hàng'/);
  assert.match(service, /type:\s*'ar_external_debt'/);
  assert.match(service, /code:\s*`AR-EXTERNAL-/);
  assert.match(service, /role,?\s*isActive|role,/);
  assert.match(service, /staffCodeFilter\(salesStaffCode, 'sales'\)/);
  assert.match(service, /staffCodeFilter\(deliveryStaffCode, 'delivery'\)/);
  assert.match(service, /ArPostingService\.postExternalDebt/);
  assert.doesNotMatch(service, /paymentRepository\.upsert/);
  assert.match(routes, /body\('salesStaffCode'\).*notEmpty/s);
  assert.match(routes, /body\('deliveryStaffCode'\).*notEmpty/s);
  assert.match(routeIndex, /app\.use\('\/api\/external-debt-orders'/);
});

test('external debt creation does not trust staff names from frontend', () => {
  const service = read('src/services/ExternalDebtOrderService.js');
  assert.match(service, /salesStaffName:\s*salesStaff\.name/);
  assert.match(service, /deliveryStaffName:\s*deliveryStaff\.name/);
  assert.doesNotMatch(service, /salesStaffName:\s*text\(body\.salesStaffName/);
  assert.doesNotMatch(service, /deliveryStaffName:\s*text\(body\.deliveryStaffName/);
});


test('external debt web API is accounting guarded', () => {
  const source = read('src/routes/externalDebtOrderRoutes.js');
  assert.match(source, /requireRole\(\['admin', 'accountant'\]\)/);
  assert.match(source, /requireRole\(\['admin', 'accountant', 'manager'\]\)/);
});
