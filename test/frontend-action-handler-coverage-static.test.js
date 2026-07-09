'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildAudit } = require('../scripts/audit-flow-usage');

test('frontend data-action inventory is measurable and command coverage is governed', () => {
  const audit = buildAudit();
  assert.ok(audit.summary.dataActions > 0, 'data-action inventory should be collected');
  assert.equal(audit.ok, true);
});

test('retired frontend tokens are not active in runtime UI scan', () => {
  const audit = buildAudit();
  const hardHits = audit.retiredHits.filter((hit) => ['/api/delivery-today', '/api/mobile-legacy'].includes(hit.token));
  assert.deepEqual(hardHits, []);
});
