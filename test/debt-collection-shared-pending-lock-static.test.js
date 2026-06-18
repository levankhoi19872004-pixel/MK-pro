'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('debt collection submit is serialized per order and rechecks debt inside transaction', () => {
  const service = read('src/services/DebtCollectionService.js');
  assert.match(service, /DebtCollectionLock\.findOneAndUpdate/);
  assert.match(service, /withMongoTransaction\(async \(session\)/);
  assert.match(service, /checkAvailableDebt\(\{[\s\S]*session/);
  assert.match(service, /DebtCollection\.create\(\[collection\], \{ session \}\)/);
});

test('pending amount is shared across collectors instead of filtered by current collector', () => {
  const service = read('src/services/DebtReadService.js');
  assert.match(service, /PENDING_STATUSES = \['submitted', 'under_review'\]/);
  assert.match(service, /Không lọc theo collectorCode/);
  const start = service.indexOf('function buildPendingFilter');
  const end = service.indexOf('function summarizePendingCollections', start);
  const block = service.slice(start, end);
  assert.ok(start >= 0 && end > start, 'Không xác định được block buildPendingFilter');
  assert.doesNotMatch(block, /collectorCode/);
  assert.match(service, /availableDebt: Math\.max\(0, normalizeDebtAmount\(officialDebt - pendingAmount\)\)/);
});

test('confirmed AR receipt keeps assignee and actual collector lineage', () => {
  const service = read('src/services/DebtCollectionService.js');
  const posting = read('src/engines/posting.engine.js');
  for (const field of ['salesStaffCode', 'deliveryStaffCode', 'collectorType', 'collectorCode', 'collectorName']) {
    assert.match(service, new RegExp(field));
    assert.match(posting, new RegExp(field));
  }
});
