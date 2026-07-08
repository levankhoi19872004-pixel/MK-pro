'use strict';

const crypto = require('node:crypto');
const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const SalesOrder = require('../../models/SalesOrder');
const DeliveryCloseoutVersion = require('../../models/DeliveryCloseoutVersion');
const deliveryCloseoutCorrectionService = require('../deliveryCloseoutCorrection.service');
const OrderPaymentDebtReconcileService = require('../accounting/OrderPaymentDebtReconcileService');

const DEFAULT_ZERO_TOLERANCE = 1000;
const ACTIVE_EXCLUDED_STATUSES = ['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'removed', 'superseded'];

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const amount = Number(toNumber(value));
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function hash(value = '') {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

function shortHash(value = '') {
  return hash(value).slice(0, 12);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function actorName(actor = {}) {
  if (typeof actor === 'string') return text(actor) || 'system';
  return text(actor.name || actor.fullName || actor.username || actor.email || actor.id || actor.code || actor.role || 'system');
}

function orderId(order = {}) {
  return text(order.id || order.salesOrderId || order.orderId || order._id);
}

function orderCode(order = {}) {
  return text(order.code || order.orderCode || order.salesOrderCode || order.documentCode || order.invoiceCode || order.id || order._id);
}

function closeoutOf(order = {}) {
  return order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
}

function originalCloseoutIdentity(order = {}) {
  const closeout = closeoutOf(order);
  const base = orderId(order) || orderCode(order);
  const directVersion = Number(closeout.closeoutVersion || closeout.version || 0) || 0;
  const versions = Array.isArray(closeout.versions) ? closeout.versions : [];
  const nestedMax = versions.reduce((max, row) => Math.max(max, Number(row.closeoutVersion || row.version || 0) || 0), 0);
  const version = Math.max(directVersion, nestedMax, 1);
  const id = text(closeout.id || closeout.closeoutId || closeout.code || closeout.closeoutCode || `DCO-${base}-v${version}`);
  const code = text(closeout.code || closeout.closeoutCode || id);
  return { id, code, version };
}

function buildOrderLookup(refs = []) {
  const keys = Array.from(new Set((Array.isArray(refs) ? refs : [refs]).map(text).filter(Boolean)));
  if (!keys.length) return null;
  return {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    status: { $nin: ACTIVE_EXCLUDED_STATUSES },
    $or: keys.flatMap((value) => ([
      { id: value },
      { code: value },
      { orderCode: value },
      { salesOrderCode: value },
      { documentCode: value },
      { invoiceCode: value },
      { 'deliveryCloseout.id': value },
      { 'deliveryCloseout.code': value },
      { 'deliveryCloseout.closeoutId': value },
      { 'deliveryCloseout.closeoutCode': value }
    ]))
  };
}

async function findOrder(input = {}, options = {}) {
  const lookup = buildOrderLookup([input.orderCode, input.orderId, input.salesOrderCode, input.salesOrderId, input.originalCloseoutId, input.closeoutId]);
  if (!lookup) {
    const err = new Error('Thiếu mã đơn để ghi nhận điều chỉnh.');
    err.code = 'BULK_ADJUSTMENT_ORDER_REF_REQUIRED';
    err.status = 400;
    throw err;
  }
  let query = SalesOrder.findOne(lookup).lean();
  if (options.session) query = query.session(options.session);
  const order = await query;
  if (!order) {
    const err = new Error('Không tìm thấy đơn để ghi nhận điều chỉnh.');
    err.code = 'BULK_ADJUSTMENT_ORDER_NOT_FOUND';
    err.status = 404;
    throw err;
  }
  return order;
}

async function latestVersionForOrder(order = {}, options = {}) {
  const original = originalCloseoutIdentity(order);
  const keys = Array.from(new Set([
    original.id,
    original.code,
    orderId(order),
    orderCode(order)
  ].map(text).filter(Boolean)));
  if (!keys.length) return null;
  let query = DeliveryCloseoutVersion.find({
    status: { $nin: ACTIVE_EXCLUDED_STATUSES },
    $or: keys.flatMap((key) => ([
      { originalCloseoutId: key },
      { originalCloseoutCode: key },
      { salesOrderId: key },
      { salesOrderCode: key },
      { orderId: key },
      { orderCode: key },
      { id: key },
      { code: key },
      { closeoutCode: key }
    ]))
  }).sort({ closeoutVersion: -1, sourceVersion: -1, updatedAt: -1, createdAt: -1 }).lean();
  if (options.session) query = query.session(options.session);
  const versions = await query;
  return Array.isArray(versions) && versions.length ? versions[0] : null;
}

function buildEffectiveCloseout(order = {}, latestVersion = null) {
  if (latestVersion && typeof latestVersion === 'object') {
    return {
      ...latestVersion,
      sourceType: 'DELIVERY_CLOSEOUT_VERSION',
      sourceId: text(latestVersion.id || latestVersion._id || latestVersion.closeoutId || latestVersion.closeoutCode || latestVersion.code),
      sourceCode: text(latestVersion.code || latestVersion.closeoutCode || latestVersion.id),
      sourceVersion: Number(latestVersion.closeoutVersion || latestVersion.sourceVersion || latestVersion.version || 1) || 1,
      receivableAmount: money(latestVersion.receivableAmount ?? latestVersion.originalAmount ?? latestVersion.saleAmount ?? order.totalAmount ?? order.amount ?? order.total),
      cashAmount: money(latestVersion.cashAmount ?? latestVersion.newCashAmount ?? latestVersion.cashCollectedAmount ?? 0),
      bankAmount: money(latestVersion.bankAmount ?? latestVersion.newBankAmount ?? latestVersion.bankTransferAmount ?? latestVersion.transferAmount ?? 0),
      rewardAmount: money(latestVersion.rewardAmount ?? latestVersion.newRewardAmount ?? latestVersion.offsetAmount ?? latestVersion.bonusAmount ?? 0),
      returnAmount: money(latestVersion.returnAmount ?? latestVersion.newReturnAmount ?? latestVersion.returnedAmount ?? 0),
      debtAmount: money(latestVersion.debtAmount ?? latestVersion.finalDebtAmount ?? latestVersion.newDebtAmount ?? 0)
    };
  }
  const closeout = closeoutOf(order);
  return {
    ...closeout,
    sourceType: 'DELIVERY_CLOSEOUT',
    sourceId: text(closeout.id || closeout.closeoutId || closeout.code || closeout.closeoutCode || orderId(order) || orderCode(order)),
    sourceCode: text(closeout.code || closeout.closeoutCode || orderCode(order) || orderId(order)),
    sourceVersion: Number(closeout.closeoutVersion || closeout.version || 1) || 1,
    receivableAmount: money(closeout.receivableAmount ?? closeout.originalAmount ?? closeout.saleAmount ?? order.totalAmount ?? order.amount ?? order.total),
    cashAmount: money(closeout.cashAmount ?? closeout.newCashAmount ?? closeout.cashCollectedAmount ?? 0),
    bankAmount: money(closeout.bankAmount ?? closeout.newBankAmount ?? closeout.bankTransferAmount ?? closeout.transferAmount ?? 0),
    rewardAmount: money(closeout.rewardAmount ?? closeout.newRewardAmount ?? closeout.offsetAmount ?? closeout.bonusAmount ?? 0),
    returnAmount: money(closeout.returnAmount ?? closeout.newReturnAmount ?? closeout.returnedAmount ?? 0),
    debtAmount: money(closeout.debtAmount ?? closeout.finalDebtAmount ?? closeout.newDebtAmount ?? 0)
  };
}

function buildAllocation(order = {}, closeout = {}, options = {}) {
  return OrderPaymentDebtReconcileService._internal.allocationFromCloseout(order, closeout, {
    sourceType: text(options.sourceType || closeout.sourceType || 'BULK_DELIVERY_ADJUSTMENT_COMMIT'),
    sourceId: text(options.sourceId || closeout.sourceId || closeout.id || closeout.closeoutId || orderId(order) || orderCode(order)),
    sourceCode: text(options.sourceCode || closeout.sourceCode || closeout.code || closeout.closeoutCode || orderCode(order)),
    sourceVersion: Number(options.sourceVersion || closeout.sourceVersion || closeout.closeoutVersion || closeout.version || 1) || 1,
    zeroTolerance: options.zeroTolerance || DEFAULT_ZERO_TOLERANCE
  });
}

function paymentStateHash(allocation = {}) {
  return shortHash(stableJson({
    receivableAmount: money(allocation.receivableAmount),
    cashAmount: money(allocation.cashAmount),
    bankAmount: money(allocation.bankAmount),
    rewardAmount: money(allocation.rewardAmount),
    returnAmount: money(allocation.returnAmount),
    debtAmount: money(allocation.debtAmount),
    sourceVersion: Number(allocation.sourceVersion || 1) || 1
  }));
}

function hasMoneyInput(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function rowMoney(input = {}, keys = [], fallback = 0) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input || {}, key) && hasMoneyInput(input[key])) return money(input[key]);
  }
  return money(fallback);
}

function hasManualPaymentSnapshot(input = {}) {
  return ['receivableAmount', 'originalAmount', 'cashAmount', 'bankAmount', 'rewardAmount', 'returnAmount', 'returnedAmount', 'finalDebtAmount', 'debtAmount'].some((key) => hasMoneyInput(input[key]));
}

function manualSnapshotFromInput(input = {}, fallbackAllocation = {}) {
  const receivableAmount = rowMoney(input, ['receivableAmount', 'originalAmount', 'saleAmount', 'totalAmount'], fallbackAllocation.receivableAmount);
  const cashAmount = rowMoney(input, ['cashAmount', 'currentCashAmount', 'finalCashAmount'], fallbackAllocation.cashAmount);
  const bankAmount = rowMoney(input, ['bankAmount', 'currentBankAmount', 'finalBankAmount'], fallbackAllocation.bankAmount);
  const rewardAmount = rowMoney(input, ['rewardAmount', 'offsetAmount', 'currentRewardAmount', 'finalRewardAmount'], fallbackAllocation.rewardAmount);
  const returnAmount = rowMoney(input, ['returnAmount', 'returnedAmount', 'currentReturnAmount', 'finalReturnAmount'], fallbackAllocation.returnAmount);
  const explicitDebt = rowMoney(input, ['finalDebtAmount', 'debtAmount', 'currentDebtAmount', 'newDebtAmount'], fallbackAllocation.debtAmount);
  return { receivableAmount, cashAmount, bankAmount, rewardAmount, returnAmount, debtAmount: explicitDebt };
}

function allocationWithManualSnapshot(allocation = {}, snapshot = {}) {
  const rawDebtAmount = money(snapshot.receivableAmount - snapshot.cashAmount - snapshot.bankAmount - snapshot.rewardAmount - snapshot.returnAmount);
  const normalizedDebtAmount = money(snapshot.debtAmount);
  return {
    ...allocation,
    receivableAmount: snapshot.receivableAmount,
    cashAmount: snapshot.cashAmount,
    bankAmount: snapshot.bankAmount,
    rewardAmount: snapshot.rewardAmount,
    returnAmount: snapshot.returnAmount,
    rawDebtAmount,
    normalizedDebtAmount,
    debtAmount: normalizedDebtAmount,
    zeroToleranceApplied: Math.abs(rawDebtAmount) <= DEFAULT_ZERO_TOLERANCE && rawDebtAmount !== normalizedDebtAmount,
    zeroToleranceAdjustmentAmount: money(rawDebtAmount - normalizedDebtAmount)
  };
}

function buildNoChangeCorrectionInput({ order, allocation, reason, note, actor, source, manualSnapshot, manualContext }) {
  const code = orderCode(order) || allocation.orderCode || orderId(order);
  const finalState = manualSnapshot || {
    cashAmount: money(allocation.cashAmount),
    bankAmount: money(allocation.bankAmount),
    rewardAmount: money(allocation.rewardAmount),
    returnAmount: money(allocation.returnAmount),
    debtAmount: money(allocation.debtAmount)
  };
  const totalCollected = money(finalState.cashAmount + finalState.bankAmount + finalState.rewardAmount);
  // Match the popup payload: when the user presses Save without changing any value,
  // correctedCashLines is empty and paymentCorrection carries the final-state values.
  // Do not pass a custom idempotencyKey here; createCorrection() must build the same
  // stable idempotency key as the manual Save route.
  return {
    originalCloseoutId: text(orderId(order) || code),
    closeoutId: text(manualContext && manualContext.closeoutId),
    closeoutCode: text(manualContext && manualContext.closeoutCode),
    closeoutVersionId: text(manualContext && manualContext.closeoutVersionId),
    closeoutVersionCode: text(manualContext && manualContext.closeoutVersionCode),
    orderId: orderId(order),
    orderCode: code,
    salesOrderId: orderId(order),
    salesOrderCode: code,
    correctedReturnItems: [],
    correctedCashLines: [],
    paymentCorrection: {
      currentCashAmount: finalState.cashAmount,
      correctedCashAmount: finalState.cashAmount,
      cashDeltaAmount: 0,
      currentBankAmount: finalState.bankAmount,
      correctedBankAmount: finalState.bankAmount,
      bankDeltaAmount: 0,
      currentRewardAmount: finalState.rewardAmount,
      correctedRewardAmount: finalState.rewardAmount,
      rewardDeltaAmount: 0,
      currentTotalCollected: totalCollected,
      correctedTotalCollected: totalCollected,
      totalCollectedDelta: 0
    },
    reason: text(reason || 'Bulk ghi nhận lại điều chỉnh'),
    note: text(note || 'Bulk replay thao tác Lưu điều chỉnh đơn giao'),
    actor,
    source: source || 'bulk',
    bulkReplayManualSave: true
  };
}

function ledgerAmount(entry = {}) {
  if (!entry) return 0;
  return Math.max(money(entry.debit), money(entry.debitAmount), money(entry.credit), money(entry.creditAmount), money(entry.amount));
}

function itemFromResult({ order, allocation, preflight, result, after, status, reason, error }) {
  const ledger = result && (result.arDebtAdjustmentLedger || (result.arDebtAdjustment && (result.arDebtAdjustment.entry || result.arDebtAdjustment.ledger)) || result.ledger);
  const before = preflight || {};
  const afterBalance = after && typeof after.currentArBalance === 'number' ? after.currentArBalance : (result && result.arDebtAdjustment && result.arDebtAdjustment.afterBalance);
  return {
    orderCode: orderCode(order) || allocation.orderCode,
    customerCode: text(order.customerCode || allocation.customerCode),
    customerName: text(order.customerName || allocation.customerName),
    closeoutId: text(allocation.sourceId || allocation.closeoutId),
    closeoutVersion: Number(allocation.sourceVersion || 0) || 0,
    sourceVersion: Number(allocation.sourceVersion || 0) || 0,
    receivableAmount: money(allocation.receivableAmount),
    cashAmount: money(allocation.cashAmount),
    bankAmount: money(allocation.bankAmount),
    rewardAmount: money(allocation.rewardAmount),
    returnAmount: money(allocation.returnAmount),
    expectedDebtAmount: money(before.expectedDebtAmount ?? allocation.debtAmount),
    arBalanceBefore: money(before.currentArBalance),
    arBalanceAfter: money(afterBalance ?? before.currentArBalance),
    debtAdjustmentAmount: ledgerAmount(ledger),
    createdLedgerId: text(ledger && (ledger.id || ledger._id || ledger.code)),
    createdCorrectionVersion: Boolean(result && result.newCloseoutVersion),
    createdDebtAdjustment: Boolean(ledger && ledgerAmount(ledger) > 0),
    idempotencyKey: text((ledger && ledger.idempotencyKey) || (result && result.correction && result.correction.idempotencyKey)),
    payloadBuiltLikeManualSave: true,
    manualSaveRouteUsed: true,
    calledService: 'deliveryCloseoutCorrectionService.createCorrection',
    correctionCreated: Boolean(result && result.correction),
    correctionVersion: Number((result && result.newCloseoutVersion && result.newCloseoutVersion.closeoutVersion) || (result && result.correction && result.correction.newCloseoutVersion) || allocation.sourceVersion || 0) || 0,
    createdArLedgerIds: ledger && (ledger.id || ledger._id || ledger.code) ? [text(ledger.id || ledger._id || ledger.code)] : [],
    status: status === 'skipped' ? 'skipped_already_synced' : status,
    reason: text(reason || (result && result.message) || ''),
    error: error ? text(error.message || error) : ''
  };
}

async function buildContextForOrder(input = {}, options = {}) {
  const order = await findOrder(input, options);
  const latestVersion = await latestVersionForOrder(order, options);
  const closeout = buildEffectiveCloseout(order, latestVersion);
  const allocation = buildAllocation(order, closeout, {
    zeroTolerance: options.zeroTolerance || DEFAULT_ZERO_TOLERANCE,
    sourceType: 'BULK_DELIVERY_ADJUSTMENT_COMMIT',
    sourceId: text(closeout.sourceId || orderId(order) || orderCode(order)),
    sourceCode: text(closeout.sourceCode || orderCode(order) || orderId(order)),
    sourceVersion: Number(closeout.sourceVersion || 1) || 1
  });
  return { order, latestVersion, closeout, allocation };
}

async function preflightReconcile(order = {}, allocation = {}, options = {}) {
  return OrderPaymentDebtReconcileService.reconcileOrderDebt({
    order,
    allocation,
    apply: false,
    session: options.session,
    zeroTolerance: options.zeroTolerance || DEFAULT_ZERO_TOLERANCE,
    actor: actorName(options.actor || 'accountant'),
    sourceType: 'BULK_DELIVERY_ADJUSTMENT_COMMIT',
    sourceId: text(allocation.sourceId || allocation.allocationCode || allocation.orderCode),
    sourceCode: text(allocation.sourceCode || allocation.orderCode),
    sourceModel: 'deliveryCloseoutCorrections',
    reason: text(options.reason || 'Bulk ghi nhận lại điều chỉnh công nợ'),
    note: text(options.note || 'Dry-run bulk adjustment commit')
  });
}

async function commitOneAdjustment(input = {}, options = {}) {
  const actor = input.actor || options.actor || 'accountant';
  const actorText = actorName(actor);

  if (input.passthroughInput && typeof input.passthroughInput === 'object') {
    const result = await deliveryCloseoutCorrectionService.createCorrection({
      ...input.passthroughInput,
      actor
    }, { ...options, actor: actorText });
    return {
      ...result,
      bulkCommit: false,
      status: result && result.success ? 'processed' : 'error'
    };
  }

  const context = await buildContextForOrder(input, options);
  const manualSnapshot = hasManualPaymentSnapshot(input) ? manualSnapshotFromInput(input, context.allocation) : null;
  const effectiveAllocation = manualSnapshot ? allocationWithManualSnapshot(context.allocation, manualSnapshot) : context.allocation;
  const preflight = await preflightReconcile(context.order, effectiveAllocation, { ...options, actor, reason: input.reason, note: input.note });

  if (input.dryRun || options.dryRun) {
    return {
      success: true,
      dryRun: true,
      status: preflight.needsAdjustment ? 'dry_run' : 'skipped',
      reason: preflight.needsAdjustment ? 'dry_run_needs_manual_save_replay' : (preflight.skipReason || 'already_synced'),
      payloadBuiltLikeManualSave: true,
      manualSaveRouteUsed: true,
      calledService: 'deliveryCloseoutCorrectionService.createCorrection',
      preflight,
      item: itemFromResult({
        order: context.order,
        allocation: effectiveAllocation,
        preflight,
        status: preflight.needsAdjustment ? 'dry_run' : 'skipped',
        reason: preflight.needsAdjustment ? 'Dry-run: sẽ replay Lưu điều chỉnh' : (preflight.skipReason || 'AR đã khớp công nợ kỳ vọng')
      })
    };
  }

  const correctionInput = buildNoChangeCorrectionInput({
    order: context.order,
    allocation: effectiveAllocation,
    reason: input.reason,
    note: input.note,
    actor,
    source: input.source || 'bulk',
    manualSnapshot,
    manualContext: input
  });
  // Critical: do not pre-skip before replaying the same manual Save correction route.
  // The existing correction service owns the immutable correction version and AR posting behavior.
  const result = await deliveryCloseoutCorrectionService.createCorrection(correctionInput, { ...options, actor: actorText });
  const after = await preflightReconcile(context.order, effectiveAllocation, { ...options, actor, reason: input.reason, note: input.note });
  const verified = !after.needsAdjustment;
  const idempotent = Boolean(result && result.idempotent);
  const status = verified ? (idempotent ? 'skipped' : 'processed') : 'manual_review';
  return {
    ...result,
    success: result && result.success !== false,
    status,
    preflight,
    after,
    item: itemFromResult({
      order: context.order,
      allocation: effectiveAllocation,
      preflight,
      result,
      after,
      status,
      reason: verified ? (idempotent ? 'skipped_already_synced' : (result && result.message)) : 'AR vẫn lệch sau khi bulk replay Lưu điều chỉnh; cần kiểm tra thủ công'
    }),
    payloadBuiltLikeManualSave: true,
    manualSaveRouteUsed: true,
    calledService: 'deliveryCloseoutCorrectionService.createCorrection',
    correctionInputDebug: {
      originalCloseoutId: correctionInput.originalCloseoutId,
      orderCode: correctionInput.orderCode,
      cashAmount: correctionInput.paymentCorrection.correctedCashAmount,
      bankAmount: correctionInput.paymentCorrection.correctedBankAmount,
      rewardAmount: correctionInput.paymentCorrection.correctedRewardAmount
    }
  };
}

module.exports = {
  commitOneAdjustment,
  buildContextForOrder,
  _internal: {
    text,
    money,
    hash,
    stableJson,
    paymentStateHash,
    hasManualPaymentSnapshot,
    manualSnapshotFromInput,
    allocationWithManualSnapshot,
    buildNoChangeCorrectionInput,
    preflightReconcile,
    buildAllocation,
    buildEffectiveCloseout,
    latestVersionForOrder,
    findOrder
  }
};
