'use strict';

const { LogicalQueryCounter } = require('./logical-query-counter');
const { FakeRepository } = require('./fake-repository');
const { ZERO_TOLERANCE, expectedDebtOf } = require('./fixture-factory');
const { normalizeSnapshot } = require('./normalize-snapshot');

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value, diagnostics, component) {
  if (value === null || value === undefined || value === '') {
    diagnostics.push({ code: 'INVALID_MONEY_NORMALIZED_TO_ZERO', component, input: String(value) });
    return 0;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    diagnostics.push({ code: 'INVALID_MONEY_NORMALIZED_TO_ZERO', component, input: String(value) });
    return 0;
  }
  return Math.round(number);
}

function dedupeReturns(rows = [], diagnostics = []) {
  const seen = new Set();
  return rows.filter((row, index) => {
    const identity = text(row.id || row.code || `anonymous:${index}`);
    if (seen.has(identity)) {
      diagnostics.push({ code: 'DUPLICATE_RETURN_IDENTITY', identity });
      return false;
    }
    seen.add(identity);
    return true;
  });
}

function financialFrom(source = {}, diagnostics = []) {
  const financial = {
    receivableAmount: money(source.receivableAmount, diagnostics, 'receivableAmount'),
    cashAmount: money(source.cashAmount, diagnostics, 'cashAmount'),
    bankAmount: money(source.bankAmount, diagnostics, 'bankAmount'),
    rewardAmount: money(source.rewardAmount, diagnostics, 'rewardAmount'),
    returnAmount: money(source.returnAmount, diagnostics, 'returnAmount')
  };
  financial.debtAmount = expectedDebtOf(financial);
  return financial;
}

function resolveFinancialContext({ order, latestVersion, allocation, returns }) {
  const diagnostics = [];
  const latestVersionNumber = Number(latestVersion && (latestVersion.sourceVersion || latestVersion.closeoutVersion || latestVersion.version) || 0);
  const allocationVersion = Number(allocation && allocation.sourceVersion || 0);
  let source;
  let sourceType;
  if (allocation && allocation.stale !== true && (!latestVersionNumber || allocationVersion === latestVersionNumber)) {
    source = allocation;
    sourceType = 'CURRENT_ALLOCATION';
  } else if (latestVersion) {
    source = latestVersion;
    sourceType = 'LATEST_CLOSEOUT_VERSION';
    if (allocation && allocation.stale === true) diagnostics.push({ code: 'STALE_ALLOCATION_FALLBACK' });
    if (allocation && allocationVersion !== latestVersionNumber) diagnostics.push({ code: 'ALLOCATION_VERSION_MISMATCH_FALLBACK', allocationVersion, latestVersionNumber });
  } else {
    source = order.deliveryCloseout || {};
    sourceType = 'LEGACY_CLOSEOUT_FALLBACK';
  }

  const financial = financialFrom(source, diagnostics);
  const uniqueReturns = dedupeReturns(returns, diagnostics);
  const canonicalReturnAmount = uniqueReturns.reduce((sum, row) => sum + Math.max(0, money(row.totalReturnAmount ?? row.returnAmount ?? row.amount, diagnostics, 'returnOrderAmount')), 0);
  if (uniqueReturns.length > 0) {
    financial.returnAmount = canonicalReturnAmount;
    financial.debtAmount = expectedDebtOf(financial);
  }
  return { sourceType, financial, diagnostics, returnOrderIds: uniqueReturns.map((row) => text(row.id || row.code)) };
}

function validateFinancial(financial = {}) {
  for (const [component, value] of Object.entries(financial)) {
    if (component !== 'debtAmount' && value < 0) {
      const error = new Error(`Negative money is not allowed: ${component}`);
      error.code = 'NEGATIVE_MONEY_GUARD';
      throw error;
    }
  }
}

function ledgerFor(orderCode, expectedDebt, currentArBalance, sourceVersion) {
  const deltaDebt = expectedDebt - currentArBalance;
  return {
    id: `AR-${orderCode}-V${sourceVersion}`,
    category: 'AR-DEBT-ADJUSTMENT',
    orderCode,
    debit: deltaDebt > 0 ? deltaDebt : 0,
    credit: deltaDebt < 0 ? Math.abs(deltaDebt) : 0,
    deltaDebt,
    idempotencyKey: `DEBT-ADJ:${orderCode}:v${sourceVersion}`
  };
}

async function runOne(fixture, repository, options = {}) {
  const inputRef = fixture.inputRef;
  await repository.transactionStart(inputRef);
  try {
    const order = await repository.findOrder(inputRef);
    const orderCode = order.code;
    const latestVersion = await repository.findLatestVersion(orderCode);
    const returns = await repository.findReturns(orderCode);
    const allocation = await repository.findAllocation(orderCode);
    const resolved = resolveFinancialContext({ order, latestVersion, allocation, returns });
    validateFinancial(resolved.financial);

    const initialBalance = await repository.findArBalance(orderCode, 'outerPreflight.initialBalance');
    const initialIdempotency = await repository.findIdempotency(orderCode, 'outerPreflight.initialIdempotency');
    if (fixture.injectedError) {
      const error = new Error('Injected deterministic repository failure');
      error.code = fixture.injectedError;
      throw error;
    }

    const sourceVersion = Number(latestVersion && (latestVersion.sourceVersion || latestVersion.closeoutVersion) || allocation && allocation.sourceVersion || 1);
    const nextVersion = {
      id: `DCOV-${orderCode}-v${sourceVersion + 1}`,
      code: `DCOV-${orderCode}-v${sourceVersion + 1}`,
      closeoutVersion: sourceVersion + 1,
      sourceVersion: sourceVersion + 1,
      ...resolved.financial
    };
    const nextAllocation = {
      id: `OPA-${orderCode}`,
      allocationCode: `OPA-${orderCode}`,
      orderCode,
      sourceVersion: sourceVersion + 1,
      ...resolved.financial
    };

    await repository.updateOrder(orderCode, { financialReplayed: true, closeoutVersion: sourceVersion + 1 });
    await repository.insertVersion(orderCode, nextVersion);
    await repository.upsertAllocation(orderCode, nextAllocation);

    const correctionBalance = await repository.findArBalance(orderCode, 'correction.initialBalance');
    const correctionIdempotency = await repository.findIdempotency(orderCode, 'correction.initialIdempotency');
    let postedLedger = null;
    let action = 'skip';
    const expectedDebt = resolved.financial.debtAmount;
    let deltaDebt = expectedDebt - correctionBalance;
    if (!correctionIdempotency && Math.abs(deltaDebt) > ZERO_TOLERANCE) {
      const safetyBalance = await repository.findArBalance(orderCode, 'correction.safetyBalance');
      deltaDebt = expectedDebt - safetyBalance;
      const prePostIdempotency = await repository.findIdempotency(orderCode, 'correction.prePostIdempotency');
      if (!prePostIdempotency && Math.abs(deltaDebt) > ZERO_TOLERANCE) {
        postedLedger = await repository.postLedger(orderCode, ledgerFor(orderCode, expectedDebt, safetyBalance, sourceVersion + 1));
        await repository.findArBalance(orderCode, 'correction.afterBalance');
        action = deltaDebt > 0 ? 'create-debit' : 'create-credit';
      } else if (prePostIdempotency) {
        action = 'manual-review-idempotency-race';
      }
    } else if (correctionIdempotency || initialIdempotency) {
      action = 'skip-existing-idempotency';
    } else if (Math.abs(expectedDebt - initialBalance) <= ZERO_TOLERANCE) {
      action = 'skip-zero-tolerance';
    }

    const afterBalance = await repository.findArBalance(orderCode, 'outerAfter.initialBalance');
    await repository.findIdempotency(orderCode, 'outerAfter.initialIdempotency');
    await repository.transactionCommit(inputRef);
    return {
      inputRef,
      orderCode,
      scenarioId: fixture.scenarioId,
      status: Math.abs(expectedDebt - afterBalance) <= ZERO_TOLERANCE ? 'processed_or_synced' : 'manual_review',
      action,
      financialSource: resolved.sourceType,
      financial: resolved.financial,
      returnOrderIds: resolved.returnOrderIds,
      diagnostics: resolved.diagnostics,
      arBalanceBefore: initialBalance,
      arBalanceAfter: afterBalance,
      postedLedger,
      idempotencyObserved: Boolean(initialIdempotency || correctionIdempotency)
    };
  } catch (error) {
    await repository.transactionAbort(inputRef, error.code || 'ERROR');
    return {
      inputRef,
      orderCode: fixture.canonicalOrderCode,
      scenarioId: fixture.scenarioId,
      status: 'error',
      errorCode: error.code || 'ERROR',
      errorMessage: error.message
    };
  }
}

function memoryUsed() {
  if (typeof global.gc === 'function') global.gc();
  return process.memoryUsage().heapUsed;
}

async function runCurrentArchitecture(fixtures, options = {}) {
  const counter = new LogicalQueryCounter();
  const repository = new FakeRepository(fixtures, counter);
  const startMemory = memoryUsed();
  const start = process.hrtime.bigint();
  const results = [];
  for (const fixture of fixtures) results.push(await runOne(fixture, repository, options));
  const durationNs = process.hrtime.bigint() - start;
  const endMemory = memoryUsed();
  const uniqueOrderCodes = [...new Set(fixtures.map((fixture) => fixture.canonicalOrderCode))];
  const orderStates = uniqueOrderCodes.map((orderCode) => ({ orderCode, ...repository.snapshot(orderCode) }));
  const counts = counter.snapshot({ batchSize: fixtures.length });
  return {
    batchSize: fixtures.length,
    counts,
    durationMs: Number((Number(durationNs) / 1e6).toFixed(3)),
    heapDeltaBytes: Math.max(0, endMemory - startMemory),
    results,
    snapshot: normalizeSnapshot({
      orderFinancialState: orderStates.map((state) => ({ orderCode: state.orderCode, order: state.order })),
      returnState: orderStates.map((state) => ({ orderCode: state.orderCode, returns: state.returns })),
      paymentAllocation: orderStates.map((state) => ({ orderCode: state.orderCode, allocation: state.allocation })),
      arLedger: orderStates.flatMap((state) => state.ledgers),
      debtBalance: orderStates.map((state) => ({ orderCode: state.orderCode, balance: state.arBalance })),
      idempotencyKeys: orderStates.flatMap((state) => state.idempotencyLedger ? [state.idempotencyLedger.idempotencyKey] : []).sort(),
      closeoutVersion: orderStates.map((state) => ({ orderCode: state.orderCode, version: Math.max(0, ...state.versions.map((row) => Number(row.closeoutVersion || row.sourceVersion || 0))) })),
      errorResultOrder: results.map((result, index) => ({ index, inputRef: result.inputRef, status: result.status, errorCode: result.errorCode || null }))
    })
  };
}

module.exports = { runCurrentArchitecture, runOne, resolveFinancialContext, validateFinancial };
