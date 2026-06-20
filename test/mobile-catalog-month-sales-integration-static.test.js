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
  assert.match(source, /source:\s*'mobile-catalog-paged-with-monthly-sales-and-debt'/);
});

test('sales app renders the monthly metric from customer payload', () => {
  const coordinator = require('./helpers/sourceBundle.util').readSource('public/mobile/js/sales.js');
  const customerModule = fs.readFileSync(path.join(ROOT, 'public/mobile/js/sales/customer.js'), 'utf8');
  assert.match(customerModule, /customer\.monthRevenue\s*\?\?\s*customer\.monthSales/);
  assert.match(coordinator, /DS tháng:\s*\$\{money\(customerSalesValue\(customer\)\)\}/);
});
