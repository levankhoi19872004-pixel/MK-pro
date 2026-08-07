'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }

test('migration is dry-run by default and apply requires explicit confirmation', () => {
  const source = read('scripts/create-ar-ledger-idempotency-unique-index.js');
  assert.match(source, /const apply = args\.has\('--apply'\)/);
  assert.match(source, /--confirm-create-index/);
  assert.match(source, /AUDIT_NOT_CLEAN/);
  assert.match(source, /verified = afterIndexes\.find/);
  assert.doesNotMatch(source, /dropIndex\s*\(/);
  assert.doesNotMatch(source, /deleteMany\s*\(/);
});

test('duplicate audit is read-only and reports groups instead of repairing them', () => {
  const source = read('scripts/audit-ar-ledger-idempotency-duplicates.js');
  assert.match(source, /actionTaken: 'NONE'/);
  assert.doesNotMatch(source, /deleteMany\s*\(/);
  assert.doesNotMatch(source, /updateMany\s*\(/);
  assert.doesNotMatch(source, /bulkWrite\s*\(/);
});

test('package commands separate audit, dry-run and explicit apply', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['audit:ar-ledger-idempotency'], 'node scripts/audit-ar-ledger-idempotency-duplicates.js');
  assert.match(pkg.scripts['mongo:ar-ledger-idempotency-unique-index:dry'], /--json/);
  assert.match(pkg.scripts['mongo:ar-ledger-idempotency-unique-index'], /--apply --confirm-create-index/);
});
