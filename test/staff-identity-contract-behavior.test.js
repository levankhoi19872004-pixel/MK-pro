'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  pickSalesStaffCode,
  pickSalesStaffName,
  pickDeliveryStaffCode,
  pickDeliveryStaffName
} = require('../src/domain/staff/staffIdentity');

test('pickSalesStaffCode only reads canonical sales fields', () => {
  assert.equal(pickSalesStaffCode({ salesStaffCode: 'S001' }), 'S001');
  assert.equal(pickSalesStaffCode({ salesmanCode: 'S002' }), 'S002');
  assert.equal(pickSalesStaffCode({ employeeCode: 'S003' }), 'S003');
  assert.equal(pickSalesStaffCode({ maNhanVien: 'S004' }), 'S004');

  assert.equal(pickSalesStaffCode({ staffCode: 'LEGACY' }), '');
  assert.equal(pickSalesStaffCode({ username: 'sale01' }), '');
  assert.equal(pickSalesStaffCode({ id: 'abc' }), '');
  assert.equal(pickSalesStaffCode({ _id: 'mongo' }), '');
});

test('pickDeliveryStaffCode only reads canonical delivery fields', () => {
  assert.equal(pickDeliveryStaffCode({ deliveryStaffCode: 'D001' }), 'D001');
  assert.equal(pickDeliveryStaffCode({ shipperCode: 'D002' }), 'D002');
  assert.equal(pickDeliveryStaffCode({ employeeCode: 'D003' }), 'D003');
  assert.equal(pickDeliveryStaffCode({ maNhanVien: 'D004' }), 'D004');

  assert.equal(pickDeliveryStaffCode({ staffCode: 'LEGACY' }), '');
  assert.equal(pickDeliveryStaffCode({ username: 'ship01' }), '');
  assert.equal(pickDeliveryStaffCode({ id: 'abc' }), '');
  assert.equal(pickDeliveryStaffCode({ _id: 'mongo' }), '');
});

test('staff names do not use legacy staffName or username', () => {
  assert.equal(pickSalesStaffName({ salesStaffName: 'Nguyễn A' }), 'Nguyễn A');
  assert.equal(pickDeliveryStaffName({ deliveryStaffName: 'Nguyễn B' }), 'Nguyễn B');

  assert.equal(pickSalesStaffName({ staffName: 'Legacy Name' }), '');
  assert.equal(pickSalesStaffName({ username: 'sale01' }), '');
  assert.equal(pickDeliveryStaffName({ staffName: 'Legacy Name' }), '');
  assert.equal(pickDeliveryStaffName({ username: 'ship01' }), '');
});
