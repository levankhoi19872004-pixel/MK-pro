'use strict';

const dateUtil = require('../../utils/date.util');
const { withOptionalMongoTransaction } = require('../../utils/transaction.util');
const DeliveryAdjustmentCommitService = require('./DeliveryAdjustmentCommitService');
const DeliveryAdjustmentBatchContextService = require('./DeliveryAdjustmentBatchContextService');
const BulkTransactionOrchestrator = require('./BulkTransactionOrchestrator');

const MAX_BULK_ORDERS = 200;

function text(value = '') {
  return String(value ?? '').trim();
}

function actorName(actor = {}) {
  if (typeof actor === 'string') return text(actor) || 'system';
  return text(actor.name || actor.fullName || actor.username || actor.email || actor.id || actor.code || actor.role || 'system');
}

function unique(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean)));
}

function emptySummary(selectedOrders = 0) {
  return {
    selectedOrders,
    processedOrders: 0,
    skippedAlreadySynced: 0,
    createdCorrectionVersions: 0,
    createdDebtAdjustments: 0,
    manualReviewRequired: 0,
    errors: 0,
    dryRunOrders: 0
  };
}

function classifyItem(summary, item = {}) {
  if (item.status === 'processed') summary.processedOrders += 1;
  else if (item.status === 'skipped' || item.status === 'skipped_already_synced') summary.skippedAlreadySynced += 1;
  else if (item.status === 'manual_review') summary.manualReviewRequired += 1;
  else if (item.status === 'dry_run') summary.dryRunOrders += 1;
  else if (item.status === 'error') summary.errors += 1;
  if (item.createdCorrectionVersion) summary.createdCorrectionVersions += 1;
  if (item.createdDebtAdjustment) summary.createdDebtAdjustments += 1;
}

async function commitManyAdjustments(input = {}, options = {}) {
  const orderObjects = Array.isArray(input.orders) ? input.orders.filter((row) => row && typeof row === 'object') : [];
  const orderCodes = unique(input.orderCodes || input.selectedOrderCodes || []);
  const orderIds = unique(input.orderIds || input.selectedOrderIds || []);
  const objectKeys = unique(orderObjects.map((row) => row.orderCode || row.salesOrderCode || row.code || row.orderId || row.id));
  const looseRefs = unique([...orderCodes, ...orderIds]).filter((ref) => !objectKeys.includes(ref));
  const targets = [
    ...orderObjects.map((row) => ({ ...row, orderCode: text(row.orderCode || row.salesOrderCode || row.code), orderId: text(row.orderId || row.salesOrderId || row.id) })),
    ...looseRefs.map((ref) => ({ orderCode: ref, orderId: ref }))
  ];
  if (!targets.length) {
    const err = new Error('Vui lòng chọn ít nhất một đơn để ghi nhận điều chỉnh hàng loạt.');
    err.code = 'BULK_ADJUSTMENT_ORDER_REQUIRED';
    err.status = 400;
    throw err;
  }
  if (targets.length > MAX_BULK_ORDERS) {
    const err = new Error(`Chỉ được xử lý tối đa ${MAX_BULK_ORDERS} đơn mỗi lần.`);
    err.code = 'BULK_ADJUSTMENT_LIMIT_EXCEEDED';
    err.status = 400;
    throw err;
  }

  const actor = input.actor || options.actor || 'accountant';
  const actorText = actorName(actor);
  const dryRun = input.dryRun === true || options.dryRun === true;
  const reason = text(input.reason || 'Bulk ghi nhận lại điều chỉnh công nợ');
  const note = text(input.note || 'Bulk chạy cùng logic Lưu điều chỉnh từng đơn');
  const startedAt = dateUtil.nowIso();
  let items = new Array(targets.length);
  const summary = emptySummary(targets.length);
  const batchContextEnabled = DeliveryAdjustmentBatchContextService.isEnabled(options);
  let batchContext = null;
  let batchContextFallbackReason = '';
  if (batchContextEnabled) {
    try {
      batchContext = await DeliveryAdjustmentBatchContextService.loadBatchContext(targets, options);
    } catch (error) {
      if (DeliveryAdjustmentBatchContextService.failurePolicy(options) !== 'fallback_legacy') throw error;
      batchContextFallbackReason = text(error && (error.code || error.message) || 'BULK_BATCH_CONTEXT_LOAD_FAILED');
    }
  }

  const configuredConcurrency = BulkTransactionOrchestrator.resolveConcurrency(options);
  // Canonical identity is required before enabling parallel work. Legacy fallback
  // and caller-owned sessions remain serial to avoid alias races/session sharing.
  const effectiveConcurrency = batchContext && !options.session ? configuredConcurrency : 1;
  const retryLimit = options.session ? 0 : BulkTransactionOrchestrator.resolveRetryLimit(options);

  const tasks = targets.map((target, inputPosition) => {
    const loadedBatchContextItem = batchContext
      ? DeliveryAdjustmentBatchContextService.itemForPosition(batchContext, inputPosition)
      : null;
    const ref = text(target.orderCode || target.orderId || target.id);
    return {
      target,
      inputPosition,
      loadedBatchContextItem,
      identity: text(loadedBatchContextItem && loadedBatchContextItem.canonicalOrderKey) || ref || `input-${inputPosition}`
    };
  });

  const processTask = async (task) => {
    const { target, inputPosition, loadedBatchContextItem } = task;
    const ref = text(target.orderCode || target.orderId || target.id);
    try {
      // When two inputs resolve to the same canonical order, only the first may
      // use the request-start snapshot. Identity locking guarantees the later
      // duplicate starts only after the earlier transaction has settled.
      const duplicateNeedsRefresh = Boolean(
        loadedBatchContextItem
        && loadedBatchContextItem.duplicateCanonicalInput
        && Array.isArray(loadedBatchContextItem.duplicateInputPositions)
        && loadedBatchContextItem.duplicateInputPositions[0] !== inputPosition
      );
      const batchContextItem = duplicateNeedsRefresh ? null : loadedBatchContextItem;
      if (duplicateNeedsRefresh && batchContext && batchContext.metrics) {
        batchContext.metrics.duplicateScopedRefreshes = Number(batchContext.metrics.duplicateScopedRefreshes || 0) + 1;
      }

      const result = await BulkTransactionOrchestrator.runWithBoundedTransientRetry(async (transactionAttempt) => (
        withOptionalMongoTransaction({ ...options, actor: actorText }, async (session) => (
          DeliveryAdjustmentCommitService.commitOneAdjustment({
            ...target,
            orderCode: text(target.orderCode || ref),
            orderId: text(target.orderId || ref),
            actor,
            reason,
            note,
            source: 'bulk',
            dryRun,
            date: input.date || input.deliveryDate || target.deliveryDate,
            deliveryStaffCode: input.deliveryStaffCode || target.deliveryStaffCode,
            salesStaffCode: input.salesStaffCode || target.salesStaffCode
          }, {
            ...options,
            actor: actorText,
            dryRun,
            session,
            transactionAttempt,
            batchContextItem,
            useBatchInitialContext: Boolean(batchContextItem)
          })
        ))
      ), {
        bulkTransientRetryLimit: retryLimit,
        onRetry: options.onBulkTransientRetry
      });
      return result.item || {
        orderCode: ref,
        status: result.status || (result.skipped ? 'skipped' : 'processed'),
        reason: result.message || result.reason || ''
      };
    } catch (err) {
      return {
        orderCode: ref,
        customerCode: '',
        customerName: '',
        status: 'error',
        createdCorrectionVersion: false,
        createdDebtAdjustment: false,
        debtAdjustmentAmount: 0,
        arBalanceBefore: 0,
        arBalanceAfter: 0,
        reason: text(err.code || 'BULK_ADJUSTMENT_ERROR'),
        error: text(err.message || err)
      };
    }
  };

  const orchestration = await BulkTransactionOrchestrator.runBoundedByIdentity(tasks, {
    concurrency: effectiveConcurrency,
    identityOf: (task) => task.identity,
    worker: processTask
  });
  items = orchestration.results;
  for (const item of items) classifyItem(summary, item);

  if (typeof options.onBulkOrchestrationMetrics === 'function') {
    options.onBulkOrchestrationMetrics({
      ...orchestration.metrics,
      configuredConcurrency,
      effectiveConcurrency,
      retryLimit,
      batchContextActive: Boolean(batchContext)
    });
  }

  return {
    ok: true,
    success: true,
    dryRun,
    startedAt,
    finishedAt: dateUtil.nowIso(),
    reason,
    note,
    summary,
    items,
    results: items,
    ...(batchContextEnabled ? {
      perfBatchContext: {
        featureFlag: 'PERF_BULK_BATCH_CONTEXT_V1',
        enabled: true,
        active: Boolean(batchContext),
        failurePolicy: DeliveryAdjustmentBatchContextService.failurePolicy(options),
        fallbackReason: batchContextFallbackReason,
        metrics: batchContext ? batchContext.metrics : null
      }
    } : {}),
    message: dryRun
      ? `Đã kiểm tra ${summary.selectedOrders} đơn. Cần xử lý: ${summary.dryRunOrders}. Đã đúng: ${summary.skippedAlreadySynced}. Lỗi: ${summary.errors}.`
      : `Đã xử lý ${summary.selectedOrders} đơn. Thành công: ${summary.processedOrders}. Đã đúng: ${summary.skippedAlreadySynced}. Cần kiểm tra: ${summary.manualReviewRequired}. Lỗi: ${summary.errors}.`
  };
}

module.exports = {
  commitManyAdjustments,
  MAX_BULK_ORDERS,
  _internal: { text, unique, emptySummary, classifyItem }
};
