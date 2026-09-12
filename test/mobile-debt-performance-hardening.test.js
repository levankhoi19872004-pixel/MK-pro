'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('mobile debt endpoint uses a large exact-scope batch without changing global default', () => {
  const adapter = read('src/services/mobile/mobileDebtNewAdapter.service.js');
  const arRead = read('src/services/arLedgerRead.service.js');

  assert.match(adapter, /MOBILE_DEBT_SCOPE_KEY_BATCH_SIZE\s*=\s*7000/);
  assert.match(adapter, /scopeKeyBatchSize:\s*MOBILE_DEBT_SCOPE_KEY_BATCH_SIZE/);
  assert.match(adapter, /DebtNewService\.listCustomers\(scopedQuery,\s*debtOptions\)/);
  assert.match(arRead, /DEFAULT_SCOPE_KEY_BATCH_SIZE\s*=\s*400/);
  assert.match(arRead, /MAX_SCOPE_KEY_BATCH_SIZE\s*=\s*8000/);
  assert.match(arRead, /batchSize,\s*\n\s*batchCount,/);
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


test('7000-key mobile scope batch collapses a 14000-alias debt read to two Mongo finds', async () => {
  const arRead = require('../src/services/arLedgerRead.service');
  let findCount = 0;
  const emptyQuery = {
    select() { return this; },
    sort() { return this; },
    lean() { return this; },
    then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); }
  };
  arRead.setModelsForTest({
    ArLedger: {
      find() { findCount += 1; return Object.create(emptyQuery); }
    }
  });
  try {
    const scopes = Array.from({ length: 7000 }, (_, index) => ({
      orderKey: `SO${String(index).padStart(8, '0')}`,
      aliases: [`B${String(index).padStart(8, '0')}`]
    }));
    const result = await arRead.getActiveDebtReadModelLedgersForOrderScopes(scopes, {}, { scopeKeyBatchSize: 7000 });
    assert.equal(result.diagnostics.aliasCount, 14000);
    assert.equal(result.diagnostics.batchSize, 7000);
    assert.equal(result.diagnostics.batchCount, 2);
    assert.equal(findCount, 2);
  } finally {
    arRead.setModelsForTest(null);
  }
});
