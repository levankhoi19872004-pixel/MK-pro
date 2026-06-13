'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const userService = require('../src/services/userService');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const EXPECTED = ['admin', 'manager', 'accountant', 'warehouse', 'sales', 'delivery'];

test('user management recognizes every canonical role', () => {
  for (const role of EXPECTED) assert.ok(userService.VALID_ROLES.includes(role), role);
  const ui = read('public/index.html');
  const labels = read('public/js/app/08-reports-users-promotions-import-excel.js');
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
