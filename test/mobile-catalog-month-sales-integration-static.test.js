'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('modular mobile customer catalog loads and attaches monthly sales metrics', () => {
  const source = require('./helpers/sourceBundle.util').readSource(path.join(ROOT, 'src/services/mobile/catalog.service.js'));
  assert.match(source, /customerMonthlySalesService\.loadMonthlySalesByCustomer\(rawCustomers/);
  assert.match(source, /customerMonthlySalesService\.attachMonthlySales\(rawCustomers/);
  assert.match(source, /source:\s*'mobile-catalog-route-with-monthly-sales'/);
});

test('sales app renders the monthly metric from customer payload', () => {
  const source = require('./helpers/sourceBundle.util').readSource('public/mobile/js/sales.js');
  assert.match(source, /customer\.monthRevenue\s*\?\?\s*customer\.monthSales/);
  assert.match(source, /DS tháng:\s*\$\{money\(customerSalesValue\(customer\)\)\}/);
});
