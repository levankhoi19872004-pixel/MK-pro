'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  customerOwnershipFilterForSalesUser,
  combineFilters,
  CUSTOMER_SALES_NAME_FIELDS
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


test('customer ownership uses names only when no sales staff code exists', () => {
  const coded = customerOwnershipFilterForSalesUser({
    role: 'sales',
    salesStaffCode: '35128',
    salesStaffName: 'Trùng Tên'
  });
  assert.ok(coded.$or.every((row) => !Object.keys(row)[0].toLowerCase().includes('name')));
  assert.ok(coded.$or.some((row) => row.salesStaffCode === '35128'));

  const legacyNameOnly = customerOwnershipFilterForSalesUser({
    role: 'sales',
    salesStaffName: 'Nhân viên cũ'
  });
  assert.ok(legacyNameOnly.$or.some((row) => row.salesStaffName === 'Nhân viên cũ'));
  assert.ok(legacyNameOnly.$or.every((row) => CUSTOMER_SALES_NAME_FIELDS.includes(Object.keys(row)[0])));
});

test('combined catalog filter preserves search and ownership constraints', () => {
  const combined = combineFilters(
    { isActive: { $ne: false }, $or: [{ name: /abc/i }] },
    { $or: [{ salesStaffCode: '35128' }] }
  );
  assert.equal(combined.$and.length, 2);
});

test('mobile catalog blocks delivery customer enumeration and legacy fallback-to-all is removed', () => {
  const modularRoutes = require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '../src/routes/mobile/catalog.routes.js'));
  const service = require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '../src/services/mobile/catalog.service.js'));

  assert.match(modularRoutes, /allowCustomerRead.*\['admin', 'manager', 'accountant', 'sales'\]/);
  assert.doesNotMatch(modularRoutes, /allowCustomerRead.*delivery/);
  assert.match(service, /customerOwnershipFilterForSalesUser\(mobileUser\)/);
  assert.equal(fs.existsSync(path.join(__dirname, '../src/routes/mobileRoutes.js')), false);
  assert.match(service, /customerOwnershipFilterForSalesUser/);
});
