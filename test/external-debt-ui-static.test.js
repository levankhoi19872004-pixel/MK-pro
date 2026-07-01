'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('legacy external debt modal is no longer mounted in the retired web Debt screen', () => {
  const html = read('public/fragments/index/01-index-body.html') + read('public/fragments/index/03-index-body.html') + read('public/fragments/index/04-index-body.html');
  assert.doesNotMatch(html, /id="openExternalDebtModalButton"/);
  assert.doesNotMatch(html, /id="externalDebtModal"/);
  assert.doesNotMatch(html, /id="externalDebtCustomerSearch"/);
});

test('external debt backend remains available as shared service/API, not as legacy UI', () => {
  const routesIndex = read('src/routes/index.js');
  const route = read('src/routes/externalDebtOrderRoutes.js');
  const controller = read('src/controllers/externalDebtOrderController.js');
  const service = read('src/services/ExternalDebtOrderService.js');
  assert.match(routesIndex, /externalDebtOrderRoutes/);
  assert.match(route, /externalDebtOrderController/);
  assert.match(controller, /ExternalDebtOrderService/);
  assert.match(service, /createExternalDebtOrder/);
});
