'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const searchService = require('../../../src/services/delivery/DeliverySuggestionSearchService');
const contract = require('../../../src/services/delivery/deliverySuggestionSearchContract');
const { buildPerfA3bFixture } = require('./fixture-factory');
const { FakeSuggestionRepository } = require('./fake-suggestion-repository');

async function run(q, query = {}) {
  const fixture = buildPerfA3bFixture(10000);
  const repository = new FakeSuggestionRepository(fixture.orders);
  const result = await searchService.searchOrderCustomers({
    ...fixture.targetScope,
    ...query,
    q,
    limit: query.limit || 10
  }, { repository, suggestionsSearchV1: true });
  return { fixture, repository, result };
}

function codes(result) {
  return result.items.map((item) => item.orderCode || item.customerCode || item.code);
}

test('fixture is deterministic and covers mandatory PERF-A3B cases', () => {
  const a = buildPerfA3bFixture(10000);
  const b = buildPerfA3bFixture(10000);
  assert.equal(a.seed, 'PERF-A3B-FIXTURE-V1');
  assert.equal(a.orders.length, 10000);
  assert.deepEqual(a.orders[400], b.orders[400]);
  assert.ok(a.orders.some((row) => row.customerName.includes('Nguyễn Ánh')));
  assert.ok(a.orders.some((row) => row.customerAddress.includes('Lê Lợi')));
  assert.ok(a.orders.some((row) => row.salesmanCode === 'S01'));
  assert.ok(a.orders.some((row) => row.nvghCode === 'D01'));
  assert.equal(a.orders.filter((row) => row.customerCode === 'KH-DUP').length, 2);
});

test('exact customer code ranks before prefix matches', async () => {
  const { result } = await run('KH-EXACT');
  assert.ok(result.items.length > 0);
  assert.equal(result.items[0].customerCode, 'KH-EXACT');
  assert.ok(result.items.some((item) => item.customerCode === 'KH-EXACT-02'));
});

test('customer code prefix returns stable relevant suggestions', async () => {
  const { result } = await run('KH-EX');
  assert.deepEqual([...new Set(codes(result))], codes(result));
  assert.ok(result.items.some((item) => item.customerCode === 'KH-EXACT'));
});

test('accented and unaccented Vietnamese name queries have parity', async () => {
  const accented = await run('Nguyễn Ánh');
  const unaccented = await run('nguyen anh');
  assert.deepEqual(codes(accented.result), codes(unaccented.result));
  assert.ok(unaccented.result.items.some((item) => item.customerCode === 'KH-EXACT'));
});

test('phone prefix and address tokens are searchable', async () => {
  const phone = await run('091234');
  const address = await run('le loi');
  assert.ok(phone.result.items.some((item) => item.customerCode === 'KH-EXACT'));
  assert.ok(address.result.items.some((item) => item.customerCode === 'KH-EXACT'));
});

test('one-character order/customer keyword is rejected before repository work', async () => {
  const { result, repository } = await run('n');
  assert.deepEqual(result.items, []);
  assert.equal(result.diagnostics.reason, 'MIN_QUERY_LENGTH');
  assert.equal(repository.metrics.fastCalls, 0);
  assert.equal(repository.metrics.legacyCalls, 0);
});

test('duplicate customer suggestions are removed and ranking is stable', async () => {
  const first = await run('KH-DUP');
  const second = await run('KH-DUP');
  const customerRows = first.result.items.filter((item) => item.type === 'customer' && item.customerCode === 'KH-DUP');
  assert.equal(customerRows.length, 1);
  assert.deepEqual(first.result.items, second.result.items);
});

test('legacy staff aliases remain searchable after normalized backfill', async () => {
  const { result } = await run('KH-LEGACY');
  assert.ok(result.items.some((item) => item.customerCode === 'KH-LEGACY'));
});

test('candidate count and repository calls remain hard bounded', async () => {
  const { result, repository } = await run('cua hang', { candidateLimit: 40, limit: 10 });
  assert.ok(result.diagnostics.candidateRows <= 40);
  assert.ok(result.diagnostics.repositoryCalls <= 6);
  assert.ok(repository.metrics.fastRowsReturned <= 40);
});

test('regex metacharacters are data, never an executable unbounded pattern', async () => {
  const attack = '.*(a+)+$';
  const { result } = await run(attack);
  assert.equal(result.diagnostics.regexPolicy, 'escaped-anchored-prefix-only; no user-controlled substring regex');
  assert.deepEqual(result.items, []);
  assert.equal(contract.escapeRegExp(attack), '\\.\\*\\(a\\+\\)\\+\\$');
});

test('query length is capped', async () => {
  await assert.rejects(
    run('x'.repeat(81)),
    (error) => error && error.code === 'SUGGESTION_QUERY_TOO_LONG' && error.status === 400
  );
});

test('legacy DD/MM/YYYY date row is recovered by bounded fallback without scope loss', async () => {
  const { result } = await run('KH-LEGACY-DATE');
  assert.ok(result.items.some((item) => item.customerCode === 'KH-LEGACY-DATE'));
  assert.equal(result.diagnostics.legacyFallback, true);
});
