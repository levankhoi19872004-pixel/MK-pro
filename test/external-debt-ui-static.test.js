'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('debt web UI exposes create and reload buttons plus mandatory assignee fields', () => {
  const html = read('public/index.html');
  assert.match(html, /id="openExternalDebtModalButton"/);
  assert.match(html, /id="reloadDebtsButton"/);
  assert.match(html, /id="externalDebtModal"/);
  assert.match(html, /id="externalDebtCustomerSearch"/);
  assert.match(html, /id="externalDebtSalesStaffSearch"/);
  assert.match(html, /id="externalDebtDeliveryStaffSearch"/);
  assert.match(html, /id="externalDebtReason"/);
});

test('external debt modal uses unified autocomplete and posts canonical payload', () => {
  const config = read('public/js/search/searchFieldsConfig.js');
  const ui = read('public/js/app/debt/07a-debt-core.js');
  assert.match(config, /key:\s*'externalDebtCustomer'/);
  assert.match(config, /key:\s*'externalDebtSalesStaff'/);
  assert.match(config, /roles:\s*\['sales'\]/);
  assert.match(config, /key:\s*'externalDebtDeliveryStaff'/);
  assert.match(config, /roles:\s*\['delivery'\]/);
  assert.match(ui, /fetch\('\/api\/external-debt-orders'/);
  assert.match(ui, /salesStaffCode/);
  assert.match(ui, /deliveryStaffCode/);
});
