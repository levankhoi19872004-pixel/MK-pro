'use strict';

const { withMongoTransaction } = require('../../../utils/transaction.util');
const CriticalReader = require('./CloseoutCriticalReader');
const { compactDeliveryOrderKeys } = require('../../master-order/masterOrderIdentity.util');
const closeoutQueryAudit = require('../../../observability/closeoutQueryAudit');
const featureFlags = require('../../../config/featureFlags');

function allocationService() {
  return require('../OrderPaymentAllocationService');
}

function debtReconcileService() {
  return require('../OrderPaymentDebtReconcileService');
}

function arBatchPostingService() {
  return require('./CloseoutArBatchPostingService');
}

function clean(value = '') { return String(value ?? '').trim(); }

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => clean(value)).filter(Boolean))];
}

function collectReadModelSyncGroups(results = []) {
  const syncGroups = new Map();
  for (const row of Array.isArray(results) ? results : []) {
    if (!row || !row.confirmed || row.readModelSyncNeeded !== true) continue;
    const customerCode = clean(row.affectedCustomerCode);
    const sourceId = clean(row.affectedSourceId || row.orderId);
    if (!customerCode && !sourceId) continue;
    const key = customerCode || '(missing-customer)';
    if (!syncGroups.has(key)) syncGroups.set(key, { customerCode, sourceIds: [] });
    if (sourceId) syncGroups.get(key).sourceIds.push(sourceId);
  }
  return [...syncGroups.values()].map((group) => ({ customerCode: group.customerCode, sourceIds: unique(group.sourceIds) }));
}

function groupReturnOrdersBySalesOrder(returnOrders = [], orders = []) {
  const result = new Map();
  for (const order of Array.isArray(orders) ? orders : []) {
    for (const key of compactDeliveryOrderKeys(order)) result.set(key, []);
  }
  for (const row of Array.isArray(returnOrders) ? returnOrders : []) {
    const rowKeys = unique([row.orderId, row.salesOrderId, row.sourceOrderId, row.deliveryOrderId, row.orderCode, row.salesOrderCode, row.sourceOrderCode, row.deliveryOrderCode]);
    for (const key of rowKeys) {
      if (!result.has(key)) continue;
      result.get(key).push(row);
    }
  }
  return result;
}

function returnOrdersForOrder(order = {}, returnByKey = new Map()) {
  const used = new Set();
  const rows = [];
  for (const key of compactDeliveryOrderKeys(order)) {
    for (const row of returnByKey.get(key) || []) {
      const rowKey = clean(row.id || row.code || row._id || JSON.stringify(row));
      if (used.has(rowKey)) continue;
      used.add(rowKey);
      rows.push(row);
    }
  }
  return rows;
}

function allocationBatchOptions(base = {}, useAllocationPostedRefsBatch, finalAllocationUpdatePlans) {
  return {
    ...base,
    ...(useAllocationPostedRefsBatch ? {
      deferFinalAllocationUpdate: true,
      collectFinalAllocationUpdatePlan: (plan) => finalAllocationUpdatePlans.push(plan)
    } : {})
  };
}

function indexBatchResults(batchResult = {}) {
  const entriesByKey = new Map();
  const postingByKey = new Map();
  for (const row of batchResult.entries || []) entriesByKey.set(clean(row.idempotencyKey), row);
  for (const row of batchResult.postingResults || []) postingByKey.set(clean(row.idempotencyKey), row);
  return { entriesByKey, postingByKey };
}

async function runCloseoutTransaction({
  pendingConfirmOrders = [],
  results = [],
  confirmOneOrder,
  prepareOneOrderForArBulk,
  finalizePreparedOrderAfterArBulk,
  assertReturnOrdersInventoryReady,
  commandOptions = {},
  perOrderOptions = {}
} = {}) {
  if (typeof confirmOneOrder !== 'function') throw new TypeError('confirmOneOrder is required');
  if (typeof assertReturnOrdersInventoryReady !== 'function') throw new TypeError('assertReturnOrdersInventoryReady is required');
  const baseResults = Array.isArray(results) ? results.slice() : [];
  const useArBulk = typeof featureFlags.FLAGS.closeoutArWriteBulkV1 === 'function' && featureFlags.FLAGS.closeoutArWriteBulkV1();
  if (useArBulk && (typeof prepareOneOrderForArBulk !== 'function' || typeof finalizePreparedOrderAfterArBulk !== 'function')) {
    const err = new Error('AR bulk flag ON nhưng thiếu phased closeout callbacks.');
    err.code = 'AR_BULK_PHASE_CALLBACKS_REQUIRED';
    throw err;
  }

  const executeTransaction = () => withMongoTransaction(async (session) => closeoutQueryAudit.withTransactionAttempt(async () => {
    const attemptResults = [];
    const attemptOrderResults = [];
    const attemptCriticalReads = [];
    let attemptInitialArBalanceBatch = null;
    let attemptAllocationPostedRefsBatch = { enabled: false, planned: 0, commandCount: 0, operationCount: 0 };
    let attemptArBulk = { enabled: useArBulk, intentCount: 0, arPreflightReadCommands: 0, arBulkWriteCommands: 0, arReadbackCommands: 0, legacyArWriteCommands: 0, bulkOperationCount: 0 };

    const critical = await CriticalReader.loadCriticalOrdersAndReturns(pendingConfirmOrders, { session });
    const returnByKey = groupReturnOrdersBySalesOrder(critical.returnOrders, critical.orders);
    const useArBalanceBatch = featureFlags.FLAGS.closeoutArBalanceBatchV1();
    attemptInitialArBalanceBatch = useArBalanceBatch
      ? await closeoutQueryAudit.withCloseoutAuditStage('transaction.arBalanceBatch', () => debtReconcileService().buildInitialArBalanceBatchContext(critical.orders, { session }))
      : null;
    const useAllocationPostedRefsBatch = typeof featureFlags.FLAGS.closeoutAllocationPostedRefsBatchV1 === 'function'
      ? featureFlags.FLAGS.closeoutAllocationPostedRefsBatchV1()
      : false;
    const finalAllocationUpdatePlans = [];

    if (!useArBulk) {
      let orderIndex = 0;
      for (const order of critical.orders) {
        orderIndex += 1;
        const returnOrders = returnOrdersForOrder(order, returnByKey);
        attemptCriticalReads.push({ orderId: clean(order.id || order._id || order.code), returnOrderCount: returnOrders.length });
        closeoutQueryAudit.withCloseoutAuditStage('transaction.critical.validation', () => assertReturnOrdersInventoryReady(returnOrders));
        const initialArBalanceBatchItem = useArBalanceBatch
          ? debtReconcileService().initialArBalanceBatchItemForOrder(attemptInitialArBalanceBatch, order)
          : null;
        const callOptions = allocationBatchOptions({
          ...perOrderOptions,
          session,
          initialArBalanceBatchResolved: useArBalanceBatch,
          initialArBalanceBatchDetails: initialArBalanceBatchItem
        }, useAllocationPostedRefsBatch, finalAllocationUpdatePlans);
        const result = await closeoutQueryAudit.withCloseoutOrder(orderIndex, critical.orders.length, () => confirmOneOrder(order, returnOrders, callOptions));
        attemptResults.push(result);
      }
      attemptArBulk.legacyArWriteCommands = attemptResults.reduce((sum, row) => sum + Number(row?.persistence?.legacyArWriteCommands || 0), 0);
    } else {
      const preparedContexts = [];
      let orderIndex = 0;
      for (const order of critical.orders) {
        orderIndex += 1;
        const returnOrders = returnOrdersForOrder(order, returnByKey);
        attemptCriticalReads.push({ orderId: clean(order.id || order._id || order.code), returnOrderCount: returnOrders.length });
        closeoutQueryAudit.withCloseoutAuditStage('transaction.critical.validation', () => assertReturnOrdersInventoryReady(returnOrders));
        const initialArBalanceBatchItem = useArBalanceBatch
          ? debtReconcileService().initialArBalanceBatchItemForOrder(attemptInitialArBalanceBatch, order)
          : null;
        const callOptions = allocationBatchOptions({
          ...perOrderOptions,
          session,
          initialArBalanceBatchResolved: useArBalanceBatch,
          initialArBalanceBatchDetails: initialArBalanceBatchItem
        }, useAllocationPostedRefsBatch, finalAllocationUpdatePlans);
        const prepared = await closeoutQueryAudit.withCloseoutOrder(orderIndex, critical.orders.length, () => prepareOneOrderForArBulk(order, returnOrders, callOptions));
        if (prepared && prepared.earlyResult) attemptOrderResults[orderIndex - 1] = prepared.earlyResult;
        else preparedContexts.push({ prepared, orderIndex, callOptions });
      }

      const allIntents = preparedContexts.flatMap((item) => Array.isArray(item.prepared?.expectedArLedgers) ? item.prepared.expectedArLedgers : []);
      attemptArBulk.intentCount = allIntents.length;
      const batchService = perOrderOptions.arBatchService || arBatchPostingService();
      const batchResult = await batchService.postEligibleArIntentsBatch(allIntents, { session, repository: perOrderOptions.arBatchRepository });
      attemptArBulk = { enabled: true, intentCount: allIntents.length, ...(batchResult.telemetry || {}) };
      const { entriesByKey, postingByKey } = indexBatchResults(batchResult);

      for (const item of preparedContexts) {
        const expected = item.prepared.expectedArLedgers || [];
        const entries = expected.map((intent) => entriesByKey.get(clean(intent.idempotencyKey))).filter(Boolean);
        entries.postingResults = expected.map((intent) => postingByKey.get(clean(intent.idempotencyKey))).filter(Boolean);
        entries.expectedArLedgers = expected;
        const result = await closeoutQueryAudit.withCloseoutOrder(item.orderIndex, critical.orders.length, () => finalizePreparedOrderAfterArBulk(item.prepared, entries, item.callOptions));
        attemptOrderResults[item.orderIndex - 1] = result;
      }
      attemptResults.push(...attemptOrderResults.filter((row) => row !== undefined));
    }

    if (useAllocationPostedRefsBatch && finalAllocationUpdatePlans.length) {
      const allocationBatchService = perOrderOptions.allocationBatchService || allocationService();
      const batchResult = await allocationBatchService.flushFinalAllocationUpdatePlans(finalAllocationUpdatePlans, { session });
      attemptAllocationPostedRefsBatch = {
        enabled: true,
        planned: finalAllocationUpdatePlans.length,
        commandCount: Number(batchResult.commandCount || 0),
        operationCount: Number(batchResult.operationCount || finalAllocationUpdatePlans.length),
        matchedCount: Number(batchResult.matchedCount || finalAllocationUpdatePlans.length)
      };
    } else {
      attemptAllocationPostedRefsBatch = { enabled: useAllocationPostedRefsBatch, planned: finalAllocationUpdatePlans.length, commandCount: 0, operationCount: 0 };
    }

    return { attemptResults, criticalReads: attemptCriticalReads, initialArBalanceBatch: attemptInitialArBalanceBatch, allocationPostedRefsBatch: attemptAllocationPostedRefsBatch, arBulk: attemptArBulk };
  }));

  let committedAttempt;
  let idempotencyRaceRetries = 0;
  while (true) {
    try {
      committedAttempt = await executeTransaction();
      break;
    } catch (error) {
      if (useArBulk && error && error.arBatchRetryWholeTransaction === true && idempotencyRaceRetries < 1) {
        idempotencyRaceRetries += 1;
        continue;
      }
      throw error;
    }
  }

  results.splice(0, results.length, ...baseResults, ...(committedAttempt?.attemptResults || []));
  const criticalReads = committedAttempt?.criticalReads || [];
  const initialArBalanceBatch = committedAttempt?.initialArBalanceBatch || null;
  const allocationPostedRefsBatch = committedAttempt?.allocationPostedRefsBatch || { enabled: false, planned: 0, commandCount: 0, operationCount: 0 };
  const arBulk = {
    ...(committedAttempt?.arBulk || { enabled: useArBulk }),
    wholeTransactionRaceRetries: idempotencyRaceRetries,
    allocationBulkCommands: Number(allocationPostedRefsBatch.commandCount || 0),
    transactionCount: 1 + idempotencyRaceRetries
  };

  return {
    results,
    criticalReads,
    syncGroups: collectReadModelSyncGroups(results),
    allocationPostedRefsBatch,
    arBulk,
    arBalanceBatch: initialArBalanceBatch ? {
      enabled: true,
      scopeCount: initialArBalanceBatch.scopeCount,
      rawQueryCount: initialArBalanceBatch.rawQueryCount,
      canonicalQueryCount: initialArBalanceBatch.canonicalQueryCount
    } : { enabled: false, scopeCount: 0, rawQueryCount: 0, canonicalQueryCount: 0 },
    commandOptions
  };
}

module.exports = {
  runCloseoutTransaction,
  collectReadModelSyncGroups,
  _internal: { clean, unique, groupReturnOrdersBySalesOrder, returnOrdersForOrder, allocationBatchOptions, indexBatchResults }
};
