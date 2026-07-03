'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const closeoutPath = path.join(root, 'src/services/accounting/AccountingCloseoutService.js');
const orderRepositoryPath = path.join(root, 'src/repositories/orderRepository.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('delivery closeout patches salesOrder instead of full-document upsert', () => {
  const source = read(closeoutPath);
  assert.match(source, /patchAccountingCloseoutById\s*\(/);
  assert.doesNotMatch(source, /orderRepository\.upsert\s*\(\s*updatedOrder/);
  assert.doesNotMatch(source, /function\s+buildConfirmedOrderPatch\s*\([^)]*\)\s*{[\s\S]*?\.\.\.order[\s\S]*?}/);
  assert.match(source, /function\s+buildConfirmedOrderPatchFields\s*\(/);
  assert.match(source, /skipReadModelRebuild\s*:\s*true/);
});

test('order repository closeout patch uses updateOne with $set and no upsert', () => {
  const source = read(orderRepositoryPath);
  const match = source.match(/async\s+function\s+patchAccountingCloseoutById[\s\S]*?\n}\n/);
  assert.ok(match, 'patchAccountingCloseoutById must exist');
  const body = match[0];
  assert.match(body, /Model\.updateOne\s*\(/);
  assert.match(body, /\$set\s*:/);
  assert.match(body, /\$inc\s*:\s*{\s*version\s*:/);
  assert.doesNotMatch(body, /upsert\s*:\s*true/);
  assert.doesNotMatch(body, /findOneAndUpdate\s*\(/);
});


test('delivery closeout only rebuilds debt read model when a new AR-DEBT-OPEN was posted', () => {
  const source = read(closeoutPath);
  assert.match(source, /readModelAffected:\s*arResult\s*&&\s*arResult\.posted\s*===\s*true/);
  assert.match(source, /row\.confirmed\s*&&\s*row\.readModelAffected\s*===\s*true/);
});
