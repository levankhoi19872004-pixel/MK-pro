'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const arReadService = require('../src/services/arLedgerRead.service');
const arPostingService = require('../src/services/arPosting.service');
const eventDeltaService = require('../src/services/accounting/CloseoutCorrectionArEventDeltaPostingService');
const { normalizeDebtAmount } = require('../src/constants/finance.constants');

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function getPath(obj, path) {
  return String(path).split('.').reduce((acc, key) => acc == null ? undefined : acc[key], obj);
}

function matchesValue(actual, expected) {
  if (expected instanceof RegExp) return expected.test(String(actual ?? ''));
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$in' in expected && !expected.$in.some((v) => String(v) === String(actual))) return false;
    if ('$nin' in expected && expected.$nin.some((v) => String(v) === String(actual))) return false;
    if ('$ne' in expected && actual === expected.$ne) return false;
    if ('$exists' in expected && (expected.$exists ? actual === undefined : actual !== undefined)) return false;
    if ('$gte' in expected && !(String(actual) >= String(expected.$gte))) return false;
    if ('$lte' in expected && !(String(actual) <= String(expected.$lte))) return false;
    return true;
  }
  return String(actual ?? '') === String(expected ?? '');
}

function matches(row, filter = {}) {
  for (const [key, expected] of Object.entries(filter || {})) {
    if (key === '$or') {
      if (!expected.some((part) => matches(row, part))) return false;
      continue;
    }
    if (key === '$and') {
      if (!expected.every((part) => matches(row, part))) return false;
      continue;
    }
    if (!matchesValue(getPath(row, key), expected)) return false;
  }
  return true;
}

function makeQuery(resolveValue) {
  let limitValue = null;
  return {
    session() { return this; },
    select() { return this; },
    sort() { return this; },
    limit(value) { limitValue = Number(value); return this; },
    lean() { return this; },
    exec() {
      const value = resolveValue();
      if (Array.isArray(value) && Number.isFinite(limitValue)) return Promise.resolve(clone(value.slice(0, limitValue)));
      return Promise.resolve(clone(value));
    },
    then(resolve, reject) { return this.exec().then(resolve, reject); }
  };
}

function createArLedgerModel(rows) {
  return {
    find(filter = {}) {
      return makeQuery(() => rows.filter((row) => matches(row, filter)));
    },
    findOne(filter = {}) {
      return makeQuery(() => rows.find((row) => matches(row, filter)) || null);
    },
    findOneAndUpdate(filter = {}, update = {}) {
      return makeQuery(() => {
        let row = rows.find((item) => matches(item, filter)) || null;
        if (!row) {
          row = clone(update.$setOnInsert || {});
          rows.push(row);
        }
        return row;
      });
    }
  };
}

function canonicalLedger({ id, category, debit = 0, credit = 0, orderId = 'SO-R1', orderCode = 'R1', customerCode = 'C-R1', sourceType = 'ORDER_PAYMENT_ALLOCATION' }) {
  return {
    id,
    code: id,
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    type: category.toLowerCase(),
    date: '2026-08-09',
    sourceType,
    sourceId: orderId,
    sourceCode: orderCode,
    refType: 'ORDER_PAYMENT_ALLOCATION',
    refId: `REF-${id}`,
    refCode: `REF-${id}`,
    orderId,
    orderCode,
    salesOrderId: orderId,
    salesOrderCode: orderCode,
    customerCode,
    customerName: 'R1 fixture',
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

function setupRows(rows) {
  const model = createArLedgerModel(rows);
  arReadService.setModelsForTest({ ArLedger: model });
  arPostingService.setModelsForTest({ ArLedger: model, SalesOrder: {}, AuditLog: {} });
  return model;
}

function teardown() {
  arReadService.setModelsForTest(null);
  arPostingService.setModelsForTest(null);
}

function baseOrder(overrides = {}) {
  return {
    id: 'SO-R1', code: 'R1', orderId: 'SO-R1', orderCode: 'R1',
    customerCode: 'C-R1', customerName: 'R1 fixture',
    salesStaffCode: 'SALE-1', deliveryStaffCode: 'DEL-1', deliveryDate: '2026-08-09',
    ...overrides
  };
}

function baseCorrection(overrides = {}) {
  return {
    id: 'DCOC-R1-2', code: 'DCOC-R1-2', correctionCode: 'DCOC-R1-2',
    newCloseoutVersion: 2,
    customerCode: 'C-R1', customerName: 'R1 fixture',
    salesOrderId: 'SO-R1', salesOrderCode: 'R1', orderId: 'SO-R1', orderCode: 'R1',
    cashDeltaAmount: 0, bankDeltaAmount: 0, rewardDeltaAmount: 0, returnAdjustmentAmount: 0,
    createdBy: 'r1-test', createdAt: '2026-08-09T00:00:00.000Z',
    ...overrides
  };
}

const fixedOptions = { actor: 'r1-test', now: '2026-08-09T00:00:00.000Z', zeroTolerance: 1000 };

test.afterEach(teardown);

test('GREEN: confirmed receipt is preserved; correction posts only its -2m cash EVENT_DELTA', async () => {
  const rows = [
    canonicalLedger({ id: 'AR-SALE-R1', category: 'AR-SALE', debit: 10000000 }),
    canonicalLedger({ id: 'AR-RECEIPT-R1', category: 'AR-RECEIPT-CASH', credit: 4000000 })
  ];
  setupRows(rows);

  const result = await eventDeltaService.postCorrectionEventDelta({
    order: baseOrder(),
    correction: baseCorrection({ cashDeltaAmount: 2000000 }),
    version: { closeoutVersion: 2 }
  }, fixedOptions);

  assert.equal(result.arBefore, 6000000);
  assert.equal(result.correctionOwnedDebtDelta, -2000000);
  assert.equal(result.expectedArAfter, 4000000);
  assert.equal(result.arAfter, 4000000);
  assert.equal(result.ledger.category, 'AR-ADJUSTMENT');
  assert.equal(result.ledger.credit, 2000000);
  assert.equal(result.ledger.debit, 0);
  assert.equal(rows.some((row) => row.category === 'AR-DEBT-ADJUSTMENT'), false);
  assert.equal(rows.filter((row) => row.category === 'AR-RECEIPT-CASH').length, 1, 'confirmed receipt remains untouched');
});

test('GREEN: B0041181 event delta yields raw AR 85 and Debt New zero-tolerance normalizes to 0', async () => {
  const order = baseOrder({ id: 'SO-B0041181', code: 'B0041181', orderId: 'SO-B0041181', orderCode: 'B0041181', customerCode: '4499499', customerName: 'Đinh Mười' });
  const rows = [canonicalLedger({
    id: 'AR-SALE-B0041181', category: 'AR-SALE', debit: 23800085,
    orderId: 'SO-B0041181', orderCode: 'B0041181', customerCode: '4499499'
  })];
  setupRows(rows);

  const result = await eventDeltaService.postCorrectionEventDelta({
    order,
    correction: baseCorrection({
      id: 'DCOC-B0041181-2', code: 'DCOC-B0041181-2', correctionCode: 'DCOC-B0041181-2',
      salesOrderId: 'SO-B0041181', salesOrderCode: 'B0041181', orderId: 'SO-B0041181', orderCode: 'B0041181',
      customerCode: '4499499', customerName: 'Đinh Mười',
      cashDeltaAmount: 22140000, rewardDeltaAmount: 1660000
    }),
    version: { closeoutVersion: 2 }
  }, fixedOptions);

  assert.equal(result.arBefore, 23800085);
  assert.equal(result.correctionOwnedDebtDelta, -23800000);
  assert.equal(result.arAfter, 85);
  assert.equal(normalizeDebtAmount(result.arAfter), 0);
  assert.equal(result.ledger.category, 'AR-ADJUSTMENT');
  assert.equal(result.ledger.credit, 23800000);
  assert.equal(rows.some((row) => row.category === 'AR-DEBT-ADJUSTMENT'), false);
});

test('GREEN: return-only correction posts no AR event; return ownership remains returnOrders/AR-RETURN', async () => {
  const rows = [canonicalLedger({ id: 'AR-SALE-R1', category: 'AR-SALE', debit: 10000000 })];
  setupRows(rows);

  const result = await eventDeltaService.postCorrectionEventDelta({
    order: baseOrder(),
    correction: baseCorrection({ returnAdjustmentAmount: 1500000 }),
    version: { closeoutVersion: 2 }
  }, fixedOptions);

  assert.equal(result.correctionOwnedDebtDelta, 0);
  assert.equal(result.skipped, true);
  assert.equal(result.returnDeltaExcluded, true);
  assert.equal(result.arBefore, 10000000);
  assert.equal(result.arAfter, 10000000);
  assert.equal(rows.length, 1);
  assert.equal(rows.some((row) => row.category === 'AR-ADJUSTMENT'), false);
});

test('GREEN: combined payment + return posts payment delta only and excludes return from AR event', async () => {
  const rows = [canonicalLedger({ id: 'AR-SALE-R1', category: 'AR-SALE', debit: 10000000 })];
  setupRows(rows);

  const result = await eventDeltaService.postCorrectionEventDelta({
    order: baseOrder(),
    correction: baseCorrection({ cashDeltaAmount: 2000000, returnAdjustmentAmount: 1500000 }),
    version: { closeoutVersion: 2 }
  }, fixedOptions);

  assert.equal(result.correctionOwnedDebtDelta, -2000000);
  assert.equal(result.arAfter, 8000000);
  assert.equal(result.ledger.credit, 2000000);
  assert.equal(result.ledger.metadata.returnDelta, 1500000);
  assert.equal(result.ledger.metadata.returnDeltaExcluded, true);
});

test('GREEN: reducing previously recorded payment produces debit AR-ADJUSTMENT', async () => {
  const rows = [canonicalLedger({ id: 'AR-SALE-R1', category: 'AR-SALE', debit: 10000000 })];
  setupRows(rows);

  const result = await eventDeltaService.postCorrectionEventDelta({
    order: baseOrder(),
    correction: baseCorrection({ cashDeltaAmount: -1250000 }),
    version: { closeoutVersion: 2 }
  }, fixedOptions);

  assert.equal(result.correctionOwnedDebtDelta, 1250000);
  assert.equal(result.arAfter, 11250000);
  assert.equal(result.ledger.debit, 1250000);
  assert.equal(result.ledger.credit, 0);
});

test('GREEN: direct writer retry is idempotent and does not duplicate AR effect', async () => {
  const rows = [canonicalLedger({ id: 'AR-SALE-R1', category: 'AR-SALE', debit: 10000000 })];
  setupRows(rows);
  const input = { order: baseOrder(), correction: baseCorrection({ cashDeltaAmount: 2000000 }), version: { closeoutVersion: 2 } };

  const first = await eventDeltaService.postCorrectionEventDelta(input, fixedOptions);
  const second = await eventDeltaService.postCorrectionEventDelta(input, fixedOptions);

  assert.equal(first.arAfter, 8000000);
  assert.equal(second.arBefore, 8000000);
  assert.equal(second.arAfter, 8000000);
  assert.equal(second.idempotent, true);
  assert.equal(rows.filter((row) => row.category === 'AR-ADJUSTMENT').length, 1);
});

test('GREEN: same idempotency identity with changed financial payload fails closed', async () => {
  const rows = [canonicalLedger({ id: 'AR-SALE-R1', category: 'AR-SALE', debit: 10000000 })];
  setupRows(rows);
  const firstCorrection = baseCorrection({ cashDeltaAmount: 2000000 });
  await eventDeltaService.postCorrectionEventDelta({ order: baseOrder(), correction: firstCorrection, version: { closeoutVersion: 2 } }, fixedOptions);

  await assert.rejects(
    eventDeltaService.postCorrectionEventDelta({
      order: baseOrder(),
      correction: { ...firstCorrection, cashDeltaAmount: 3000000 },
      version: { closeoutVersion: 2 }
    }, fixedOptions),
    (error) => error && error.code === 'AR_LEDGER_IDEMPOTENCY_PAYLOAD_CONFLICT'
  );
  assert.equal(rows.filter((row) => row.category === 'AR-ADJUSTMENT').length, 1);
});
