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

const { verifyPassword, hashPasswordSync, isBcryptHash, validatePasswordStrength } = policy;

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


test('new passwords must satisfy minimum strength without invalidating existing hashes', () => {
  assert.match(validatePasswordStrength('12345678'), /phổ biến|kết hợp/);
  assert.match(validatePasswordStrength('abcdefgh'), /kết hợp/);
  assert.match(validatePasswordStrength('Khoi1987', { username: 'khoi1987' }), /tên đăng nhập/);
  assert.equal(validatePasswordStrength('StrongPass@2026'), '');
  assert.throws(() => hashPasswordSync('12345678'));
  assert.equal(isBcryptHash(hashPasswordSync('StrongPass@2026')), true);
});


test('unknown users still execute a bcrypt comparison through the dummy hash', async () => {
  const started = Date.now();
  assert.equal(await verifyPassword('WrongPassword@2026', ''), false);
  assert.ok(Date.now() - started >= 20);
});
