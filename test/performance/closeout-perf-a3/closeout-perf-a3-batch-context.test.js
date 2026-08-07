'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const featureFlags = require('../../../src/config/featureFlags');
const arLedgerReadService = require('../../../src/services/arLedgerRead.service');
const Module = require('node:module');
function loadDebtService() {
  const target = require.resolve('../../../src/services/accounting/OrderPaymentDebtReconcileService');
  delete require.cache[target];
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === './OrderPaymentAllocationService') return { computeDebtBreakdown: () => ({ rawDebtAmount: 0, normalizedDebtAmount: 0, debtAmount: 0, zeroTolerance: 1000, zeroToleranceApplied: false, zeroToleranceAdjustmentAmount: 0 }) };
    if (request === '../arPosting.service') return { postArLedgerEntry: async (row) => row };
    if (request === '../../observability/closeoutQueryAudit') return { withCloseoutAuditStage: (_n, fn) => fn(), updateCardinality: () => {} };
    return original.call(this, request, parent, isMain);
  };
  try { return require(target); } finally { Module._load = original; }
}

function queryReturning(rows, counters) {
  const query = {
    session() { return query; },
    select() { return query; },
    sort() { return query; },
    limit() { return query; },
    lean() { return query; },
    then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); }
  };
  counters.find += 1;
  return query;
}

function scope(i, customerCode = `C${i}`) {
  return {
    canonicalOrderKey: `SO${i}`,
    customerCode,
    identity: {
      orderId: `SO${i}`,
      orderCode: `B${String(i).padStart(6, '0')}`,
      lookupKeys: [`SO${i}`, `B${String(i).padStart(6, '0')}`],
      ignoredSourceAliases: [],
      sourceAliasesMatchingBusinessIdentity: []
    }
  };
}

function validArSale(i, amount = 1000, customerCode = `C${i}`) {
  const code = `B${String(i).padStart(6, '0')}`;
  const id = `SO${i}`;
  return {
    id: `AR-SALE-${id}`, code: `AR-SALE-${code}`,
    account: 'AR', category: 'AR-SALE', ledgerType: 'AR-SALE', entryType: 'normal', type: 'ar_sale',
    sourceType: 'ORDER_PAYMENT_ALLOCATION', sourceId: id, sourceCode: code,
    refType: 'ORDER_PAYMENT_ALLOCATION', refId: `OPA-${id}`, refCode: `OPA-${id}`,
    orderId: id, orderCode: code, salesOrderId: id, salesOrderCode: code,
    customerCode, customerName: customerCode,
    debit: amount, credit: 0, amount, direction: 'debit', amountField: 'debit',
    active: true, reversed: false, status: 'posted', accountingConfirmed: true, accountingStatus: 'confirmed',
    date: '2026-08-07', createdAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z',
    source: 'order_payment_allocation_service', accountingBatchId: `BATCH-${id}`,
    idempotencyKey: `OPA:${id}:AR-SALE`
  };
}

test('CL-A3-REQ-010: A3 flag exists and defaults OFF', () => {
  const previous = process.env.PERF_CLOSEOUT_AR_BALANCE_BATCH_V1;
  delete process.env.PERF_CLOSEOUT_AR_BALANCE_BATCH_V1;
  try {
    assert.equal(typeof featureFlags.FLAGS.closeoutArBalanceBatchV1, 'function');
    assert.equal(featureFlags.FLAGS.closeoutArBalanceBatchV1(), false);
  } finally {
    if (previous !== undefined) process.env.PERF_CLOSEOUT_AR_BALANCE_BATCH_V1 = previous;
  }
});

test('CL-A3-REQ-002/004/005: 60 scopes use exactly two initial AR queries', async () => {
  const counters = { find: 0 };
  arLedgerReadService.setModelsForTest({ ArLedger: { find: () => queryReturning([], counters) } });
  try {
    const result = await arLedgerReadService.inspectActiveDebtReadModelLedgersForOrderScopes(
      Array.from({ length: 60 }, (_, i) => scope(i + 1)),
      { session: { id: 'tx' } }
    );
    assert.equal(counters.find, 2);
    assert.equal(result.byCanonicalOrderKey.size, 60);
    for (const item of result.byCanonicalOrderKey.values()) assert.equal(item.currentArBalance, 0);
  } finally { arLedgerReadService.setModelsForTest(null); }
});

test('CL-A3-REQ-006/011: same customer multiple orders partition by canonical identity', async () => {
  const counters = { find: 0 };
  const rows = [validArSale(1, 1000, 'C-SAME'), validArSale(2, 2000, 'C-SAME')];
  arLedgerReadService.setModelsForTest({ ArLedger: { find: () => queryReturning(rows, counters) } });
  try {
    const result = await arLedgerReadService.inspectActiveDebtReadModelLedgersForOrderScopes(
      [scope(1, 'C-SAME'), scope(2, 'C-SAME')],
      { session: { id: 'tx' } }
    );
    assert.equal(result.byCanonicalOrderKey.get('SO1').currentArBalance, 1000);
    assert.equal(result.byCanonicalOrderKey.get('SO2').currentArBalance, 2000);
    assert.equal(result.byCanonicalOrderKey.get('SO1').canonicalMatchedLedgerCount, 1);
    assert.equal(result.byCanonicalOrderKey.get('SO2').canonicalMatchedLedgerCount, 1);
  } finally { arLedgerReadService.setModelsForTest(null); }
});

test('CL-A3-REQ-003/011: shared alias across different canonical orders fails closed', async () => {
  const counters = { find: 0 };
  arLedgerReadService.setModelsForTest({ ArLedger: { find: () => queryReturning([], counters) } });
  try {
    const a = scope(1); const b = scope(2);
    a.identity.lookupKeys.push('SHARED'); b.identity.lookupKeys.push('SHARED');
    await assert.rejects(
      () => arLedgerReadService.inspectActiveDebtReadModelLedgersForOrderScopes([a, b], { session: { id: 'tx' } }),
      (err) => err && err.code === 'AR_BATCH_IDENTITY_ALIAS_COLLISION'
    );
    assert.equal(counters.find, 0);
  } finally { arLedgerReadService.setModelsForTest(null); }
});

test('CL-A3-REQ-003/011: missing and duplicate canonical identity fail closed', async () => {
  await assert.rejects(
    () => arLedgerReadService.inspectActiveDebtReadModelLedgersForOrderScopes([{ canonicalOrderKey: '', customerCode: 'C1', identity: { lookupKeys: [] } }]),
    (err) => err && err.code === 'AR_BATCH_CANONICAL_IDENTITY_MISSING'
  );
  const one = scope(1); const duplicate = { ...scope(2), canonicalOrderKey: 'SO1' };
  await assert.rejects(
    () => arLedgerReadService.inspectActiveDebtReadModelLedgersForOrderScopes([one, duplicate]),
    (err) => err && err.code === 'AR_BATCH_DUPLICATE_CANONICAL_IDENTITY'
  );
});

test('CL-A3-REQ-006/007: posted allocation rows can extend prefetched initial balance without duplicate counting', () => {
  const base = {
    lookupKeys: ['SO1', 'B000001'], rawMatchedLedgerCount: 0, rawActiveConfirmedLedgerCount: 0,
    canonicalMatchedLedgerCount: 0, excludedLedgerCount: 0, canonicalLedgers: [], rawActiveConfirmedLedgers: [], excludedLedgers: [],
    currentArBalance: 0,
    identity: scope(1).identity
  };
  const row = validArSale(1, 5000, 'C1');
  const DebtService = loadDebtService();
  const once = DebtService.mergePostedArLedgersIntoPrefetchedBalance(base, [row], { customerCode: 'C1' });
  const twice = DebtService.mergePostedArLedgersIntoPrefetchedBalance(once, [row], { customerCode: 'C1' });
  assert.equal(once.currentArBalance, 5000);
  assert.equal(once.canonicalMatchedLedgerCount, 1);
  assert.equal(twice.currentArBalance, 5000);
  assert.equal(twice.canonicalMatchedLedgerCount, 1);
});

test('CL-A3-REQ-011: allowed legacy alias partitions to its canonical order without customer-only assignment', async () => {
  const counters = { find: 0 };
  const legacy = scope(1, 'C-LEGACY');
  legacy.identity.lookupKeys.push('LEGACY-SRC-001');
  const row = { ...validArSale(1, 1500, 'C-LEGACY'), orderId: '', salesOrderId: '', orderCode: '', salesOrderCode: '', sourceId: 'LEGACY-SRC-001', sourceCode: 'LEGACY-SRC-001' };
  arLedgerReadService.setModelsForTest({ ArLedger: { find: () => queryReturning([row], counters) } });
  try {
    const result = await arLedgerReadService.inspectActiveDebtReadModelLedgersForOrderScopes([legacy], { session: { id: 'tx' } });
    assert.equal(result.byCanonicalOrderKey.get('SO1').currentArBalance, 1500);
    assert.equal(result.byCanonicalOrderKey.get('SO1').canonicalMatchedLedgerCount, 1);
  } finally { arLedgerReadService.setModelsForTest(null); }
});

test('CL-A3-REQ-011: same-looking alias across different customers fails closed instead of customer-based auto-merge', async () => {
  const counters = { find: 0 };
  arLedgerReadService.setModelsForTest({ ArLedger: { find: () => queryReturning([], counters) } });
  try {
    const a = scope(1, 'CUSTOMER-A'); const b = scope(2, 'CUSTOMER-B');
    a.identity.lookupKeys.push('LEGACY-SHARED'); b.identity.lookupKeys.push('LEGACY-SHARED');
    await assert.rejects(
      () => arLedgerReadService.inspectActiveDebtReadModelLedgersForOrderScopes([a, b], { session: { id: 'tx' } }),
      (err) => err && err.code === 'AR_BATCH_IDENTITY_ALIAS_COLLISION'
    );
    assert.equal(counters.find, 0);
  } finally { arLedgerReadService.setModelsForTest(null); }
});
