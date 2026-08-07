'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const service = require('../../../src/services/delivery/DeliverySuggestionSearchService');

const searchSource = fs.readFileSync(path.resolve(__dirname, '../../../src/services/delivery/DeliverySuggestionSearchService.js'), 'utf8');
const deliverySource = fs.readFileSync(path.resolve(__dirname, '../../../src/services/v2/deliveryTodayNew.service.js'), 'utf8');
const modelSource = fs.readFileSync(path.resolve(__dirname, '../../../src/models/SalesOrder.js'), 'utf8');
const indexSource = fs.readFileSync(path.resolve(__dirname, '../../../src/services/mongoIndexService.js'), 'utf8');

test('feature flag defaults OFF and legacy path remains available', () => {
  const previous = process.env.PERF_SUGGESTIONS_SEARCH_V1;
  delete process.env.PERF_SUGGESTIONS_SEARCH_V1;
  assert.equal(service.enabled({}), false);
  assert.match(deliverySource, /orderCustomerSuggestions\(query, q, limit, options\)/);
  if (previous !== undefined) process.env.PERF_SUGGESTIONS_SEARCH_V1 = previous;
});

test('normalized fast path has hard limits, scope-first filters and explicit fallback telemetry', () => {
  assert.match(searchSource, /scopeAppliedBeforeSearch: true/);
  assert.match(searchSource, /candidateLimit/);
  assert.match(searchSource, /delivery_suggestions_legacy_fallback/);
  assert.match(searchSource, /escaped-anchored-prefix-only/);
  assert.doesNotMatch(searchSource, /new RegExp\(`\$\{contract\.escapeRegExp\(keyword\.(?:raw|normalized)\)\}`/);
});

test('SalesOrder declares normalized fields and desired indexes', () => {
  for (const field of [
    'suggestOrderCodeNorm', 'suggestCustomerCodeNorm', 'suggestCustomerNameNorm',
    'suggestCustomerPhoneNorm', 'suggestCustomerAddressNorm', 'suggestSalesStaffCodeNorm',
    'suggestDeliveryStaffCodeNorm', 'suggestSearchTokens', 'suggestSearchVersion'
  ]) assert.match(modelSource, new RegExp(field));
  assert.match(indexSource, /idx_orders_suggest_order_code/);
  assert.match(indexSource, /idx_orders_suggest_customer_name/);
  assert.match(indexSource, /idx_orders_suggest_tokens_date/);
});

test('normalized-field backfill is dry-run by default and apply requires explicit confirmation', () => {
  const backfill = require('../../../scripts/performance/perf-a3b/backfill-delivery-suggestion-search-fields');
  assert.deepEqual(backfill.parseArgs([]), { apply: false, confirm: false, limit: 0 });
  assert.deepEqual(backfill.parseArgs(['--apply', '--confirm-backfill', '--limit=100']), { apply: true, confirm: true, limit: 100 });
});

test('order/customer output and candidate limits are hard capped', () => {
  const contract = require('../../../src/services/delivery/deliverySuggestionSearchContract');
  assert.equal(contract.parseOutputLimit(999), 10);
  assert.equal(contract.parseCandidateLimit(999, 10), 80);
});
