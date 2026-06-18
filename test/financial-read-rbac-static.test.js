'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (f) => require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', f));

test('financial books and debt collection administration require business roles', () => {
  const fund = read('src/routes/fundRoutes.js');
  const debt = read('src/routes/debtCollectionRoutes.js');
  const cash = read('src/routes/cashbookRoutes.js');
  const receipt = read('src/routes/receiptRoutes.js');
  assert.match(fund, /const viewFund = requireRole/);
  assert.match(fund, /\/ledger', viewFund/);
  assert.match(debt, /const viewCollections = requireRole/);
  assert.match(debt, /accountCollection/);
  assert.match(cash, /router\.get\('\/', requireRole/);
  assert.match(receipt, /router\.get\('\/', requireRole/);
});

test('web reports and canonical inventory reads are role-gated', () => {
  const reports = read('src/routes/reportRoutes.js');
  const inventory = read('src/routes/inventoryRoutes.js');
  assert.match(reports, /viewBusinessReports/);
  assert.match(reports, /viewStockReports/);
  assert.match(inventory, /router\.get\('\/current', requireRole\(\['admin', 'manager', 'accountant', 'warehouse'\]\)/);
});
