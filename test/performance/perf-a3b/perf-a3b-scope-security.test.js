'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const searchService = require('../../../src/services/delivery/DeliverySuggestionSearchService');
const { buildPerfA3bFixture } = require('./fixture-factory');
const { FakeSuggestionRepository } = require('./fake-suggestion-repository');

async function scopedSearch(query = {}) {
  const fixture = buildPerfA3bFixture(10000);
  const repository = new FakeSuggestionRepository(fixture.orders);
  const result = await searchService.searchOrderCustomers(query, { repository, suggestionsSearchV1: true });
  return { fixture, repository, result };
}

test('customer outside selected staff scope never leaks', async () => {
  const { result } = await scopedSearch({
    deliveryDate: '2026-08-06', salesStaffCode: 'S01', deliveryStaffCode: 'D01',
    q: 'nguyen anh', limit: 20
  });
  assert.equal(result.items.some((item) => item.customerCode === 'KH-OUTSIDE'), false);
  assert.equal(result.diagnostics.postFilterScopeRejected, 0);
  assert.equal(result.diagnostics.scopeAppliedBeforeSearch, true);
});

test('changing staff scope exposes only the authorized matching customer', async () => {
  const { result } = await scopedSearch({
    deliveryDate: '2026-08-06', salesStaffCode: 'S99', deliveryStaffCode: 'D99',
    q: 'nguyen anh', limit: 20
  });
  assert.ok(result.items.some((item) => item.customerCode === 'KH-OUTSIDE'));
  assert.equal(result.items.some((item) => item.customerCode === 'KH-EXACT'), false);
});

test('defense-in-depth post filter rejects repository scope violations', async () => {
  const fixture = buildPerfA3bFixture(10000);
  const maliciousRepository = {
    async findFastCandidates() { return { rows: [fixture.orders[0], fixture.orders[4]], queries: 1, mode: 'malicious-test' }; },
    async findLegacyCandidates() { return { rows: [], queries: 0, mode: 'not-used' }; }
  };
  const result = await searchService.searchOrderCustomers({
    deliveryDate: '2026-08-06', salesStaffCode: 'S01', deliveryStaffCode: 'D01', q: 'nguyen anh', limit: 10
  }, { repository: maliciousRepository, suggestionsSearchV1: true, legacyFallback: false });
  assert.equal(result.items.some((item) => item.customerCode === 'KH-OUTSIDE'), false);
  assert.ok(result.diagnostics.postFilterScopeRejected >= 1);
});
