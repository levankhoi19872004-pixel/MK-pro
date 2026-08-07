'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('CL-A2-REQ-005/006: canonical assignment has an explicit safe MasterOrder skip predicate', () => {
  const loader = read('src/services/accounting/closeout/CloseoutContextLoader.js');
  assert.match(loader, /function canSkipMasterOrderMetadata/);
  assert.match(loader, /orderDeliveryAssignment\(/);
  assert.match(loader, /normalizedCode\(assignment\.actualDeliveryStaffCode\)\s*===\s*normalizedCode\(requestedDeliveryStaffCode\)/);
});

test('CL-A2-REQ-006/007: MasterOrder skip is gated; fallback query remains for unresolved or mismatch cases', () => {
  const loader = read('src/services/accounting/closeout/CloseoutContextLoader.js');
  assert.match(loader, /closeoutQueryDedupV1/);
  assert.match(loader, /loadMasterOrderMetadata\(pendingConfirmOrders/);
  assert.match(loader, /masterMetadataQueryExecuted:\s*false/);
});
