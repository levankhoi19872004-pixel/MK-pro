'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('modular mobile customer catalog loads and attaches monthly sales metrics', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/mobile/catalog.service.js'), 'utf8');
  assert.match(source, /customerMonthlySalesService\.loadMonthlySalesByCustomer\(rawCustomers/);
  assert.match(source, /customerMonthlySalesService\.attachMonthlySales\(rawCustomers/);
  assert.match(source, /source:\s*'mobile-catalog-route-with-monthly-sales'/);
});

test('sales app renders the monthly metric from customer payload', () => {
  const source = fs.readFileSync(path.join(ROOT, 'public/mobile/js/sales.js'), 'utf8');
  assert.match(source, /customer\.monthRevenue\s*\?\?\s*customer\.monthSales/);
  assert.match(source, /DS tháng:\s*\$\{money\(customerSalesValue\(customer\)\)\}/);
});
