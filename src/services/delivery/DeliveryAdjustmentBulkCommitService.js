'use strict';

const dateUtil = require('../../utils/date.util');
const { withOptionalMongoTransaction } = require('../../utils/transaction.util');
const DeliveryAdjustmentCommitService = require('./DeliveryAdjustmentCommitService');

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
  else if (item.status === 'skipped') summary.skippedAlreadySynced += 1;
  else if (item.status === 'manual_review') summary.manualReviewRequired += 1;
  else if (item.status === 'dry_run') summary.dryRunOrders += 1;
  else if (item.status === 'error') summary.errors += 1;
  if (item.createdCorrectionVersion) summary.createdCorrectionVersions += 1;
  if (item.createdDebtAdjustment) summary.createdDebtAdjustments += 1;
}

async function commitManyAdjustments(input = {}, options = {}) {
  const orderCodes = unique(input.orderCodes || input.selectedOrderCodes || []);
  const orderIds = unique(input.orderIds || input.selectedOrderIds || []);
  const refs = unique([...orderCodes, ...orderIds]);
  if (!refs.length) {
    const err = new Error('Vui lòng chọn ít nhất một đơn để ghi nhận điều chỉnh hàng loạt.');
    err.code = 'BULK_ADJUSTMENT_ORDER_REQUIRED';
    err.status = 400;
    throw err;
  }
  if (refs.length > MAX_BULK_ORDERS) {
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
  const items = [];
  const summary = emptySummary(refs.length);

  for (const ref of refs) {
    try {
      const result = await withOptionalMongoTransaction({ ...options, actor: actorText }, async (session) => (
        DeliveryAdjustmentCommitService.commitOneAdjustment({
          orderCode: ref,
          orderId: ref,
          actor,
          reason,
          note,
          source: 'bulk',
          dryRun,
          date: input.date || input.deliveryDate,
          deliveryStaffCode: input.deliveryStaffCode,
          salesStaffCode: input.salesStaffCode
        }, { ...options, actor: actorText, dryRun, session })
      ));
      const item = result.item || {
        orderCode: ref,
        status: result.status || (result.skipped ? 'skipped' : 'processed'),
        reason: result.message || result.reason || ''
      };
      items.push(item);
      classifyItem(summary, item);
    } catch (err) {
      const item = {
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
      items.push(item);
      classifyItem(summary, item);
    }
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
