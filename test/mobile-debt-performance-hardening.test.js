'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('mobile debt endpoint uses bounded parallel exact-scope batches without changing global default', () => {
  const adapter = read('src/services/mobile/mobileDebtNewAdapter.service.js');
  const arRead = read('src/services/arLedgerRead.service.js');
  const indexService = read('src/services/mongoIndexService.js');

  assert.match(adapter, /MOBILE_DEBT_SCOPE_KEY_BATCH_SIZE\s*=\s*1000/);
  assert.match(adapter, /MOBILE_DEBT_SCOPE_BATCH_CONCURRENCY\s*=\s*4/);
  assert.match(adapter, /scopeKeyBatchSize:\s*MOBILE_DEBT_SCOPE_KEY_BATCH_SIZE/);
  assert.match(adapter, /scopeBatchConcurrency:\s*MOBILE_DEBT_SCOPE_BATCH_CONCURRENCY/);
  assert.match(adapter, /DebtNewService\.listCustomers\(scopedQuery,\s*debtOptions\)/);
  assert.match(arRead, /DEFAULT_SCOPE_KEY_BATCH_SIZE\s*=\s*400/);
  assert.match(arRead, /MAX_SCOPE_KEY_BATCH_SIZE\s*=\s*8000/);
  assert.match(arRead, /DEFAULT_SCOPE_BATCH_CONCURRENCY\s*=\s*1/);
  assert.match(arRead, /MAX_SCOPE_BATCH_CONCURRENCY\s*=\s*8/);
  assert.match(arRead, /batchSize,\s*\n\s*batchCount:\s*batches\.length,\s*\n\s*batchConcurrency:/);
  assert.match(indexService, /idx_ar_debt_order_alias_wildcard/);
  assert.match(indexService, /wildcardProjection:\s*AR_DEBT_ORDER_ALIAS_WILDCARD_PROJECTION/);
});

test('delivery core has a bounded AbortController timeout so debt skeleton cannot wait forever', () => {
  const core = read('public/js/delivery/delivery-core.js');
  assert.match(core, /Number\(options\.timeoutMs\)\s*\|\|\s*15000/);
  assert.match(core, /new AbortController\(\)/);
  assert.match(core, /controller\.abort\(\)/);
  assert.match(core, /REQUEST_TIMEOUT/);
  assert.match(core, /Yêu cầu quá thời gian chờ/);
});

test('API monitor keeps mounted root route instead of collapsing /api/mobile/debts to GET /', () => {
  const monitor = read('src/middlewares/apiMonitor.middleware.js');
  assert.match(monitor, /if \(routePath === '\/'\) return base\.replace/);
  assert.match(monitor, /return \(req\.originalUrl \|\| req\.path \|\| req\.url \|\| ''\)/);
});


test('1000-key mobile scope batches overlap at bounded concurrency for a 14000-alias debt read', async () => {
  const arRead = require('../src/services/arLedgerRead.service');
  let findCount = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const query = () => ({
    select() { return this; },
    sort() { throw new Error('exact-scope batch read must not request Mongo sort'); },
    lean() { return this; },
    then(resolve, reject) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((done) => setTimeout(done, 5))
        .then(() => [])
        .finally(() => { inFlight -= 1; })
        .then(resolve, reject);
    }
  });
  arRead.setModelsForTest({
    ArLedger: {
      find() { findCount += 1; return query(); }
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
    assert.equal(result.diagnostics.batchSize, 1000);
    assert.equal(result.diagnostics.batchCount, 14);
    assert.equal(result.diagnostics.batchConcurrency, 4);
    assert.equal(findCount, 14);
    assert.ok(maxInFlight > 1, `expected overlapped Mongo reads, maxInFlight=${maxInFlight}`);
    assert.ok(maxInFlight <= 4, `Mongo read concurrency exceeded budget: ${maxInFlight}`);
  } finally {
    arRead.setModelsForTest(null);
  }
});
