'use strict';

const { LogicalQueryCounter } = require('../perf-a1b/logical-query-counter');
const { FakeRepository } = require('../perf-a1b/fake-repository');
const { ZERO_TOLERANCE } = require('../perf-a1b/fixture-factory');
const { normalizeSnapshot } = require('../perf-a1b/normalize-snapshot');
const { resolveFinancialContext, validateFinancial } = require('../perf-a1b/current-architecture-simulator');

function clone(value) {
  return structuredClone(value);
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

function memoryUsed() {
  if (typeof global.gc === 'function') global.gc();
  return process.memoryUsage().heapUsed;
}

function chunks(values = [], size = 100) {
  const out = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}

async function buildBatchContext(fixtures, repository, options = {}) {
  const itemByPosition = new Map();
  const positionsByOrder = new Map();
  const groups = chunks(fixtures.map((fixture, inputPosition) => ({ fixture, inputPosition })), options.chunkSize || 100);
  for (const group of groups) {
    const inputRefs = group.map((row) => row.fixture.inputRef);
    const ordersByInput = await repository.batchFindOrders(inputRefs);
    const orderCodes = [...new Set(group.map((row) => row.fixture.canonicalOrderCode))];
    const versionsByOrder = await repository.batchFindVersions(orderCodes);
    const returnsByOrder = await repository.batchFindReturns(orderCodes);
    const allocationsByOrder = await repository.batchFindAllocations(orderCodes);
    const arContext = await repository.batchFindArContext(orderCodes);
    const correctionIdempotencyByOrder = await repository.batchFindCorrectionIdempotency(orderCodes);
    for (const { fixture, inputPosition } of group) {
      const orderCode = fixture.canonicalOrderCode;
      const positions = positionsByOrder.get(orderCode) || [];
      positions.push(inputPosition);
      positionsByOrder.set(orderCode, positions);
      itemByPosition.set(inputPosition, {
        complete: true,
        inputPosition,
        orderCode,
        order: ordersByInput.get(fixture.inputRef),
        latestVersion: versionsByOrder.get(orderCode) || null,
        returns: returnsByOrder.get(orderCode) || [],
        allocation: allocationsByOrder.get(orderCode) || null,
        initialArBalance: arContext.balanceByOrder.get(orderCode) || 0,
        initialIdempotency: arContext.idempotencyByOrder.get(orderCode) || null,
        initialCorrectionIdempotency: correctionIdempotencyByOrder.get(orderCode) || null
      });
    }
  }
  for (const positions of positionsByOrder.values()) {
    if (positions.length < 2) continue;
    for (const position of positions) {
      Object.assign(itemByPosition.get(position), {
        duplicateCanonicalInput: true,
        duplicateInputPositions: [...positions]
      });
    }
  }
  return { complete: itemByPosition.size === fixtures.length, itemByPosition, positionsByOrder };
}

async function liveContextForDuplicate(fixture, repository) {
  const order = await repository.findOrder(fixture.inputRef, 'duplicateScopedRefresh');
  const orderCode = fixture.canonicalOrderCode;
  const latestVersion = await repository.findLatestVersion(orderCode, 'duplicateScopedRefresh');
  const returns = await repository.findReturns(orderCode, 'duplicateScopedRefresh');
  const allocation = await repository.findAllocation(orderCode, 'duplicateScopedRefresh');
  const initialArBalance = await repository.findArBalance(orderCode, 'duplicateScopedRefresh.initialBalance');
  const initialIdempotency = await repository.findIdempotency(orderCode, 'duplicateScopedRefresh.initialIdempotency');
  return { order, latestVersion, returns, allocation, initialArBalance, initialIdempotency };
}

async function runOneWithBatchContext(fixture, repository, contextItem, options = {}) {
  const inputRef = fixture.inputRef;
  await repository.transactionStart(inputRef);
  try {
    const duplicateNeedsRefresh = contextItem.duplicateCanonicalInput
      && contextItem.duplicateInputPositions[0] !== contextItem.inputPosition;
    const initial = duplicateNeedsRefresh
      ? await liveContextForDuplicate(fixture, repository)
      : contextItem;
    const order = clone(initial.order);
    const orderCode = fixture.canonicalOrderCode;
    const latestVersion = clone(initial.latestVersion);
    const returns = clone(initial.returns);
    const allocation = clone(initial.allocation);
    const resolved = resolveFinancialContext({ order, latestVersion, allocation, returns });
    validateFinancial(resolved.financial);

    const initialBalance = Number(initial.initialArBalance || 0);
    const initialIdempotency = clone(initial.initialIdempotency);
    if (fixture.injectedError) {
      const error = new Error('Injected deterministic repository failure');
      error.code = fixture.injectedError;
      throw error;
    }

    const sourceVersion = Number(latestVersion && (latestVersion.sourceVersion || latestVersion.closeoutVersion)
      || allocation && allocation.sourceVersion || 1);
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

    let postedLedger = null;
    let action = 'skip';
    const expectedDebt = resolved.financial.debtAmount;
    let deltaDebt = expectedDebt - initialBalance;
    if (!initialIdempotency && Math.abs(deltaDebt) > ZERO_TOLERANCE) {
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
    } else if (initialIdempotency) {
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
      idempotencyObserved: Boolean(initialIdempotency),
      duplicateScopedRefresh: duplicateNeedsRefresh
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

async function runBatchArchitecture(fixtures, options = {}) {
  const counter = new LogicalQueryCounter();
  const repository = new FakeRepository(fixtures, counter);
  const startMemory = memoryUsed();
  const start = process.hrtime.bigint();
  const batchContext = await buildBatchContext(fixtures, repository, options);
  if (!batchContext.complete) throw new Error('partial batch context');
  const results = [];
  for (let index = 0; index < fixtures.length; index += 1) {
    results.push(await runOneWithBatchContext(fixtures[index], repository, batchContext.itemByPosition.get(index), options));
  }
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

module.exports = { runBatchArchitecture, buildBatchContext, runOneWithBatchContext };
