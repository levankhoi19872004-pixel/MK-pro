'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPerfA3bFixture } = require('./fixture-factory');
const { legacySearch } = require('./legacy-search-simulator');

const workRoot = path.resolve(__dirname, '../../..');

test('RED evidence: legacy suggestions use broad multi-field substring matching and bounded-after-match candidates', () => {
  const fixture = buildPerfA3bFixture(10000);
  const result = legacySearch(fixture.orders, {
    ...fixture.targetScope,
    q: fixture.cases.commonKeyword
  }, 10);
  assert.equal(fixture.orders.length, 10000);
  assert.equal(result.metrics.regexFieldCount, 13);
  assert.equal(result.metrics.regexMode, 'unanchored-substring-case-insensitive');
  assert.ok(result.metrics.scannedRows > 1000);
  assert.ok(result.metrics.candidateRows >= result.metrics.outputRows);
});

test('GREEN normalized scope-first search contract exists', () => {
  const target = path.join(workRoot, 'src/services/delivery/DeliverySuggestionSearchService.js');
  assert.equal(fs.existsSync(target), true, 'DeliverySuggestionSearchService.js must exist');
  const source = fs.readFileSync(target, 'utf8');
  assert.match(source, /PERF_SUGGESTIONS_SEARCH_V1/);
  assert.match(source, /legacyFallback/);
  assert.match(source, /candidateLimit/);
  assert.match(source, /scope/);
});
