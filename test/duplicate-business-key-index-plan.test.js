'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { INDEX_DEFINITIONS } = require('../src/services/mongoIndexService');

const root = path.resolve(__dirname, '..');
const audit = fs.readFileSync(path.join(root, 'scripts/audit-duplicate-business-keys.js'), 'utf8');
const migrate = fs.readFileSync(path.join(root, 'scripts/migrate-duplicate-business-keys.js'), 'utf8');

function findIndex(collection, name) {
  return (INDEX_DEFINITIONS[collection] || []).find(([, options]) => options.name === name);
}

test('duplicate audit covers master data and financial business keys', () => {
  for (const target of ['products', 'customers', 'users', 'masterReturnOrders', 'receipts', 'deliveryCashSubmissions', 'expenseVouchers', 'fundTransfers']) {
    assert.ok(audit.includes(`['${target}'`), `missing ${target}`);
  }
  assert.match(audit, /MANUAL_CANONICAL_MERGE_REQUIRED/);
  assert.match(audit, /references/);
});

test('master data duplicate migration never renames product customer or staff codes automatically', () => {
  assert.match(migrate, /MANUAL_MERGE_TARGETS/);
  assert.match(migrate, /products\.code/);
  assert.match(migrate, /customers\.code/);
  assert.match(migrate, /users\.staffCode/);
  assert.match(migrate, /không tự đổi business code/);
});

test('critical business keys have unique indexes and optional keys use partial filters', () => {
  const requiredUnique = [
    ['products', 'uniq_products_code'],
    ['customers', 'uniq_customers_code'],
    ['users', 'uniq_users_username'],
    ['users', 'uniq_users_staff_code'],
    ['masterReturnOrders', 'uniq_master_return_orders_id'],
    ['masterReturnOrders', 'uniq_master_return_orders_code'],
    ['receipts', 'uniq_receipts_id'],
    ['receipts', 'uniq_receipts_code'],
    ['receipts', 'uniq_receipts_import_idempotency'],
    ['deliveryCashSubmissions', 'uniq_delivery_cash_submissions_id'],
    ['expenseVouchers', 'uniq_expense_vouchers_code'],
    ['fundTransfers', 'uniq_fund_transfers_code']
  ];

  for (const [collection, name] of requiredUnique) {
    const index = findIndex(collection, name);
    assert.ok(index, `${collection}.${name} missing`);
    assert.equal(index[1].unique, true);
  }

  for (const [collection, name] of requiredUnique.filter(([, name]) => name !== 'uniq_users_username')) {
    const index = findIndex(collection, name);
    assert.ok(index[1].partialFilterExpression, `${collection}.${name} must be partial`);
  }
});
