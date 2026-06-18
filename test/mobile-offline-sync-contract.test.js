'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { stableHash } = require('../src/services/mobile/MobileSyncService');

test('mobile offline operation hash is deterministic', () => {
  const payload = { customerCode: 'C1', items: [{ productCode: 'P1', qty: 2 }] };
  assert.equal(stableHash(payload), stableHash(payload));
  assert.equal(stableHash(payload), stableHash({ items: payload.items, customerCode: 'C1' }));
  assert.notEqual(stableHash(payload), stableHash({ ...payload, customerCode: 'C2' }));
});
