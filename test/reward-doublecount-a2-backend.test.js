'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const Money = require('../src/services/delivery/financial/deliveryMoneyContract');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');
const DeliveryPaymentStateReadService = require('../src/services/delivery/DeliveryPaymentStateReadService');

function canonicalOrder(overrides = {}) {
  return {
    id: 'SO-RWD-A2',
    _id: 'SO-RWD-A2',
    code: 'RED-REWARD-DOUBLECOUNT-001',
    orderCode: 'RED-REWARD-DOUBLECOUNT-001',
    customerCode: 'C-RWD-A2',
    customerName: 'Reward Fixture',
    totalAmount: 688113,
    cashAmount: 503000,
    bankAmount: 0,
    rewardAmount: 185000,
    ...overrides
  };
}

function returnState(amount = 0) {
  return {
    returnAmount: amount,
    returnStateSource: 'returnOrders',
    returnOrderIds: amount > 0 ? ['RO-RWD-A2'] : [],
    diagnostics: []
  };
}

function identityMap(row) {
  const keys = [row.orderId, row.orderCode, row.salesOrderId, row.salesOrderCode, row.sourceId, row.sourceCode]
    .filter(Boolean);
  return new Map(Array.from(new Set(keys)).map((key) => [key, row]));
}

function loadAllocationServiceWithStubs() {
  const target = require.resolve('../src/services/accounting/OrderPaymentAllocationService');
  delete require.cache[target];
  const originalLoad = Module._load;
  const posted = [];
  Module._load = function patched(request, parent, isMain) {
    if (request === '../../models/OrderPaymentAllocation') return {};
    if (request === '../../repositories/paymentRepository') return { findAll: async () => [] };
    if (request === '../arPosting.service') {
      return {
        postArLedgerEntry: async (row) => {
          posted.push({ ...row });
          return { ...row };
        }
      };
    }
    if (request === '../fundService') return {};
    if (request === '../../observability/closeoutQueryAudit') {
      return {
        withCloseoutAuditStage: (_name, fn) => fn(),
        updateCardinality: () => {}
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return { service: require(target), posted };
  } finally {
    Module._load = originalLoad;
  }
}

const allocationHarness = loadAllocationServiceWithStubs();
const AllocationService = allocationHarness.service;

function buildCloseout(order, returnAmount = 0) {
  const returnOrders = returnAmount > 0 ? [{
    id: 'RO-RWD-A2', code: 'RO-RWD-A2', status: 'confirmed',
    totalReturnAmount: returnAmount,
    sourceOrderId: order.id, sourceOrderCode: order.code,
    inventoryPosted: true, inventoryState: 'received', inventoryStatus: 'received'
  }] : [];
  return DeliveryCloseoutService.buildCloseout(order, returnOrders, [], {
    status: 'accounting_confirmed', actor: 'A2-TEST', version: 1,
    now: '2026-08-07T08:20:00+07:00'
  });
}

test('A2-001 RED fixture turns -184887 into debtRaw=113 and debt=0 with reward counted once', () => {
  const closeout = buildCloseout(canonicalOrder());
  assert.equal(closeout.rewardAmount, 185000);
  assert.equal(closeout.offsetAmount, 0);
  assert.equal(closeout.rewardOffsetTotalAmount, 185000);
  assert.equal(closeout.rawFinalDebtAmount, 113);
  assert.equal(closeout.finalDebtAmount, 0);
  assert.equal(closeout.rewardOffsetContractVersion, 2);
  assert.equal(closeout.rewardOffsetSemantics, Money.REWARD_OFFSET_SEMANTICS.INDEPENDENT);
});

test('A2-002 parity fixture 5,213,244 - 4,333,000 - 880,000 = 244 normalizes to 0', () => {
  const closeout = buildCloseout(canonicalOrder({
    id: 'SO-PARITY-2', code: 'RWD-PARITY-2', orderCode: 'RWD-PARITY-2',
    totalAmount: 5213244, cashAmount: 4333000, rewardAmount: 880000
  }));
  assert.equal(closeout.rewardAmount, 880000);
  assert.equal(closeout.offsetAmount, 0);
  assert.equal(closeout.rawFinalDebtAmount, 244);
  assert.equal(closeout.finalDebtAmount, 0);
});

test('A2-003 reward only, offset only, and independent reward+offset preserve canonical business components', () => {
  const rewardOnly = buildCloseout(canonicalOrder({ totalAmount: 10000, cashAmount: 1000, rewardAmount: 2000, offsetAmount: undefined }));
  assert.deepEqual([rewardOnly.rewardAmount, rewardOnly.offsetAmount, rewardOnly.rawFinalDebtAmount], [2000, 0, 7000]);

  const offsetOnly = buildCloseout(canonicalOrder({ totalAmount: 10000, cashAmount: 1000, rewardAmount: undefined, offsetAmount: 3000 }));
  assert.deepEqual([offsetOnly.rewardAmount, offsetOnly.offsetAmount, offsetOnly.rawFinalDebtAmount], [0, 3000, 6000]);

  const both = buildCloseout(canonicalOrder({ totalAmount: 10000, cashAmount: 1000, rewardAmount: 2000, offsetAmount: 3000 }));
  assert.deepEqual([both.rewardAmount, both.offsetAmount, both.rewardOffsetTotalAmount, both.rawFinalDebtAmount], [2000, 3000, 5000, 4000]);
});

test('A2-004 legacy rewardAmount == offsetAmount mirror is normalized once when debt invariant proves aggregate semantics', () => {
  const legacyOrder = canonicalOrder({
    accountingConfirmed: true,
    cashAmount: 999999,
    rewardAmount: 999999,
    deliveryCloseout: {
      version: 1,
      status: 'accounting_confirmed',
      originalAmount: 688113,
      cashAmount: 503000,
      bankAmount: 0,
      rewardAmount: 185000,
      offsetAmount: 185000,
      returnedAmount: 0,
      rawFinalDebtAmount: 113,
      finalDebtAmount: 0
    }
  });
  const state = DeliveryPaymentStateReadService.resolvePaymentStateForOrder(
    legacyOrder, new Map(), new Map(), returnState(0)
  );
  assert.equal(state.paymentStateSource, 'salesOrders.deliveryCloseout');
  assert.equal(state.rewardAmount, 185000);
  assert.equal(state.offsetAmount, 0);
  assert.equal(state.handledRewardOffsetAmount, 185000);
  assert.equal(state.totalCollectedAmount, 688000);
  assert.equal(state.debtRaw, 113);
  assert.equal(state.debtAmount, 0);
  assert.equal(state.rewardOffsetClassification, 'safe_duplicate_alias');
  assert.ok(state.diagnostics.some((row) => row.code === 'LEGACY_REWARD_OFFSET_NORMALIZED'));
});

test('A2-005 legacy aggregate with reward + independent offset is split by invariant without losing the independent amount', () => {
  const diagnostics = [];
  const normalized = Money.resolveRewardOffsetComponents({
    originalAmount: 10000,
    cashAmount: 1000,
    bankAmount: 0,
    rewardAmount: 2000,
    offsetAmount: 5000,
    returnedAmount: 0,
    rawFinalDebtAmount: 4000,
    finalDebtAmount: 4000
  }, { diagnostics, sourceName: 'legacy.closeout' });
  assert.equal(normalized.rewardAmount, 2000);
  assert.equal(normalized.offsetAmount, 3000);
  assert.equal(normalized.handledRewardOffsetAmount, 5000);
  assert.equal(normalized.classification, 'legacy_offset_includes_reward');
});

test('A2-006 explicit v2 reward + independent offset remains independent even when values happen to be equal', () => {
  const normalized = Money.resolveRewardOffsetComponents({
    rewardAmount: 2000,
    offsetAmount: 2000,
    rewardOffsetContractVersion: 2,
    rewardOffsetSemantics: 'independent_components'
  }, { diagnostics: [], sourceName: 'v2.closeout' });
  assert.equal(normalized.rewardAmount, 2000);
  assert.equal(normalized.offsetAmount, 2000);
  assert.equal(normalized.handledRewardOffsetAmount, 4000);
  assert.equal(normalized.classification, 'independent_reward_offset');
  assert.equal(normalized.ambiguous, false);
});

test('A2-007 ambiguous legacy pair is not silently deduped and emits diagnostics', () => {
  const diagnostics = [];
  const normalized = Money.resolveRewardOffsetComponents({ rewardAmount: 2000, offsetAmount: 2000 }, {
    diagnostics, sourceName: 'legacy.ambiguous'
  });
  assert.equal(normalized.handledRewardOffsetAmount, 4000);
  assert.equal(normalized.classification, 'ambiguous');
  assert.equal(normalized.ambiguous, true);
  assert.ok(diagnostics.some((row) => row.code === 'AMBIGUOUS_LEGACY_REWARD_OFFSET'));
});

test('A2-008 explicit zero is authoritative and does not fall through to stale aliases', () => {
  const rewardZero = Money.resolveRewardOffsetComponents({ rewardAmount: 0, bonusAmount: 999 }, { diagnostics: [] });
  assert.equal(rewardZero.rewardAmount, 0);
  assert.equal(rewardZero.handledRewardOffsetAmount, 0);

  const offsetZero = Money.resolveRewardOffsetComponents({ offsetAmount: 0, debtOffsetAmount: 999 }, { diagnostics: [] });
  assert.equal(offsetZero.offsetAmount, 0);
  assert.equal(offsetZero.handledRewardOffsetAmount, 0);

  const bothZero = Money.resolveRewardOffsetComponents({ rewardAmount: 0, offsetAmount: 0 }, { diagnostics: [] });
  assert.equal(bothZero.handledRewardOffsetAmount, 0);
});

test('A2-009 null/undefined/NaN aliases are guarded while a later valid alias can be used', () => {
  const diagnostics = [];
  const normalized = Money.resolveRewardOffsetComponents({ rewardAmount: NaN, bonusAmount: 500, offsetAmount: null }, {
    diagnostics, sourceName: 'invalid-alias'
  });
  assert.equal(normalized.rewardAmount, 500);
  assert.equal(normalized.offsetAmount, 0);
  assert.ok(diagnostics.some((row) => row.code === 'INVALID_MONEY' && row.field === 'rewardAmount'));

  const absent = Money.resolveRewardOffsetComponents({ rewardAmount: undefined, offsetAmount: undefined }, { diagnostics: [] });
  assert.equal(absent.handledRewardOffsetAmount, 0);
});

test('A2-010 negative reward/offset is rejected by writer contract', () => {
  assert.throws(
    () => buildCloseout(canonicalOrder({ totalAmount: 10000, cashAmount: 1000, rewardAmount: -1 })),
    (err) => err && err.code === 'CONTRACT_VALIDATION_ERROR'
  );
  assert.throws(
    () => buildCloseout(canonicalOrder({ totalAmount: 10000, cashAmount: 1000, rewardAmount: 0, offsetAmount: -1 })),
    (err) => err && err.code === 'CONTRACT_VALIDATION_ERROR'
  );
});

test('A2-011 Debt Zero Tolerance is exactly ±1000', () => {
  assert.deepEqual(
    [Money.calculateDebt({ receivableAmount: 10000, cashAmount: 9000 }).debtRaw, Money.calculateDebt({ receivableAmount: 10000, cashAmount: 9000 }).debtAmount],
    [1000, 0]
  );
  assert.deepEqual(
    [Money.calculateDebt({ receivableAmount: 10000, cashAmount: 11000 }).debtRaw, Money.calculateDebt({ receivableAmount: 10000, cashAmount: 11000 }).debtAmount],
    [-1000, 0]
  );
  assert.equal(Money.calculateDebt({ receivableAmount: 10000, cashAmount: 8999 }).debtAmount, 1001);
  assert.equal(Money.calculateDebt({ receivableAmount: 10000, cashAmount: 11001 }).debtAmount, -1001);
});

test('A2-012 initial confirmed embedded closeout version authorizes current allocation instead of falling back', () => {
  const order = canonicalOrder({
    accountingConfirmed: true,
    deliveryCloseout: {
      version: 1,
      status: 'accounting_confirmed',
      originalAmount: 688113,
      cashAmount: 503000,
      bankAmount: 0,
      rewardAmount: 185000,
      offsetAmount: 185000,
      rawFinalDebtAmount: 113,
      finalDebtAmount: 0
    }
  });
  const allocation = {
    allocationCode: 'OPA-RWD-A2',
    orderId: order.id,
    orderCode: order.code,
    sourceId: order.id,
    sourceCode: order.code,
    sourceVersion: 1,
    status: 'posted', active: true,
    receivableAmount: 688113,
    cashAmount: 503000,
    bankAmount: 0,
    rewardAmount: 185000,
    returnAmount: 0,
    rawDebtAmount: 113,
    normalizedDebtAmount: 0,
    debtAmount: 0
  };
  const state = DeliveryPaymentStateReadService.resolvePaymentStateForOrder(
    order, new Map(), identityMap(allocation), returnState(0)
  );
  assert.equal(state.paymentStateSource, 'orderPaymentAllocations.current');
  assert.equal(state.paymentVersion, 1);
  assert.equal(state.debtRaw, 113);
  assert.equal(state.debtAmount, 0);
  assert.ok(state.diagnostics.some((row) => row.code === 'EMBEDDED_CLOSEOUT_VERSION_AUTHORITY'));
  assert.equal(state.diagnostics.some((row) => row.code === 'ALLOCATION_VERSION_UNVERIFIED'), false);
});

test('A2-013 allocation stores one canonical handled reward/offset total and AR emits exactly one reward business row', () => {
  const closeout = buildCloseout(canonicalOrder({ totalAmount: 10000, cashAmount: 1000, rewardAmount: 2000, offsetAmount: 3000 }));
  const allocation = AllocationService.buildAllocationFromCloseout(canonicalOrder({
    totalAmount: 10000, cashAmount: 1000, rewardAmount: 2000, offsetAmount: 3000
  }), closeout, { sourceId: 'SO-RWD-A2', sourceCode: 'RWD-A2', sourceVersion: 1, closeoutScopeHash: 'rwd-a2' });
  assert.equal(allocation.rewardComponentAmount, 2000);
  assert.equal(allocation.independentOffsetAmount, 3000);
  assert.equal(allocation.rewardAmount, 5000);
  assert.equal(allocation.rawDebtAmount, 4000);
  const rows = AllocationService.buildArLedgerRows(allocation);
  const rewardRows = rows.filter((row) => row.category === 'AR-REWARD-ALLOWANCE');
  assert.equal(rewardRows.length, 1);
  assert.equal(rewardRows[0].credit, 5000);
});

test('A2-014 retry of same closeout/AR idempotency keys applies zero duplicate ledger rows', async () => {
  allocationHarness.posted.length = 0;
  const closeout = buildCloseout(canonicalOrder());
  const allocation = AllocationService.buildAllocationFromCloseout(canonicalOrder(), closeout, {
    sourceId: 'SO-RWD-A2', sourceCode: 'RED-REWARD-DOUBLECOUNT-001', sourceVersion: 1, closeoutScopeHash: 'rwd-a2'
  });
  const first = await AllocationService.postArLedgersFromAllocation(allocation, {
    existingArLedgerByIdempotencyKey: new Map(),
    now: '2026-08-07T08:20:00+07:00'
  });
  const firstCreated = first.postingResults.filter((row) => row.created).length;
  const existing = new Map(first.map((row) => [row.idempotencyKey, row]));
  const postedAfterFirst = allocationHarness.posted.length;
  const second = await AllocationService.postArLedgersFromAllocation(allocation, {
    existingArLedgerByIdempotencyKey: existing,
    now: '2026-08-07T08:20:00+07:00'
  });
  assert.ok(firstCreated > 0);
  assert.equal(second.postingResults.filter((row) => row.created).length, 0);
  assert.equal(allocationHarness.posted.length, postedAfterFirst);
  assert.equal(second.filter((row) => row.category === 'AR-REWARD-ALLOWANCE').length, 1);
});

test('A2-015 return/payment allocation parity uses Return SSoT and has zero debt deviation', () => {
  const order = canonicalOrder({
    totalAmount: 10000,
    cashAmount: 1000,
    rewardAmount: 2000,
    offsetAmount: 3000,
    accountingConfirmed: true
  });
  const closeout = buildCloseout(order, 1000);
  order.deliveryCloseout = closeout;
  const allocation = AllocationService.buildAllocationFromCloseout(order, closeout, {
    sourceId: order.id, sourceCode: order.code, sourceVersion: 1, closeoutScopeHash: 'rwd-return-parity'
  });
  const state = DeliveryPaymentStateReadService.resolvePaymentStateForOrder(
    order, new Map(), identityMap(allocation), returnState(1000)
  );
  assert.equal(allocation.rawDebtAmount, 3000);
  assert.equal(state.debtRaw, 3000);
  assert.equal(state.debtRaw - allocation.rawDebtAmount, 0);
  assert.equal(state.returnStateSource, 'returnOrders');
  assert.equal(state.paymentStateSource, 'orderPaymentAllocations.current');
});

test('A2-016 legacy audit classifier separates safe duplicate, ambiguous, and independent records without mutation', () => {
  const audit = require('../scripts/audit-reward-offset-legacy');
  const safe = audit.classifyLegacyCloseout({ code: 'SAFE', deliveryCloseout: {
    originalAmount: 688113, cashAmount: 503000, bankAmount: 0,
    rewardAmount: 185000, offsetAmount: 185000, rawFinalDebtAmount: 113, finalDebtAmount: 0
  } });
  const ambiguous = audit.classifyLegacyCloseout({ code: 'AMB', deliveryCloseout: {
    rewardAmount: 100, offsetAmount: 100
  } });
  const independent = audit.classifyLegacyCloseout({ code: 'IND', deliveryCloseout: {
    rewardAmount: 100, offsetAmount: 100,
    rewardOffsetContractVersion: 2, rewardOffsetSemantics: 'independent_components'
  } });
  assert.equal(safe.auditClass, 'safe_duplicate_alias');
  assert.equal(ambiguous.auditClass, 'ambiguous');
  assert.equal(independent.auditClass, 'independent_reward_offset');
  assert.deepEqual(audit.summarize([safe, ambiguous, independent]).counts, {
    scanned: 3,
    safe_duplicate_alias: 1,
    ambiguous: 1,
    independent_reward_offset: 1,
    unaffected_single_component: 0
  });
});

test('A2-017 source guard: backend consumers use canonical handled amount instead of ad-hoc reward+offset double count', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const files = [
    'src/services/accounting/DeliveryCloseoutService.js',
    'src/services/accounting/OrderPaymentAllocationService.js',
    'src/services/accounting/OrderPaymentDebtReconcileService.js',
    'src/services/delivery/DeliveryPaymentStateReadService.js',
    'src/services/delivery/deliveryTodayKpiCalculator.js',
    'src/services/v2/deliveryTodayNew.service.js',
    'src/services/deliveryCloseoutCorrection.service.js',
    'src/services/mobile/mobileSalesOrderTracking.service.js'
  ];
  const root = path.resolve(__dirname, '..');
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /rewardAmount\s*\+\s*offsetAmount|offsetAmount\s*\+\s*rewardAmount/, `${file} must not sum raw reward+offset directly`);
  }
});

test('A2-018 Delivery Today backend KPI renders canonical reward total once for legacy mirror fixture', () => {
  const { calculateDeliveryTodayKpi } = require('../src/services/delivery/deliveryTodayKpiCalculator');
  const diagnostics = [];
  const legacy = Money.readPaymentBreakdown({
    receivableAmount: 688113,
    cashAmount: 503000,
    bankAmount: 0,
    returnAmount: 0,
    rewardAmount: 185000,
    offsetAmount: 185000,
    rawFinalDebtAmount: 113,
    finalDebtAmount: 0,
    zeroTolerance: 1000
  }, { diagnostics, sourceName: 'A2-018.legacyCloseout' });
  const kpi = calculateDeliveryTodayKpi({
    receivableAmount: 688113,
    cashAmount: 503000,
    bankAmount: 0,
    rewardAmount: legacy.rewardAmount,
    offsetAmount: legacy.offsetAmount,
    handledRewardOffsetAmount: legacy.handledRewardOffsetAmount,
    returnAmount: 0
  });
  assert.equal(legacy.handledRewardOffsetAmount, 185000);
  assert.equal(kpi.handledRewardOffsetAmount, 185000);
  assert.equal(kpi.sourceBreakdown.rewardFormulaAmount, 185000);
  assert.equal(kpi.rawComputedDebtAmount, 113);
  assert.equal(kpi.debtAmount, 0);
});
