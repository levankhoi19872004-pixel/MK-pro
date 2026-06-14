'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

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

test('orderService locks sales staff code filter to canonical indexed field', () => {
  const source = read('src/services/orderLegacy.service.js');
  const match = source.match(/const staffCodeFilter = extractStaffCodeParam\([\s\S]*?const deliveryStaffCodeFilter = extractStaffCodeParam/);
  assert.ok(match, 'listOrders staff block must exist');

  const block = match[0];
  assert.match(block, /filter\.salesStaffCode = staffCodeFilter/);
  assert.doesNotMatch(block, /salesPersonCode: \{ \$in:/);
  assert.doesNotMatch(block, /salesmanCode: \{ \$in:/);
  assert.doesNotMatch(block, /nvbhCode: \{ \$in:/);
  assert.doesNotMatch(block, /maNVBH: \{ \$in:/);
  assert.doesNotMatch(block, /'salesStaff\.code': \{ \$in:/);

  const codeBranch = block.match(/if \(staffCodeFilter\) \{[\s\S]*?\n\s*\} else if \(staffTextFilter\)/);
  assert.ok(codeBranch, 'staffCodeFilter branch must be explicit');
  assert.doesNotMatch(codeBranch[0], /staffRx/);
  assert.doesNotMatch(codeBranch[0], /salesStaffName: staffRx/);
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

  assert.match(source, /salesStaffCode: order\.salesStaffCode \|\| order\.salesPersonCode \|\| order\.salesmanCode \|\| order\.nvbhCode \|\| order\.maNVBH \|\| ''/);
  assert.match(source, /salesStaffName: order\.salesStaffName \|\| order\.salesPersonName \|\| order\.salesmanName \|\| order\.nvbhName \|\| order\.maNVBHName \|\| ''/);
});
