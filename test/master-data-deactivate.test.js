'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const customerRepo = fs.readFileSync(path.join(root, 'src/repositories/customerRepository.js'), 'utf8');
const customerService = fs.readFileSync(path.join(root, 'src/services/customerService.js'), 'utf8');
const userRepo = fs.readFileSync(path.join(root, 'src/repositories/userRepository.js'), 'utf8');
const userService = fs.readFileSync(path.join(root, 'src/services/userService.js'), 'utf8');

test('customer delete endpoints deactivate records instead of hard deleting history', () => {
  assert.match(customerRepo, /async function deactivateByIdOrCode/);
  assert.match(customerRepo, /async function bulkDeactivate/);
  assert.match(customerRepo, /isActive: false/);
  assert.doesNotMatch(customerRepo, /findOneAndDelete/);
  assert.doesNotMatch(customerRepo, /Customer\.deleteMany/);
  assert.match(customerService, /deactivated: true/);
});

test('user delete preserves admin continuity and deactivates the account', () => {
  assert.match(userRepo, /async function deactivateUser/);
  assert.match(userRepo, /isActive: false/);
  assert.doesNotMatch(userRepo, /findOneAndDelete/);
  assert.match(userService, /otherAdmins/);
  assert.match(userService, /deactivateUser/);
  assert.match(userService, /deactivated: true/);
});
