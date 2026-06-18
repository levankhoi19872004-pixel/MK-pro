'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  canonicalizeOperationalStaff,
  LEGACY_OPERATIONAL_STAFF_FIELDS
} = require('../src/utils/canonicalStaffWrite.util');

test('canonical staff writer converts aliases and removes operational legacy fields', () => {
  const row = canonicalizeOperationalStaff({
    salesmanCode: 'S001',
    salesmanName: 'Sale One',
    shipperCode: 'D001',
    shipperName: 'Delivery One',
    staffCode: 'AUDIT-KEEP',
    allocations: [{ nvbhCode: 'S002', nvghCode: 'D002' }]
  });

  assert.equal(row.salesStaffCode, 'S001');
  assert.equal(row.salesStaffName, 'Sale One');
  assert.equal(row.deliveryStaffCode, 'D001');
  assert.equal(row.deliveryStaffName, 'Delivery One');
  assert.equal(row.staffCode, 'AUDIT-KEEP');
  for (const field of LEGACY_OPERATIONAL_STAFF_FIELDS) assert.equal(Object.hasOwn(row, field), false);
  assert.equal(row.allocations[0].salesStaffCode, 'S002');
  assert.equal(row.allocations[0].deliveryStaffCode, 'D002');
});

test('canonical repositories normalize staff before operational writes', () => {
  const files = [
    'src/repositories/orderRepository.js',
    'src/repositories/masterOrderRepository.js',
    'src/repositories/returnOrderRepository.js',
    'src/repositories/masterReturnOrderRepository.js',
    'src/repositories/paymentRepository.js',
    'src/repositories/receiptRepository.js'
  ];
  for (const file of files) {
    const source = require('./helpers/sourceBundle.util').readSource(file);
    assert.match(source, /canonicalizeOperationalStaff/);
  }
});

test('staff identity migration supports dry-run and explicit write mode', () => {
  const source = require('./helpers/sourceBundle.util').readSource('scripts/migrate-canonical-staff-identity.js');
  assert.match(source, /process\.argv\.includes\('--write'\)/);
  assert.match(source, /externalDebtOrders/);
  assert.match(source, /debtCollections/);
  assert.match(source, /\$unset/);
});
