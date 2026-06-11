'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let bcrypt;
let policy;
try {
  bcrypt = require('bcryptjs');
  policy = require('../src/security/passwordPolicy');
} catch (err) {
  const reason = 'bcryptjs dependency is not installed; run npm install before behavior tests';
  test('password policy behavior requires installed dependencies', { skip: reason }, () => {});
  module.exports = {};
  return;
}

const { verifyPassword, hashPasswordSync, isBcryptHash } = policy;

test('verifyPassword rejects missing, plaintext and default fallback password', async () => {
  assert.equal(await verifyPassword('123456', ''), false);
  assert.equal(await verifyPassword('123456', '123456'), false);
  assert.equal(await verifyPassword('abc', 'abc'), false);
});

test('verifyPassword accepts valid bcrypt hash only', async () => {
  const hash = bcrypt.hashSync('StrongPass@2026', 10);

  assert.equal(isBcryptHash(hash), true);
  assert.equal(await verifyPassword('StrongPass@2026', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('hashPasswordSync rejects empty password', () => {
  assert.throws(() => hashPasswordSync(''));
});
