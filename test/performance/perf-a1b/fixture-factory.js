'use strict';

const BATCH_SIZES = Object.freeze([1, 16, 26, 60, 100]);
const ZERO_TOLERANCE = 1000;
const UNDEFINED_MARKER = '__UNDEFINED__';
const NAN_MARKER = '__NaN__';

const CASES = Object.freeze([
  { id: 'current-allocation-valid', covers: ['Current allocation hợp lệ'], allocationMode: 'valid' },
  { id: 'allocation-stale', covers: ['Allocation stale'], allocationMode: 'stale' },
  { id: 'allocation-version-mismatch', covers: ['Allocation version mismatch'], allocationMode: 'version_mismatch' },
  { id: 'latest-closeout-version', covers: ['Latest closeout version'], allocationMode: 'missing', latestVersionMode: 'present' },
  { id: 'legacy-fallback', covers: ['Legacy fallback'], allocationMode: 'missing', latestVersionMode: 'missing' },
  { id: 'zero-money', covers: ['Giá trị tiền bằng 0'], moneyOverride: { cashAmount: 0, bankAmount: 0, rewardAmount: 0, returnAmount: 0 } },
  { id: 'null-money', covers: ['Null'], moneyOverride: { cashAmount: null } },
  { id: 'undefined-money', covers: ['Undefined'], moneyOverride: { bankAmount: UNDEFINED_MARKER } },
  { id: 'nan-money', covers: ['NaN'], moneyOverride: { rewardAmount: NAN_MARKER } },
  { id: 'duplicate-identity', covers: ['Duplicate identity'], duplicateReturnIdentity: true },
  { id: 'negative-money', covers: ['Negative money'], moneyOverride: { cashAmount: -5000 }, validationError: 'NEGATIVE_MONEY_GUARD' },
  { id: 'debt-zero-tolerance-negative', covers: ['Debt Zero Tolerance ±1.000'], arDeltaFromExpected: -1000 },
  { id: 'debt-zero-tolerance-positive', covers: ['Debt Zero Tolerance ±1.000'], arDeltaFromExpected: 1000 },
  { id: 'with-return', covers: ['Có return'], returnAmount: 12000 },
  { id: 'without-return', covers: ['Không return'], returnAmount: 0 },
  { id: 'existing-ar-ledger', covers: ['Existing AR ledger'], arBalanceMode: 'expected' },
  { id: 'existing-idempotency-ledger', covers: ['Existing idempotency ledger'], existingIdempotency: true },
  { id: 'no-ledger-post', covers: ['Đơn không cần post ledger'], arDeltaFromExpected: 500 },
  { id: 'correction-required', covers: ['Đơn cần correction'], arBalanceMode: 'zero' },
  { id: 'mid-batch-error', covers: ['Một đơn lỗi giữa batch'], injectedError: 'REPOSITORY_FAILURE_AFTER_PREFLIGHT' },
  { id: 'duplicate-canonical-input', covers: ['Hai input trỏ cùng canonical order'], duplicateCanonicalOf: 0 }
]);

function clone(value) {
  return structuredClone(value);
}

function decodeSpecial(value) {
  if (value === UNDEFINED_MARKER) return undefined;
  if (value === NAN_MARKER) return Number.NaN;
  return value;
}

function baseFinancial(index) {
  const receivableAmount = 100000 + (index % 5) * 10000;
  return {
    receivableAmount,
    cashAmount: 20000,
    bankAmount: 10000,
    rewardAmount: 5000,
    returnAmount: 5000,
    debtAmount: receivableAmount - 40000
  };
}

function applyMoneyOverride(financial, override = {}) {
  const next = { ...financial };
  for (const [key, value] of Object.entries(override || {})) next[key] = decodeSpecial(value);
  return next;
}

function expectedDebtOf(financial = {}) {
  const values = ['receivableAmount', 'cashAmount', 'bankAmount', 'rewardAmount', 'returnAmount']
    .map((key) => Number(financial[key]));
  const [receivable, cash, bank, reward, returned] = values.map((value) => Number.isFinite(value) ? Math.round(value) : 0);
  return Math.round(receivable - cash - bank - reward - returned);
}

function buildFixture(index, scenario) {
  const sequence = index + 1;
  const ownCanonicalOrderCode = `PERF-ORD-${String(sequence).padStart(4, '0')}`;
  const canonicalOrderCode = scenario.duplicateCanonicalOf === undefined
    ? ownCanonicalOrderCode
    : `PERF-ORD-${String(scenario.duplicateCanonicalOf + 1).padStart(4, '0')}`;
  const inputRef = scenario.duplicateCanonicalOf === undefined
    ? canonicalOrderCode
    : `ALIAS-${canonicalOrderCode}-${String(sequence).padStart(4, '0')}`;
  let financial = baseFinancial(index);
  if (scenario.returnAmount !== undefined) financial.returnAmount = scenario.returnAmount;
  financial = applyMoneyOverride(financial, scenario.moneyOverride);
  financial.debtAmount = expectedDebtOf(financial);
  const latestVersion = scenario.latestVersionMode === 'missing' ? null : {
    id: `DCOV-${canonicalOrderCode}-v2`,
    code: `DCOV-${canonicalOrderCode}-v2`,
    sourceVersion: 2,
    closeoutVersion: 2,
    ...financial
  };
  const legacyCloseout = {
    id: `DCO-${canonicalOrderCode}-v1`,
    code: `DCO-${canonicalOrderCode}-v1`,
    sourceVersion: 1,
    closeoutVersion: 1,
    ...financial
  };
  const allocation = scenario.allocationMode === 'missing' ? null : {
    id: `OPA-${canonicalOrderCode}`,
    allocationCode: `OPA-${canonicalOrderCode}`,
    orderCode: canonicalOrderCode,
    sourceVersion: scenario.allocationMode === 'version_mismatch' ? 1 : 2,
    stale: scenario.allocationMode === 'stale',
    ...financial
  };
  const expectedDebt = expectedDebtOf(financial);
  let currentArBalance = 0;
  if (scenario.arBalanceMode === 'expected') currentArBalance = expectedDebt;
  if (Number.isFinite(scenario.arDeltaFromExpected)) currentArBalance = expectedDebt + scenario.arDeltaFromExpected;
  const returnRows = financial.returnAmount > 0 ? [{
    id: `RET-${canonicalOrderCode}-1`,
    orderCode: canonicalOrderCode,
    totalReturnAmount: financial.returnAmount,
    status: 'warehouse_received'
  }] : [];
  if (scenario.duplicateReturnIdentity && returnRows.length) returnRows.push(clone(returnRows[0]));

  return {
    inputRef,
    canonicalOrderCode,
    scenarioId: scenario.id,
    covers: scenario.covers,
    order: {
      id: `SO-${canonicalOrderCode}`,
      code: canonicalOrderCode,
      customerCode: `CUS-${String((sequence % 11) + 1).padStart(3, '0')}`,
      customerName: `Fixture Customer ${(sequence % 11) + 1}`,
      deliveryDate: '2026-08-01',
      deliveryCloseout: legacyCloseout
    },
    latestVersion,
    allocation,
    returns: returnRows,
    currentArBalance,
    existingIdempotency: Boolean(scenario.existingIdempotency),
    validationError: scenario.validationError || null,
    injectedError: scenario.injectedError || null
  };
}


function encodeSpecial(value) {
  if (value === undefined) return UNDEFINED_MARKER;
  if (typeof value === 'number' && Number.isNaN(value)) return NAN_MARKER;
  if (Array.isArray(value)) return value.map(encodeSpecial);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeSpecial(item)]));
  }
  return value;
}

function createFixtureMatrix() {
  return {
    schemaVersion: '1.0',
    deterministic: true,
    clock: '2026-08-01T00:00:00.000Z',
    randomSeed: null,
    batchSizes: [...BATCH_SIZES],
    zeroTolerance: ZERO_TOLERANCE,
    specialValueEncoding: { undefined: UNDEFINED_MARKER, nan: NAN_MARKER },
    cases: CASES.map((scenario, index) => ({
      ordinal: index + 1,
      id: scenario.id,
      covers: scenario.covers,
      scenarioConfig: encodeSpecial(scenario),
      fixture: encodeSpecial(buildFixture(index, scenario))
    }))
  };
}

function createBatch(batchSize) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('batchSize must be a positive integer');
  const fixtures = [];
  for (let index = 0; index < batchSize; index += 1) {
    const scenario = CASES[index % CASES.length];
    const cycle = Math.floor(index / CASES.length);
    const fixture = buildFixture(index, scenario);
    if (cycle > 0 && scenario.duplicateCanonicalOf !== undefined) {
      fixture.canonicalOrderCode = `PERF-ORD-${String(cycle * CASES.length + scenario.duplicateCanonicalOf + 1).padStart(4, '0')}`;
      fixture.inputRef = `ALIAS-${fixture.canonicalOrderCode}-${String(index + 1).padStart(4, '0')}`;
      fixture.order.code = fixture.canonicalOrderCode;
      fixture.order.id = `SO-${fixture.canonicalOrderCode}`;
    }
    fixtures.push(fixture);
  }
  return fixtures;
}

module.exports = {
  BATCH_SIZES,
  ZERO_TOLERANCE,
  CASES,
  UNDEFINED_MARKER,
  NAN_MARKER,
  createFixtureMatrix,
  createBatch,
  expectedDebtOf
};
