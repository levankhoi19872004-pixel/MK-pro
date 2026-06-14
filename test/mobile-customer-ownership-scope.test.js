'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  customerOwnershipFilterForSalesUser,
  combineFilters
} = require('../src/domain/staff/customerOwnership');

test('sales customer ownership filter uses business staff identity and never returns unscoped filter', () => {
  const filter = customerOwnershipFilterForSalesUser({
    role: 'sales',
    code: '35128',
    fullName: 'Nguyễn Thị Thùy'
  });
  assert.ok(Array.isArray(filter.$or));
  assert.ok(filter.$or.some((row) => row.salesStaffCode === '35128'));
  assert.ok(filter.$or.some((row) => row.staffCode === '35128'));

  const missingIdentity = customerOwnershipFilterForSalesUser({ role: 'sales' });
  assert.deepEqual(missingIdentity, { _id: { $exists: false } });
});

test('combined catalog filter preserves search and ownership constraints', () => {
  const combined = combineFilters(
    { isActive: { $ne: false }, $or: [{ name: /abc/i }] },
    { $or: [{ salesStaffCode: '35128' }] }
  );
  assert.equal(combined.$and.length, 2);
});

test('mobile catalog blocks delivery customer enumeration and legacy fallback-to-all is removed', () => {
  const modularRoutes = fs.readFileSync(path.join(__dirname, '../src/routes/mobile/catalog.routes.js'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, '../src/services/mobile/catalog.service.js'), 'utf8');

  assert.match(modularRoutes, /allowCustomerRead.*\['admin', 'manager', 'accountant', 'sales'\]/);
  assert.doesNotMatch(modularRoutes, /allowCustomerRead.*delivery/);
  assert.match(service, /customerOwnershipFilterForSalesUser\(mobileUser\)/);
  assert.equal(fs.existsSync(path.join(__dirname, '../src/routes/mobileRoutes.js')), false);
  assert.match(service, /customerOwnershipFilterForSalesUser/);
});
