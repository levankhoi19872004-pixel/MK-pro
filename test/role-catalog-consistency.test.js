'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const userService = require('../src/services/userService');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

const EXPECTED = ['admin', 'manager', 'accountant', 'warehouse', 'sales', 'delivery'];

test('user management recognizes every canonical role', () => {
  for (const role of EXPECTED) assert.ok(userService.VALID_ROLES.includes(role), role);
  const ui = read('public/index.html');
  const labels = [read('public/js/app/admin/08a-reports.js'),read('public/js/app/admin/08b-users.js'),read('public/js/app/admin/08c-promotions-legacy.js'),read('public/js/app/admin/08d-import-excel.js'),read('public/js/app/admin/08e-promotion-programs.js'),read('public/js/app/admin/08f-vat-export.js')].join('\n');
  for (const role of EXPECTED) {
    assert.match(ui, new RegExp(`value=["']${role}["']`), role);
    assert.match(labels, new RegExp(`${role}:`), role);
  }
});

test('manager and warehouse are not silently downgraded to sales', () => {
  const manager = userService.pickStaffPayload({ code: 'QL01', username: 'ql01', name: 'Quản lý', role: 'manager', password: 'StrongPass@2026' });
  const warehouse = userService.pickStaffPayload({ code: 'K01', username: 'kho01', name: 'Kho', role: 'warehouse', password: 'StrongPass@2026' });
  assert.equal(manager.role, 'manager');
  assert.equal(warehouse.role, 'warehouse');
  assert.equal(manager.isSalesman, false);
  assert.equal(warehouse.isSalesman, false);
});
