'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('sales orders UI sends staff name only when staff code is absent', () => {
  const source = read('public/js/app/05-sales-orders.js');

  assert.match(source, /const staffCodeFilter=getSalesOrderStaffFilterCode\(\);/);
  assert.match(source, /const staffTextFilter=getSalesOrderStaffFilterName\(\);/);
  assert.match(source, /if\(staffCodeFilter\)\{/);
  assert.match(source, /params\.set\('salesStaffCode',staffCodeFilter\)/);
  assert.match(source, /params\.set\('includeStaffAliases','1'\)/);
  assert.match(source, /else if\(staffTextFilter\)\{/);
  assert.match(source, /params\.set\('salesStaffName',staffTextFilter\)/);

  const fn = source.match(/function buildSalesOrderSearchParams\(page = 1\)\{[\s\S]*?\n\}/);
  assert.ok(fn, 'buildSalesOrderSearchParams must exist');
  const codeBranch = fn[0].match(/if\(staffCodeFilter\)\{[\s\S]*?\n\s*\} else if\(staffTextFilter\)/);
  assert.ok(codeBranch, 'staffCodeFilter branch must be followed by else-if text fallback');
  assert.doesNotMatch(
    codeBranch[0],
    /params\.set\('salesStaffName',staffTextFilter\)/,
    'salesStaffName must not be sent inside staffCodeFilter branch'
  );
});

test('order search applies exact NVBH aliases in Mongo before skip/limit', () => {
  const source = read('src/services/orderLegacy.service.js');

  assert.match(source, /const SALES_ORDER_SEARCH_STAFF_CODE_FIELDS = \[[\s\S]*?'salesStaffCode'[\s\S]*?'salesPersonCode'[\s\S]*?'salesmanCode'[\s\S]*?'nvbhCode'[\s\S]*?'maNVBH'[\s\S]*?'salesStaff\.code'[\s\S]*?\];/);
  assert.match(source, /guardedQuery\.includeStaffAliases/);
  assert.match(source, /buildStrictSalesStaffCodeClause\(strictSalesStaffCode, \{[\s\S]*?includeAliases: includeStaffAliases/);
  assert.match(source, /SALES_ORDER_SEARCH_STAFF_CODE_FIELDS\.flatMap/);
  assert.match(source, /buildExactCodeFieldClauses\(field, normalized\)/);

  const searchFn = source.match(/async function searchOrders\(query = \{\}\) \{[\s\S]*?\n\}/);
  assert.ok(searchFn, 'searchOrders must exist');
  assert.match(searchFn[0], /buildOrderSearchFilter\(query\)/);
  assert.match(searchFn[0], /skip: page\.skip/);
  assert.match(searchFn[0], /limit: page\.limit/);
  assert.doesNotMatch(searchFn[0], /filter\([^)]*orderMatchesStrictSalesStaffCode/);
});

test('sales order schema declares every NVBH query path under strictQuery', () => {
  const source = read('src/models/SalesOrder.js');

  for (const field of [
    'salesStaffCode',
    'salesPersonCode',
    'salesmanCode',
    'nvbhCode',
    'maNVBH',
    'salesStaff'
  ]) {
    assert.match(source, new RegExp(`\\b${field}\\s*:`), `SalesOrder schema must declare ${field}`);
  }
});

test('sales order list projection and client mapping preserve NVBH aliases', () => {
  const source = read('src/services/orderLegacy.service.js');

  for (const field of [
    'salesPersonCode',
    'salesPersonName',
    'salesmanCode',
    'salesmanName',
    'nvbhCode',
    'nvbhName',
    'maNVBH',
    'maNVBHName'
  ]) {
    assert.match(source, new RegExp(`${field}: 1`), `ORDER_LIST_PROJECTION must include ${field}`);
  }

  assert.match(source, /function toVisibleSalesStaffCode\(order = \{\}\)/);
  assert.match(source, /salesStaffCode: toVisibleSalesStaffCode\(order\)/);
  assert.match(source, /salesStaffName: toVisibleSalesStaffName\(order\)/);
});

test('browser guard cannot disable pagination after one mismatched page', () => {
  const source = read('public/js/app/05-sales-orders.js');
  assert.match(source, /salesOrderHasMore=Boolean\(json\.hasMore\);/);
  assert.doesNotMatch(source, /salesOrderHasMore=Boolean\(json\.hasMore\)\s*&&\s*removedByClientGuard===0/);
});
