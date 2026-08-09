'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function resolved(relativePath) { return require.resolve(path.join(ROOT, relativePath)); }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function installStub(relativePath, exportsValue) {
  const filename = resolved(relativePath);
  const previous = require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports: exportsValue };
  return () => { if (previous) require.cache[filename] = previous; else delete require.cache[filename]; };
}

function getPath(obj, pathValue) {
  return String(pathValue).split('.').reduce((acc, key) => acc == null ? undefined : acc[key], obj);
}
function matchesValue(actual, expected) {
  if (expected instanceof RegExp) return expected.test(String(actual ?? ''));
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$in' in expected && !expected.$in.some((v) => String(v) === String(actual))) return false;
    if ('$nin' in expected && expected.$nin.some((v) => String(v) === String(actual))) return false;
    if ('$ne' in expected && actual === expected.$ne) return false;
    if ('$exists' in expected && (expected.$exists ? actual === undefined : actual !== undefined)) return false;
    return true;
  }
  return String(actual ?? '') === String(expected ?? '');
}
function matches(row, filter = {}) {
  for (const [key, expected] of Object.entries(filter || {})) {
    if (key === '$or') { if (!expected.some((part) => matches(row, part))) return false; continue; }
    if (key === '$and') { if (!expected.every((part) => matches(row, part))) return false; continue; }
    if (!matchesValue(getPath(row, key), expected)) return false;
  }
  return true;
}
function queryValue(factory) {
  let limitValue = null;
  return {
    session() { return this; }, select() { return this; }, sort() { return this; },
    limit(value) { limitValue = Number(value); return this; }, lean() { return this; },
    exec() {
      const value = factory();
      if (Array.isArray(value) && Number.isFinite(limitValue)) return Promise.resolve(clone(value.slice(0, limitValue)));
      return Promise.resolve(clone(value));
    },
    then(resolve, reject) { return this.exec().then(resolve, reject); }
  };
}

function canonicalLedger({ id, category, debit = 0, credit = 0, order, sourceType = 'ORDER_PAYMENT_ALLOCATION' }) {
  return {
    id, code: id, account: 'AR', category, ledgerType: category, entryType: 'normal', type: category.toLowerCase(),
    date: '2026-08-09', sourceType, sourceId: order.id, sourceCode: order.code,
    refType: 'ORDER_PAYMENT_ALLOCATION', refId: `REF-${id}`, refCode: `REF-${id}`,
    orderId: order.id, orderCode: order.code, salesOrderId: order.id, salesOrderCode: order.code,
    customerCode: order.customerCode, customerName: order.customerName,
    debit, credit, amount: Math.max(debit, credit), direction: debit > 0 ? 'debit' : 'credit', amountField: debit > 0 ? 'debit' : 'credit',
    status: 'posted', active: true, reversed: false, accountingConfirmed: true, accountingStatus: 'confirmed',
    idempotencyKey: `FIXTURE:${id}`, createdAt: '2026-08-09T00:00:00.000Z', updatedAt: '2026-08-09T00:00:00.000Z'
  };
}

function makeOrder({ id, code, customerCode, customerName, amount }) {
  return {
    id, code, orderId: id, orderCode: code, customerCode, customerName,
    salesStaffCode: 'SALE-R1', deliveryStaffCode: 'DEL-R1', deliveryDate: '2026-08-09',
    status: 'accounting_confirmed', accountingStatus: 'confirmed', accountingConfirmed: true,
    totalAmount: amount,
    deliveryCloseout: {
      id: `DCO-${code}-v1`, code: `DCO-${code}-v1`, closeoutVersion: 1, status: 'confirmed',
      originalAmount: amount, receivableAmount: amount, cashAmount: 0, bankAmount: 0, rewardAmount: 0, returnAmount: 0,
      rawDebtAmount: amount, finalDebtAmount: amount, debtAmount: amount
    },
    items: []
  };
}

function createHarness({ order, initialArRows, failEventPosting = false } = {}) {
  const corrections = new Map();
  const versions = [];
  const allocations = [];
  const arRows = initialArRows.map(clone);
  const counters = { correctionWrite: 0, versionWrite: 0, allocationWrite: 0, arEventWrite: 0 };

  const DeliveryCloseoutCorrection = {
    findOne(filter) { return queryValue(() => corrections.get(filter.idempotencyKey) || null); },
    findOneAndUpdate(filter, update) {
      return queryValue(() => {
        counters.correctionWrite += 1;
        if (!corrections.has(filter.idempotencyKey)) corrections.set(filter.idempotencyKey, clone(update.$setOnInsert));
        return corrections.get(filter.idempotencyKey);
      });
    },
    async updateOne(filter, update) {
      const row = [...corrections.values()].find((item) => item.id === filter.id);
      if (row && update.$set) Object.assign(row, clone(update.$set));
      return { matchedCount: row ? 1 : 0, modifiedCount: row ? 1 : 0 };
    }
  };
  const DeliveryCloseoutVersion = {
    find() { return queryValue(() => []); },
    findOne(filter = {}) { return queryValue(() => versions.find((row) => row.correctionId === filter.correctionId) || null); },
    findOneAndUpdate(_filter, update) {
      return queryValue(() => {
        counters.versionWrite += 1;
        const existing = versions.find((row) => row.correctionId === update.$setOnInsert.correctionId);
        if (existing) return existing;
        const row = clone(update.$setOnInsert);
        versions.push(row);
        return row;
      });
    }
  };

  const allocationService = {
    buildAllocationFromCloseout(currentOrder, version, options = {}) {
      const raw = Math.round(Number((version.receivableAmount ?? version.originalAmount) || 0) - Number(version.cashAmount || 0) - Number(version.bankAmount || 0) - Number(version.rewardAmount || 0) - Number(version.returnAmount || 0));
      const normalized = Math.abs(raw) <= 1000 ? 0 : Math.max(0, raw);
      return {
        allocationCode: options.allocationCode, idempotencyKey: options.idempotencyKey,
        orderId: currentOrder.id, orderCode: currentOrder.code, customerCode: currentOrder.customerCode, customerName: currentOrder.customerName,
        salesStaffCode: currentOrder.salesStaffCode, deliveryStaffCode: currentOrder.deliveryStaffCode,
        sourceType: options.sourceType, sourceId: options.sourceId, sourceCode: options.sourceCode, sourceVersion: options.sourceVersion,
        receivableAmount: version.receivableAmount ?? version.originalAmount, cashAmount: version.cashAmount, bankAmount: version.bankAmount,
        rewardAmount: version.rewardAmount, returnAmount: version.returnAmount, rawDebtAmount: raw, normalizedDebtAmount: normalized, debtAmount: normalized,
        zeroTolerance: 1000, status: 'posted'
      };
    },
    computeDebtBreakdown(allocation, { zeroTolerance = 1000 } = {}) {
      const rawDebtAmount = Math.round(Number(allocation.receivableAmount || 0) - Number(allocation.cashAmount || 0) - Number(allocation.bankAmount || 0) - Number(allocation.rewardAmount || 0) - Number(allocation.returnAmount || 0));
      const normalizedDebtAmount = Math.abs(rawDebtAmount) <= zeroTolerance ? 0 : Math.max(0, rawDebtAmount);
      return { rawDebtAmount, normalizedDebtAmount, debtAmount: normalizedDebtAmount, zeroTolerance, zeroToleranceApplied: rawDebtAmount !== normalizedDebtAmount, zeroToleranceAdjustmentAmount: rawDebtAmount - normalizedDebtAmount };
    },
    async upsertAllocation(allocation) { counters.allocationWrite += 1; allocations.push(clone(allocation)); return clone(allocation); }
  };

  const ArLedger = {
    find(filter = {}) { return queryValue(() => arRows.filter((row) => matches(row, filter))); },
    findOne(filter = {}) { return queryValue(() => arRows.find((row) => matches(row, filter)) || null); },
    findOneAndUpdate(filter = {}, update = {}) {
      return queryValue(() => {
        let row = arRows.find((item) => matches(item, filter)) || null;
        if (!row) {
          const incoming = clone(update.$setOnInsert || {});
          if (failEventPosting && incoming.category === 'AR-ADJUSTMENT') {
            const error = new Error('Injected actual arPosting persistence failure');
            error.code = 'TEST_AR_EVENT_PERSISTENCE_FAILURE';
            throw error;
          }
          row = incoming;
          arRows.push(row);
          if (incoming.category === 'AR-ADJUSTMENT') counters.arEventWrite += 1;
        }
        return row;
      });
    }
  };

  const transactionUtil = {
    async withOptionalMongoTransaction(_options, work) {
      const snapshot = {
        corrections: [...corrections.entries()].map(([key, value]) => [key, clone(value)]),
        versions: clone(versions), allocations: clone(allocations), arRows: clone(arRows), counters: clone(counters)
      };
      try {
        return await work({ id: 'R1-E2E-SESSION' });
      } catch (error) {
        corrections.clear(); snapshot.corrections.forEach(([key, value]) => corrections.set(key, value));
        versions.splice(0, versions.length, ...snapshot.versions);
        allocations.splice(0, allocations.length, ...snapshot.allocations);
        arRows.splice(0, arRows.length, ...snapshot.arRows);
        Object.assign(counters, snapshot.counters);
        throw error;
      }
    }
  };

  const restores = [
    installStub('src/utils/transaction.util.js', transactionUtil),
    installStub('src/models/SalesOrder.js', {}),
    installStub('src/models/ReturnOrder.js', { find() { return queryValue(() => []); } }),
    installStub('src/models/DeliveryCloseoutCorrection.js', DeliveryCloseoutCorrection),
    installStub('src/models/DeliveryCloseoutVersion.js', DeliveryCloseoutVersion),
    installStub('src/repositories/returnOrderRepository.js', { async upsert(payload) { return payload; } }),
    installStub('src/services/accounting/OrderPaymentAllocationService.js', allocationService),
    installStub('src/services/events/domainEventBus.js', { async emitDomainEventSafe() {} }),
    installStub('src/services/events/domainEventTypes.js', { EVENT_TYPES: { DELIVERY_CLOSEOUT_ADJUSTED: 'DELIVERY_CLOSEOUT_ADJUSTED' } }),
    installStub('src/domain/returns/ReturnMutationGuard.js', { async loadReturnMutationContext() { return {}; }, assertReturnMutationAllowed() { return true; } })
  ];

  // Actual event-delta service, actual arPosting.service and actual arLedgerRead.service.
  const arReadService = require('../src/services/arLedgerRead.service');
  const arPostingService = require('../src/services/arPosting.service');
  arReadService.setModelsForTest({ ArLedger });
  arPostingService.setModelsForTest({ ArLedger, SalesOrder: {}, AuditLog: {} });

  const servicePath = resolved('src/services/deliveryCloseoutCorrection.service.js');
  const previousService = require.cache[servicePath];
  delete require.cache[servicePath];
  const service = require(servicePath);

  return {
    service, corrections, versions, allocations, arRows, counters,
    restore() {
      arReadService.setModelsForTest(null);
      arPostingService.setModelsForTest(null);
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      restores.reverse().forEach((fn) => fn());
    }
  };
}

function optionsFor(order) {
  return {
    now: '2026-08-09T05:30:00.000Z', actor: 'r1-e2e-accountant',
    batchContextItem: { complete: true, orderLoaded: true, order, latestVersionLoaded: true, latestVersion: null }
  };
}

test('E2E R1: B0041181 correction -> allocation -> actual canonical event writer -> actual AR read model', async (t) => {
  const order = makeOrder({ id: 'SO-B0041181', code: 'B0041181', customerCode: '4499499', customerName: 'Đinh Mười', amount: 23800085 });
  const h = createHarness({ order, initialArRows: [canonicalLedger({ id: 'AR-SALE-B0041181', category: 'AR-SALE', debit: 23800085, order })] });
  t.after(h.restore);

  const result = await h.service.createCorrection({
    orderId: order.id, orderCode: order.code, changeType: 'POST_CLOSEOUT_CORRECTION',
    paymentCorrection: { correctedCashAmount: 22140000, correctedBankAmount: 0, correctedRewardAmount: 1660000 },
    reason: 'R1 B0041181 E2E', idempotencyKey: 'AR-SB-R1:B0041181:E2E'
  }, optionsFor(order));

  assert.equal(result.success, true);
  assert.equal(result.newCloseoutVersion.rawDebtAmount, 85);
  assert.equal(result.newCloseoutVersion.finalDebtAmount, 0);
  assert.equal(result.arEventDelta.arBefore, 23800085);
  assert.equal(result.arEventDelta.correctionOwnedDebtDelta, -23800000);
  assert.equal(result.arEventDelta.arAfter, 85);
  assert.equal(result.arEventDeltaLedger.category, 'AR-ADJUSTMENT');
  assert.equal(result.arEventDeltaLedger.credit, 23800000);
  assert.equal(h.arRows.some((row) => row.category === 'AR-DEBT-ADJUSTMENT'), false);
  assert.equal(h.counters.arEventWrite, 1);
});

test('E2E R1: confirmed receipt remains preserved instead of being revived to snapshot debt', async (t) => {
  const order = makeOrder({ id: 'SO-RECEIPT', code: 'R1-RECEIPT', customerCode: 'C-R1-RECEIPT', customerName: 'Receipt preservation', amount: 10000000 });
  const h = createHarness({
    order,
    initialArRows: [
      canonicalLedger({ id: 'AR-SALE-RECEIPT', category: 'AR-SALE', debit: 10000000, order }),
      canonicalLedger({ id: 'AR-RECEIPT-CONFIRMED', category: 'AR-RECEIPT-CASH', credit: 4000000, order })
    ]
  });
  t.after(h.restore);

  const result = await h.service.createCorrection({
    orderId: order.id, orderCode: order.code, changeType: 'POST_CLOSEOUT_CORRECTION',
    paymentCorrection: { correctedCashAmount: 2000000, correctedBankAmount: 0, correctedRewardAmount: 0 },
    reason: 'Preserve confirmed receipt', idempotencyKey: 'AR-SB-R1:RECEIPT:E2E'
  }, optionsFor(order));

  assert.equal(result.newCloseoutVersion.finalDebtAmount, 8000000, 'closeout snapshot itself is 8m');
  assert.equal(result.arEventDelta.arBefore, 6000000, 'canonical AR already includes 4m confirmed receipt');
  assert.equal(result.arEventDelta.correctionOwnedDebtDelta, -2000000);
  assert.equal(result.arEventDelta.arAfter, 4000000, 'AR must be 6m + correction delta, not forced back to 8m');
  assert.notEqual(result.arEventDelta.arAfter, result.newCloseoutVersion.finalDebtAmount);
  assert.equal(h.arRows.filter((row) => row.category === 'AR-RECEIPT-CASH').length, 1);
  assert.equal(h.arRows.filter((row) => row.category === 'AR-ADJUSTMENT').length, 1);
});

test('E2E R1: actual AR event persistence failure rolls back correction/version/allocation and AR rows', async (t) => {
  const order = makeOrder({ id: 'SO-ROLLBACK', code: 'R1-ROLLBACK', customerCode: 'C-R1-ROLLBACK', customerName: 'Rollback', amount: 5000000 });
  const opening = canonicalLedger({ id: 'AR-SALE-ROLLBACK', category: 'AR-SALE', debit: 5000000, order });
  const h = createHarness({ order, initialArRows: [opening], failEventPosting: true });
  t.after(h.restore);

  await assert.rejects(
    h.service.createCorrection({
      orderId: order.id, orderCode: order.code, changeType: 'POST_CLOSEOUT_CORRECTION',
      paymentCorrection: { correctedCashAmount: 1000000, correctedBankAmount: 0, correctedRewardAmount: 0 },
      reason: 'Actual writer rollback', idempotencyKey: 'AR-SB-R1:ROLLBACK:E2E'
    }, optionsFor(order)),
    (error) => error && error.code === 'TEST_AR_EVENT_PERSISTENCE_FAILURE'
  );

  assert.equal(h.corrections.size, 0);
  assert.equal(h.versions.length, 0);
  assert.equal(h.allocations.length, 0);
  assert.deepEqual(h.arRows, [opening]);
});
