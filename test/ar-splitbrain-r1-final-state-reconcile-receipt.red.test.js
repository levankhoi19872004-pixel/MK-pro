'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function modulePath(rel) { return require.resolve(path.join(ROOT, rel)); }

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function matchesValue(actual, expected) {
  if (expected instanceof RegExp) return expected.test(String(actual ?? ''));
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$in' in expected) return expected.$in.some((v) => String(v) === String(actual));
    if ('$nin' in expected) return !expected.$nin.some((v) => String(v) === String(actual));
    if ('$ne' in expected) return actual !== expected.$ne;
    if ('$exists' in expected) return expected.$exists ? actual !== undefined : actual === undefined;
  }
  return String(actual ?? '') === String(expected ?? '');
}
function matches(row, filter = {}) {
  for (const [key, expected] of Object.entries(filter || {})) {
    if (key === '$or') { if (!expected.some((sub) => matches(row, sub))) return false; continue; }
    if (key === '$and') { if (!expected.every((sub) => matches(row, sub))) return false; continue; }
    const actual = key.split('.').reduce((acc, part) => acc == null ? undefined : acc[part], row);
    if (!matchesValue(actual, expected)) return false;
  }
  return true;
}
function queryValue(value) {
  return {
    session() { return this; }, select() { return this; }, sort() { return this; }, limit() { return this; },
    lean() { return Promise.resolve(clone(value)); },
    exec() { return this.lean(); },
    then(resolve, reject) { return this.lean().then(resolve, reject); }
  };
}
function queryOne(rows, filter = {}) {
  const row = rows.find((item) => matches(item, filter)) || null;
  return queryValue(row);
}

function createArLedgerModel(rows) {
  return {
    find(filter) { return queryValue(rows.filter((item) => matches(item, filter))); },
    findOne(filter) { return queryOne(rows, filter); },
    findOneAndUpdate(filter, update) {
      let row = rows.find((item) => item.idempotencyKey === filter.idempotencyKey) || null;
      if (!row) {
        row = clone(update.$setOnInsert || {});
        rows.push(row);
      }
      return {
        session() { return this; },
        lean() { return Promise.resolve(clone(row)); },
        exec() { return this.lean(); },
        then(resolve, reject) { return this.lean().then(resolve, reject); }
      };
    }
  };
}

function canonicalLedger({ id, category, debit = 0, credit = 0 }) {
  return {
    id,
    code: id,
    account: 'AR',
    category,
    ledgerType: category,
    type: category.toLowerCase(),
    date: '2026-08-09',
    sourceType: 'ORDER_PAYMENT_ALLOCATION',
    sourceId: 'SO-R1-RECEIPT',
    sourceCode: 'R1-RECEIPT',
    refType: 'SALES_ORDER',
    refId: 'SO-R1-RECEIPT',
    refCode: 'R1-RECEIPT',
    orderId: 'SO-R1-RECEIPT',
    orderCode: 'R1-RECEIPT',
    salesOrderId: 'SO-R1-RECEIPT',
    salesOrderCode: 'R1-RECEIPT',
    customerCode: 'C-R1',
    customerName: 'Receipt preservation fixture',
    debit,
    credit,
    amount: Math.max(debit, credit),
    direction: debit > 0 ? 'debit' : 'credit',
    amountField: debit > 0 ? 'debit' : 'credit',
    status: 'posted',
    active: true,
    reversed: false,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    idempotencyKey: `FIXTURE:${id}`,
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z'
  };
}

test('R1 contract audit: final-state reconcile demonstrably revives confirmed-receipt debt and must stay out of correction runtime', async (t) => {
  const opaPath = modulePath('src/services/accounting/OrderPaymentAllocationService.js');
  const reconcilePath = modulePath('src/services/accounting/OrderPaymentDebtReconcileService.js');
  const arReadPath = modulePath('src/services/arLedgerRead.service.js');
  const arPostingPath = modulePath('src/services/arPosting.service.js');

  const previousOpa = require.cache[opaPath];
  require.cache[opaPath] = {
    id: opaPath,
    filename: opaPath,
    loaded: true,
    exports: {
      computeDebtBreakdown(allocation, { zeroTolerance = 1000 } = {}) {
        const rawDebtAmount = Math.round(
          Number(allocation.receivableAmount || 0)
          - Number(allocation.cashAmount || 0)
          - Number(allocation.bankAmount || 0)
          - Number(allocation.rewardAmount || 0)
          - Number(allocation.returnAmount || 0)
        );
        const normalizedDebtAmount = Math.abs(rawDebtAmount) <= zeroTolerance ? 0 : Math.max(0, rawDebtAmount);
        return { rawDebtAmount, normalizedDebtAmount, debtAmount: normalizedDebtAmount, zeroTolerance, zeroToleranceApplied: rawDebtAmount !== normalizedDebtAmount, zeroToleranceAdjustmentAmount: rawDebtAmount - normalizedDebtAmount };
      }
    }
  };
  delete require.cache[reconcilePath];
  delete require.cache[arReadPath];
  delete require.cache[arPostingPath];

  const arReadService = require(arReadPath);
  const arPostingService = require(arPostingPath);
  const reconcileService = require(reconcilePath); // actual service under test; never stubbed

  const rows = [
    canonicalLedger({ id: 'AR-DEBT-OPEN-R1', category: 'AR-DEBT-OPEN', debit: 10000000 }),
    canonicalLedger({ id: 'AR-DEBT-PAYMENT-R1-CONFIRMED', category: 'AR-DEBT-PAYMENT', credit: 4000000 })
  ];
  const model = createArLedgerModel(rows);
  arReadService.setModelsForTest({ ArLedger: model });
  arPostingService.setModelsForTest({ ArLedger: model, SalesOrder: {}, AuditLog: {} });

  const originalInspect = arReadService.inspectActiveDebtReadModelLedgersByOrderKeys;
  arReadService.inspectActiveDebtReadModelLedgersByOrderKeys = async () => ({
    lookupKeys: ['SO-R1-RECEIPT', 'R1-RECEIPT'],
    rawMatchedLedgerCount: rows.length,
    rawActiveConfirmedLedgerCount: rows.length,
    canonicalMatchedLedgerCount: rows.length,
    excludedLedgerCount: 0,
    canonicalLedgers: rows.map(clone),
    rawActiveConfirmedLedgers: rows.map(clone),
    excludedLedgers: []
  });

  t.after(() => {
    arReadService.inspectActiveDebtReadModelLedgersByOrderKeys = originalInspect;
    arReadService.setModelsForTest(null);
    arPostingService.setModelsForTest(null);
    delete require.cache[reconcilePath];
    if (previousOpa) require.cache[opaPath] = previousOpa; else delete require.cache[opaPath];
  });

  const arBefore = 6000000; // 10m opening - 4m confirmed receipt
  const correctionDebtDelta = -2000000; // correction adds 2m cash
  const correctArAfter = arBefore + correctionDebtDelta; // 4m; receipt must remain preserved

  const result = await reconcileService.reconcileOrderDebt({
    order: { id: 'SO-R1-RECEIPT', code: 'R1-RECEIPT', customerCode: 'C-R1' },
    allocation: {
      allocationCode: 'OPA-R1-V2', idempotencyKey: 'OPA:R1:V2',
      orderId: 'SO-R1-RECEIPT', orderCode: 'R1-RECEIPT', customerCode: 'C-R1',
      receivableAmount: 10000000, cashAmount: 2000000, bankAmount: 0, rewardAmount: 0, returnAmount: 0,
      sourceVersion: 2, zeroTolerance: 1000
    },
    apply: true,
    zeroTolerance: 1000,
    actor: 'r1-red-test',
    sourceType: 'R1_AUDIT_SIMULATION',
    sourceId: 'DCOC-R1-V2',
    sourceCode: 'DCOC-R1-V2'
  });

  // This service is intentionally kept for repair/other audited callers, but this
  // test proves why post-closeout correction must not invoke it at runtime.
  assert.equal(result.currentArBalance, arBefore);
  assert.equal(result.afterBalance, 8000000, 'final-state reconcile targets the 8m snapshot debt');
  assert.notEqual(result.afterBalance, correctArAfter, 'final-state reconcile is unsafe after confirmed receipts');
  assert.equal(rows.some((row) => row.category === 'AR-DEBT-ADJUSTMENT'), true, 'legacy reconcile still emits the retired category');

  const fs = require('node:fs');
  const correctionSource = fs.readFileSync(path.join(ROOT, 'src/services/deliveryCloseoutCorrection.service.js'), 'utf8');
  assert.doesNotMatch(correctionSource, /OrderPaymentDebtReconcileService\.reconcileOrderDebt/);
  assert.match(correctionSource, /CloseoutCorrectionArEventDeltaPostingService\.postCorrectionEventDelta/);
});


test('R1 defense-in-depth: reconcile service explicitly rejects correction runtime source types before balance work', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.join(ROOT, 'src/services/accounting/OrderPaymentDebtReconcileService.js'), 'utf8');
  assert.match(source, /FINAL_STATE_AR_RECONCILE_FORBIDDEN_FOR_CORRECTION/);
  assert.match(source, /DELIVERY_CLOSEOUT_CORRECTION/);
  assert.match(source, /BULK_DELIVERY_ADJUSTMENT_COMMIT/);
});
