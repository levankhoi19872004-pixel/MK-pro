'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('login only accepts bcrypt password hashes and never plaintext/default password', () => {
  const policy = read('src/security/passwordPolicy.js');
  const authRoutes = read('src/routes/authRoutes.js');
  const mobileRoutes = read('src/routes/mobileRoutes.js');
  const userService = read('src/services/userService.js');

  assert.match(policy, /function verifyPassword/);
  assert.match(policy, /isBcryptHash\(stored\)/);
  assert.match(policy, /return false/);
  assert.match(policy, /bcrypt\.compare/);

  assert.doesNotMatch(authRoutes, /password\s*===\s*['"]123456['"]/);
  assert.doesNotMatch(authRoutes, /return password === saved/);
  assert.doesNotMatch(authRoutes, /user\.(?:pass|pin)\b/);

  assert.doesNotMatch(mobileRoutes, /String\(password \|\| ''\) === ['"]123456['"]/);
  assert.doesNotMatch(mobileRoutes, /return String\(password \|\| ''\) === stored/);
  assert.doesNotMatch(mobileRoutes, /staff\.(?:pass|pin)\b/);

  assert.doesNotMatch(userService, /hashPasswordSync\(['"]123456['"]\)/);
});

test('password migration is explicit and legacy seed scripts do not use default 123456', () => {
  const migration = read('scripts/migrate-user-passwords.js');
  const jsonMigration = read('scripts/migrate-json-to-mongo-final.js');
  const staffsMigration = read('scripts/migrate-staffs-to-users.js');

  assert.match(migration, /passwordPolicyVersion:\s*2/);
  assert.match(migration, /\$unset:\s*\{[\s\S]*pass:[\s\S]*pin:/);
  assert.doesNotMatch(jsonMigration, /123456/);
  assert.doesNotMatch(staffsMigration, /123456/);
});
