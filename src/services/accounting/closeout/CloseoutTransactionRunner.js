'use strict';

const { withMongoTransaction } = require('../../../utils/transaction.util');
const CriticalReader = require('./CloseoutCriticalReader');
const { compactDeliveryOrderKeys } = require('../../master-order/masterOrderIdentity.util');
const closeoutQueryAudit = require('../../../observability/closeoutQueryAudit');
const featureFlags = require('../../../config/featureFlags');


function debtReconcileService() {
  // Keep the A2/default flag-OFF path dependency-neutral. The heavier accounting
  // service is loaded only when the A3 batch path is explicitly enabled.
  return require('../OrderPaymentDebtReconcileService');
}

function clean(value = '') {
  return String(value ?? '').trim();
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => clean(value))
    .filter(Boolean))];
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
  return [...syncGroups.values()].map((group) => ({
    customerCode: group.customerCode,
    sourceIds: unique(group.sourceIds)
  }));
}

function groupReturnOrdersBySalesOrder(returnOrders = [], orders = []) {
  const result = new Map();
  for (const order of Array.isArray(orders) ? orders : []) {
    for (const key of compactDeliveryOrderKeys(order)) result.set(key, []);
  }
  for (const row of Array.isArray(returnOrders) ? returnOrders : []) {
    const rowKeys = unique([
      row.orderId,
      row.salesOrderId,
      row.sourceOrderId,
      row.deliveryOrderId,
      row.orderCode,
      row.salesOrderCode,
      row.sourceOrderCode,
      row.deliveryOrderCode
    ]);
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

async function runCloseoutTransaction({
  pendingConfirmOrders = [],
  results = [],
  confirmOneOrder,
  assertReturnOrdersInventoryReady,
  commandOptions = {},
  perOrderOptions = {}
} = {}) {
  if (typeof confirmOneOrder !== 'function') throw new TypeError('confirmOneOrder is required');
  if (typeof assertReturnOrdersInventoryReady !== 'function') throw new TypeError('assertReturnOrdersInventoryReady is required');
  const criticalReads = [];
  let initialArBalanceBatch = null;

  await withMongoTransaction(async (session) => closeoutQueryAudit.withTransactionAttempt(async () => {
    const critical = await CriticalReader.loadCriticalOrdersAndReturns(pendingConfirmOrders, { session });
    const returnByKey = groupReturnOrdersBySalesOrder(critical.returnOrders, critical.orders);
    const useArBalanceBatch = featureFlags.FLAGS.closeoutArBalanceBatchV1();
    initialArBalanceBatch = useArBalanceBatch
      ? await closeoutQueryAudit.withCloseoutAuditStage('transaction.arBalanceBatch', () => debtReconcileService().buildInitialArBalanceBatchContext(critical.orders, { session }))
      : null;
    let orderIndex = 0;
    for (const order of critical.orders) {
      orderIndex += 1;
      const returnOrders = returnOrdersForOrder(order, returnByKey);
      criticalReads.push({
        orderId: clean(order.id || order._id || order.code),
        returnOrderCount: returnOrders.length
      });
      closeoutQueryAudit.withCloseoutAuditStage('transaction.critical.validation', () => assertReturnOrdersInventoryReady(returnOrders));
      const initialArBalanceBatchItem = useArBalanceBatch
        ? debtReconcileService().initialArBalanceBatchItemForOrder(initialArBalanceBatch, order)
        : null;
      const result = await closeoutQueryAudit.withCloseoutOrder(orderIndex, critical.orders.length, () => confirmOneOrder(order, returnOrders, {
        ...perOrderOptions,
        session,
        initialArBalanceBatchResolved: useArBalanceBatch,
        initialArBalanceBatchDetails: initialArBalanceBatchItem
      }));
      results.push(result);
    }
  }));

  return {
    results,
    criticalReads,
    syncGroups: collectReadModelSyncGroups(results),
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
  _internal: { clean, unique, groupReturnOrdersBySalesOrder, returnOrdersForOrder }
};
