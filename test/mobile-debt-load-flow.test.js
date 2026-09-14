'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const VIEW_FILE = path.join(ROOT, 'public/mobile/js/delivery-mobile-view.source.js');
const CORE_FILE = path.join(ROOT, 'public/js/delivery/delivery-core.js');
const VIEW_SOURCE = fs.readFileSync(VIEW_FILE, 'utf8');
const CORE_SOURCE = fs.readFileSync(CORE_FILE, 'utf8');

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

const DEBT_HELPERS = between(
  VIEW_SOURCE,
  'function deliveryDebtCustomerKey(customer) {',
  'function selectedDeliveryDebtCustomer() {'
);
const LOAD_DEBTS = between(
  VIEW_SOURCE,
  'async function loadDeliveryDebts(force, options) {',
  'function renderDebtApp(body) {'
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeState() {
  return {
    debts: [],
    debtSummary: {},
    selectedDebtIndex: -1,
    selectedDebtKey: '',
    debtSearch: '',
    debtFormDirty: false,
    debtLoaded: false,
    debtCacheAt: 0,
    debtLoading: false,
    debtPromise: null,
    debtRequestSeq: 0,
    debtError: '',
    debtPage: 0,
    debtLimit: 100,
    debtHasMore: false,
    debtTotalRows: 0,
    debtTotalPages: 0,
    debtNextPage: 1,
    debtLoadingMore: false
  };
}

function createHarness(apiImpl) {
  const state = makeState();
  const messages = [];
  let renderCount = 0;
  const sandbox = {
    state,
    DELIVERY_TAB_CACHE_TTL_MS: 60_000,
    DELIVERY_DEBT_PAGE_LIMIT: 100,
    deliveryMobileState: { isFresh: () => false },
    window: { DeliveryCore: { api: apiImpl } },
    URLSearchParams,
    Map,
    Date,
    msg(message, danger) { messages.push({ message, danger: !!danger }); },
    render() { renderCount += 1; }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${DEBT_HELPERS}\n${LOAD_DEBTS}\nthis.__loadDeliveryDebts = loadDeliveryDebts;`, sandbox, {
    filename: 'delivery-mobile-view.debt-flow.vm.js'
  });
  return {
    state,
    messages,
    load: sandbox.__loadDeliveryDebts,
    renderCount: () => renderCount
  };
}

function response(items = [], overrides = {}) {
  return {
    ok: true,
    items,
    summary: { totalDebt: 0, customerCount: items.length },
    pagination: { page: 1, limit: 100, totalRows: items.length, totalPages: items.length ? 1 : 0, hasMore: false, nextPage: null },
    ...overrides
  };
}

test('mobile debt load flow deduplicates concurrent opens and leaves loading state after success', async () => {
  const gate = deferred();
  const calls = [];
  const harness = createHarness((url, options) => {
    calls.push({ url, options });
    return gate.promise;
  });

  const first = harness.load(false);
  const second = harness.load(false);

  assert.equal(calls.length, 1, 'opening the debt tab twice while loading must not duplicate the API request');
  assert.equal(harness.state.debtLoading, true);
  assert.match(calls[0].url, /^\/api\/mobile\/debts\?/);

  gate.resolve(response([{ customerCode: 'KH001', customerName: 'Khách A', debtAmount: 120000 }]));
  await Promise.all([first, second]);

  assert.equal(harness.state.debtLoading, false);
  assert.equal(harness.state.debtPromise, null);
  assert.equal(harness.state.debtLoaded, true);
  assert.equal(harness.state.debtError, '');
  assert.equal(harness.state.debts.length, 1);
  assert.equal(harness.state.debts[0].customerCode, 'KH001');
  assert.ok(harness.renderCount() >= 1, 'the view must render after the request settles');
});

test('mobile debt load flow handles an empty response as success instead of hanging', async () => {
  const harness = createHarness(async () => response([]));
  await harness.load(false);

  assert.equal(harness.state.debtLoading, false);
  assert.equal(harness.state.debtLoaded, true);
  assert.equal(harness.state.debtError, '');
  assert.deepEqual(Array.from(harness.state.debts), []);
  assert.equal(harness.state.debtTotalRows, 0);
});

test('mobile debt timeout exits loading, exposes the error, and a forced retry can recover', async () => {
  let callCount = 0;
  const timeout = Object.assign(new Error('Yêu cầu quá thời gian chờ (15 giây). Vui lòng thử lại.'), {
    code: 'REQUEST_TIMEOUT',
    name: 'TimeoutError'
  });
  const harness = createHarness(async () => {
    callCount += 1;
    if (callCount === 1) throw timeout;
    return response([{ customerCode: 'KH-RETRY', customerName: 'Khách retry', debtAmount: 50000 }]);
  });

  await assert.rejects(harness.load(false), /quá thời gian chờ/i);
  assert.equal(harness.state.debtLoading, false, 'timeout must always leave the loading state');
  assert.equal(harness.state.debtLoaded, false);
  assert.match(harness.state.debtError, /quá thời gian chờ/i);

  await harness.load(true);
  assert.equal(callCount, 2);
  assert.equal(harness.state.debtLoading, false);
  assert.equal(harness.state.debtLoaded, true);
  assert.equal(harness.state.debtError, '');
  assert.equal(harness.state.debts[0].customerCode, 'KH-RETRY');
});

test('forced refresh prevents a stale earlier response from overwriting newer debt data', async () => {
  const firstGate = deferred();
  const secondGate = deferred();
  let callCount = 0;
  const harness = createHarness(() => {
    callCount += 1;
    return callCount === 1 ? firstGate.promise : secondGate.promise;
  });

  const oldRequest = harness.load(false);
  const newRequest = harness.load(true);
  assert.equal(callCount, 2, 'forced refresh must start a new request');

  secondGate.resolve(response([{ customerCode: 'NEW', customerName: 'Dữ liệu mới', debtAmount: 90000 }]));
  await newRequest;
  firstGate.resolve(response([{ customerCode: 'OLD', customerName: 'Dữ liệu cũ', debtAmount: 10000 }]));
  await oldRequest;

  assert.equal(harness.state.debts.length, 1);
  assert.equal(harness.state.debts[0].customerCode, 'NEW', 'stale response must not overwrite the current request');
  assert.equal(harness.state.debtLoading, false);
});

test('debt error UI keeps a real retry action wired to a forced reload', () => {
  assert.match(VIEW_SOURCE, /id="mRetryDebt"[^>]*>Thử lại<\/button>/);
  assert.match(VIEW_SOURCE, /state\.debtError\s*=\s*'';\s*loadDeliveryDebts\(true\);/s);
  assert.match(VIEW_SOURCE, /if \(state\.debtLoading && !rows\.length\)/);
  assert.match(VIEW_SOURCE, /if \(state\.debtError && !rows\.length\)/);
});

test('delivery API timeout is bounded and abort-backed without waiting 15 seconds in the test', () => {
  assert.match(CORE_SOURCE, /Number\(options\.timeoutMs\)\s*\|\|\s*15000/);
  assert.match(CORE_SOURCE, /new AbortController\(\)/);
  assert.match(CORE_SOURCE, /setTimeout\(function \(\) \{ timedOut = true; controller\.abort\(\); \}, timeoutMs\)/);
  assert.match(CORE_SOURCE, /timeoutError\.code\s*=\s*'REQUEST_TIMEOUT'/);
});

test('mobile debt query fanout keeps each alias lookup small and concurrency bounded for a 14k-alias scope', async () => {
  const arRead = require('../src/services/arLedgerRead.service');
  let ledgerFindCount = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const keyCounts = [];
  arRead.setModelsForTest({
    ArLedger: {
      find(match) {
        ledgerFindCount += 1;
        const aliasClause = Array.isArray(match?.$and)
          ? match.$and.find((row) => Array.isArray(row?.$or))
          : null;
        const firstIn = aliasClause?.$or?.map((row) => Object.values(row || {})[0]?.$in).find(Array.isArray) || [];
        keyCounts.push(firstIn.length);
        return {
          select() { return this; },
          sort() { throw new Error('exact-scope read should not sort in Mongo'); },
          lean() { return this; },
          then(resolve, reject) {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            return new Promise((done) => setTimeout(done, 4))
              .then(() => [])
              .finally(() => { inFlight -= 1; })
              .then(resolve, reject);
          }
        };
      }
    }
  });

  try {
    const scopes = Array.from({ length: 7000 }, (_, index) => ({
      orderKey: `SO${String(index).padStart(8, '0')}`,
      aliases: [`B${String(index).padStart(8, '0')}`]
    }));
    const result = await arRead.getActiveDebtReadModelLedgersForOrderScopes(scopes, {}, {
      scopeKeyBatchSize: 1000,
      scopeBatchConcurrency: 4
    });

    assert.equal(result.diagnostics.aliasCount, 14000);
    assert.equal(result.diagnostics.batchCount, 14);
    assert.equal(result.diagnostics.batchConcurrency, 4);
    assert.equal(ledgerFindCount, 14);
    assert.ok(keyCounts.every((count) => count > 0 && count <= 1000), `oversized alias batch detected: ${keyCounts.join(',')}`);
    assert.ok(maxInFlight > 1, `expected concurrent batches, got maxInFlight=${maxInFlight}`);
    assert.ok(maxInFlight <= 4, `batch concurrency exceeded 4: ${maxInFlight}`);
  } finally {
    arRead.setModelsForTest(null);
  }
});
