'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const userService = require('../src/services/userService');
const userRepository = require('../src/repositories/userRepository');

test('identity matching recognizes object id, username and staff code aliases', () => {
  assert.equal(userService.isSameUserIdentity({ id: 'U1', username: 'admin' }, { id: 'U1' }), true);
  assert.equal(userService.isSameUserIdentity({ staffCode: 'AD01' }, { code: 'ad01' }), true);
  assert.equal(userService.isSameUserIdentity({ id: 'U1' }, { id: 'U2' }), false);
});

test('last admin cannot be demoted while another admin permits continuity', async () => {
  const original = userRepository.countUsers;
  try {
    userRepository.countUsers = async () => 0;
    assert.match(await userService.validateAdminContinuity(
      { _id: 'A1', role: 'admin', isActive: true },
      { role: 'manager', isActive: true },
      { id: 'A2' }
    ), /ít nhất một tài khoản admin/);

    userRepository.countUsers = async () => 1;
    assert.equal(await userService.validateAdminContinuity(
      { _id: 'A1', role: 'admin', isActive: true },
      { role: 'manager', isActive: true },
      { id: 'A2' }
    ), '');
  } finally {
    userRepository.countUsers = original;
  }
});
