'use strict';

const dateUtil = require('../../utils/date.util');
const orderRepository = require('../../repositories/orderRepository');
const auditService = require('../auditService');
const { withMongoTransaction } = require('../../utils/transaction.util');
const { compactDeliveryOrderKeys } = require('../master-order/masterOrderIdentity.util');
const { findReturnOrdersForDeliveryChildren } = require('../master-order/masterOrderReturn.impl');
const DeliveryCloseoutService = require('./DeliveryCloseoutService');
const ArDebtOpenPostingService = require('./ArDebtOpenPostingService');
const readModelSyncJobService = require('../readModelSyncJob.service');

const CONFIRM_GUARD_TTL_MS = Math.max(1000, Number(process.env.CLOSEOUT_CONFIRM_GUARD_TTL_MS || 8000));
const inFlight = new Map();

function clean(value = '') {
  return String(value ?? '').trim();
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => clean(value))
    .filter(Boolean))];
}

function normalizeOrderIds(body = {}) {
  return unique(Array.isArray(body.orderIds) ? body.orderIds : [body.orderId, body.id, body.code]);
}

function isCompletedDelivery(order = {}) {
  return ['delivered', 'success', 'completed', 'done'].includes(clean(order.deliveryStatus || order.status).toLowerCase());
}

function guardKey(date, orderIds = [], actor = '') {
  return JSON.stringify({ date, actor: clean(actor).toLowerCase(), orderIds: unique(orderIds).sort() });
}

function cleanupGuards(now = Date.now()) {
  for (const [key, entry] of inFlight.entries()) {
    if (!entry || entry.expiresAt <= now) inFlight.delete(key);
  }
}

function groupReturnOrdersBySalesOrder(returnOrders = [], orders = []) {
  const result = new Map();
  for (const order of orders) {
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

function compactCloseoutForOrder(closeout = {}) {
  return {
    originalAmount: closeout.originalAmount,
    deliveredAmount: closeout.deliveredAmount,
    returnedAmount: closeout.returnedAmount,
    cashAmount: closeout.cashAmount,
    bankAmount: closeout.bankAmount,
    collectedAmount: closeout.collectedAmount,
    offsetAmount: closeout.offsetAmount,
    rewardAmount: closeout.rewardAmount,
    rawFinalDebtAmount: closeout.rawFinalDebtAmount,
    finalDebtAmount: closeout.finalDebtAmount,
    returnOrderIds: Array.isArray(closeout.returnOrderIds) ? closeout.returnOrderIds : [],
    paymentIds: Array.isArray(closeout.paymentIds) ? closeout.paymentIds : [],
    status: closeout.status,
    version: closeout.version,
    calculationHash: closeout.calculationHash,
    sourceHash: closeout.sourceHash,
    createdAt: closeout.createdAt,
    createdBy: closeout.createdBy,
    updatedAt: closeout.updatedAt,
    updatedBy: closeout.updatedBy,
    confirmedAt: closeout.confirmedAt,
    confirmedBy: closeout.confirmedBy,
    reason: closeout.reason || ''
  };
}

function stripOperationalDetails(closeout = {}) {
  return compactCloseoutForOrder(closeout);
}


function buildCloseoutDiagnostic(order = {}, closeout = {}, arResult = null) {
  const normalizedDebtAmount = DeliveryCloseoutService.normalizeDebtAmount(closeout.finalDebtAmount);
  const diagnostic = {
    orderCode: DeliveryCloseoutService.orderCode(order),
    customerCode: clean(order.customerCode),
    receivableAmount: DeliveryCloseoutService._internal.money(closeout.originalAmount),
    cashAmount: DeliveryCloseoutService._internal.money(closeout.cashAmount),
    bankAmount: DeliveryCloseoutService._internal.money(closeout.bankAmount),
    rewardAmount: DeliveryCloseoutService._internal.money(closeout.offsetAmount ?? closeout.rewardAmount),
    offsetAmount: DeliveryCloseoutService._internal.money(closeout.offsetAmount),
    returnAmount: DeliveryCloseoutService._internal.money(closeout.returnedAmount),
    rawDebtAmount: DeliveryCloseoutService._internal.money(closeout.rawFinalDebtAmount),
    normalizedDebtAmount,
    action: normalizedDebtAmount > 0 ? 'posted_ar_debt_open' : (normalizedDebtAmount < 0 ? 'overpaid_or_negative_debt' : 'skipped_zero_debt')
  };
  if (arResult && arResult.entry) {
    diagnostic.ledgerId = arResult.entry.id || arResult.entry._id;
    diagnostic.idempotencyKey = arResult.entry.idempotencyKey;
  }
  return diagnostic;
}

function isAccountingConfirmed(order = {}) {
  const accountingStatus = clean(order.accountingStatus).toLowerCase();
  const closeoutStatus = clean(order.deliveryCloseout?.status || order.closeoutStatus || order.deliveryCloseoutStatus).toLowerCase();
  return order.accountingConfirmed === true
    || accountingStatus === 'confirmed'
    || closeoutStatus === 'accounting_confirmed'
    || closeoutStatus === 'corrected_confirmed'
    || closeoutStatus === 'closed';
}

function confirmedDebtAmount(order = {}) {
  const closeout = order.deliveryCloseout || {};
  return DeliveryCloseoutService.positiveMoney(
    closeout.finalDebtAmount ?? order.debtAmount ?? order.debt ?? order.arBalance ?? 0
  );
}

function buildAlreadyConfirmedResult(order = {}, reason = 'already_accounting_confirmed') {
  const closeout = order.deliveryCloseout || {};
  const finalDebtAmount = confirmedDebtAmount(order);
  const result = {
    skipped: true,
    idempotent: true,
    status: 'skipped',
    reason,
    orderId: DeliveryCloseoutService.orderId(order),
    orderCode: DeliveryCloseoutService.orderCode(order),
    accountingConfirmed: true,
    finalDebtAmount,
    debtAmount: finalDebtAmount,
    arStatus: clean(order.arStatus || (finalDebtAmount > 0 ? 'ar_debt_opened' : 'paid')),
    closeout,
    diagnostic: buildCloseoutDiagnostic(order, closeout, null)
  };
  result.diagnostic.action = 'skipped_already_accounting_confirmed';
  return result;
}

function buildConfirmedOrderPatchFields(order = {}, closeout = {}, actor = 'accountant') {
  const finalDebt = DeliveryCloseoutService.positiveMoney(closeout.finalDebtAmount);
  const now = dateUtil.nowIso();
  return {
    deliveryCloseout: stripOperationalDetails(closeout),
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingLocked: true,
    editLocked: true,
    deliveryLocked: true,
    accountingConfirmedAt: order.accountingConfirmedAt || closeout.confirmedAt || now,
    accountingConfirmedBy: order.accountingConfirmedBy || actor,
    debtAmount: finalDebt,
    debt: finalDebt,
    arBalance: finalDebt,
    arStatus: finalDebt > 0 ? 'ar_debt_opened' : 'paid',
    lifecycleStatus: finalDebt > 0 ? 'ar_debt_opened' : 'paid',
    updatedAt: now
  };
}

async function loadOrders(selectedOrderIds = []) {
  const rows = await orderRepository.findManyByIdentity(selectedOrderIds, {
    limit: Math.max(1, selectedOrderIds.length),
    projection: [
      'id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderId', 'salesOrderCode',
      'date', 'orderDate', 'deliveryDate', 'createdAt', 'updatedAt',
      'customerId', 'customerCode', 'customerName', 'customerPhone', 'customerAddress', 'phone', 'address',
      'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName', 'nvbhCode', 'nvbhName',
      'deliveryStaffCode', 'deliveryStaffName', 'deliveryCode', 'deliveryName', 'nvghCode', 'nvghName',
      'status', 'deliveryStatus', 'accountingStatus', 'accountingConfirmed', 'accountingLocked',
      'cashClosed', 'cashSubmitted', 'dayLocked', 'periodLocked', 'settlementClosed', 'editLocked', 'deliveryLocked',
      'totalAmount', 'subtotal', 'discountAmount', 'finalAmount', 'payableAmount', 'debtBeforeCollection', 'debtAmount', 'debt', 'arBalance',
      'paidAmount', 'cashCollected', 'cashAmount', 'bankCollected', 'bankAmount', 'transferAmount',
      'returnAmount', 'returnedAmount', 'returnAmountFromReturnOrders', 'syncedReturnAmountFromReturnOrders',
      'paymentAllocations', 'deliveryPayment', 'deliveryPayments', 'payments', 'items', 'lines', 'products',
      'masterOrderId', 'masterOrderCode', 'deliveryMasterId', 'deliveryMasterCode', 'masterId', 'masterCode',
      'deliveryCloseout', 'version', 'note', 'deliveryNote'
    ].join(' ')
  });
  return rows || [];
}

function orderIdentityValues(order = {}) {
  return unique([
    order.id,
    order._id,
    order.code,
    order.orderCode,
    order.documentCode,
    order.invoiceCode,
    order.salesOrderId,
    order.salesOrderCode
  ]);
}

function orderMatchesInputId(order = {}, inputId = '') {
  const key = clean(inputId);
  return Boolean(key) && orderIdentityValues(order).includes(key);
}

function orderDeliveryDate(order = {}) {
  return dateUtil.toDateOnly(order.deliveryDate || order.date || order.orderDate || order.createdAt || '');
}

function orderDeliveryStaffCode(order = {}) {
  return clean(order.deliveryStaffCode || order.deliveryCode || order.nvghCode);
}

function orderSalesStaffCode(order = {}) {
  return clean(order.salesStaffCode || order.salesmanCode || order.nvbhCode);
}

function validateSelectedOrderScope(orders = [], body = {}, selectedOrderIds = []) {
  if (!Array.isArray(selectedOrderIds) || !selectedOrderIds.length) {
    return { error: 'Vui lòng chọn ít nhất một đơn để chốt sổ.', status: 400, code: 'ORDER_SELECTION_REQUIRED' };
  }
  const missing = selectedOrderIds.filter((id) => !orders.some((order) => orderMatchesInputId(order, id)));
  if (missing.length) {
    return { error: `Không tìm thấy hoặc không được phép chốt ${missing.length} đơn đã chọn.`, status: 404, code: 'ORDER_SELECTION_NOT_FOUND', missingOrderIds: missing };
  }

  const requestedDate = dateUtil.toDateOnly(body.deliveryDate || body.date || '');
  if (requestedDate) {
    const mismatched = orders.filter((order) => orderDeliveryDate(order) && orderDeliveryDate(order) !== requestedDate);
    if (mismatched.length) {
      return { error: 'Có đơn không thuộc đúng ngày giao đang chốt.', status: 400, code: 'ORDER_SELECTION_DATE_MISMATCH', orderIds: mismatched.map((order) => clean(order.id || order.code || order.orderCode)) };
    }
  }

  const requestedDelivery = clean(body.deliveryStaffCode || body.delivery || body.nvghCode);
  if (requestedDelivery) {
    const mismatched = orders.filter((order) => orderDeliveryStaffCode(order) && orderDeliveryStaffCode(order) !== requestedDelivery);
    if (mismatched.length) {
      return { error: 'Có đơn không thuộc đúng NVGH đang chốt.', status: 400, code: 'ORDER_SELECTION_DELIVERY_STAFF_MISMATCH', orderIds: mismatched.map((order) => clean(order.id || order.code || order.orderCode)) };
    }
  }

  const requestedSales = unique(Array.isArray(body.salesStaffCodes) ? body.salesStaffCodes : [body.salesStaffCode, body.salesman, body.nvbhCode]);
  if (requestedSales.length) {
    const mismatched = orders.filter((order) => {
      const code = orderSalesStaffCode(order);
      return code && !requestedSales.includes(code);
    });
    if (mismatched.length) {
      return { error: 'Có đơn không thuộc đúng NVBH đã chọn.', status: 400, code: 'ORDER_SELECTION_SALES_STAFF_MISMATCH', orderIds: mismatched.map((order) => clean(order.id || order.code || order.orderCode)) };
    }
  }

  return null;
}

async function confirmOneOrder(order = {}, returnOrders = [], options = {}) {
  const actor = clean(options.actor || 'accountant');
  if (isAccountingConfirmed(order)) return buildAlreadyConfirmedResult(order);
  if (!isCompletedDelivery(order)) return { skipped: true, status: 'skipped', reason: 'delivery_not_completed', orderId: DeliveryCloseoutService.orderId(order), orderCode: DeliveryCloseoutService.orderCode(order) };

  const existingCloseout = order.deliveryCloseout || {};
  const computed = DeliveryCloseoutService.buildCloseout(order, returnOrders, [], {
    actor,
    status: existingCloseout.status || 'pending_accounting',
    reason: clean(options.reason || options.closeoutReason || '')
  });

  if (DeliveryCloseoutService.hasReturnSignalWithoutReturnOrders(order, computed)) {
    const err = new Error('Đơn có số tiền hàng trả trên app/salesOrders nhưng chưa có returnOrders hợp lệ. Chặn xác nhận kế toán để tránh lệch tồn kho/công nợ.');
    err.code = 'ACCOUNTING_CONFIRM_BLOCKED_MISSING_RETURNORDERS';
    err.orderId = DeliveryCloseoutService.orderId(order);
    err.orderCode = DeliveryCloseoutService.orderCode(order);
    throw err;
  }

  const compare = DeliveryCloseoutService.compareCloseout(computed, existingCloseout);
  if (!compare.ok) {
    const err = new Error('deliveryCloseout hiện tại lệch với dữ liệu tính lại từ salesOrders/returnOrders/tiền giao hàng. Chặn xác nhận kế toán.');
    err.code = 'DELIVERY_CLOSEOUT_CALCULATION_MISMATCH';
    err.orderId = DeliveryCloseoutService.orderId(order);
    err.orderCode = DeliveryCloseoutService.orderCode(order);
    err.mismatches = compare.mismatches;
    throw err;
  }

  // finalDebtAmount âm lớn là overpayment/exception: vẫn khóa closeout nhưng không sinh công nợ âm.
  const confirmedCloseout = DeliveryCloseoutService.confirmCloseout(order, computed, { actor, reason: clean(options.reason || options.closeoutReason || '') });
  const patch = buildConfirmedOrderPatchFields(order, confirmedCloseout, actor);
  const patchResult = await orderRepository.patchAccountingCloseoutById(DeliveryCloseoutService.orderId(order), patch, options);
  if (!patchResult || Number(patchResult.matchedCount || 0) === 0) {
    const latest = await orderRepository.findByIdOrCode(DeliveryCloseoutService.orderId(order), {
      session: options.session,
      projection: 'id code orderCode customerCode customerName accountingConfirmed accountingStatus deliveryCloseout debtAmount debt arBalance arStatus'
    });
    if (isAccountingConfirmed(latest || order)) return buildAlreadyConfirmedResult(latest || order);
    const err = new Error('Không thể cập nhật chốt sổ vì đơn không tồn tại hoặc không còn ở trạng thái cho phép chốt.');
    err.code = 'ORDER_NOT_FOUND_OR_NOT_UPDATABLE';
    err.orderId = DeliveryCloseoutService.orderId(order);
    err.orderCode = DeliveryCloseoutService.orderCode(order);
    err.patchResult = patchResult;
    throw err;
  }
  const updatedOrderForLedger = {
    ...order,
    ...patch
  };
  const arResult = await ArDebtOpenPostingService.postDebtOpen(updatedOrderForLedger, confirmedCloseout, {
    ...options,
    skipReadModelRebuild: true,
    note: clean(options.note || options.reason || `Mở công nợ cuối cùng từ chốt giao hàng ${DeliveryCloseoutService.orderCode(order)}`)
  });
  await auditService.log('ACCOUNTING_CONFIRM_DELIVERY_CLOSEOUT', {
    refType: 'SALES_ORDER',
    refId: DeliveryCloseoutService.orderId(order),
    refCode: DeliveryCloseoutService.orderCode(order),
    user: actor,
    note: `Xác nhận kế toán chốt giao hàng: finalDebt=${confirmedCloseout.finalDebtAmount}, AR=${arResult.posted ? 'AR-DEBT-OPEN' : arResult.reason || 'idempotent'}, reason=${clean(options.reason || options.closeoutReason || '')}`
  });
  return {
    confirmed: true,
    status: 'confirmed',
    orderId: DeliveryCloseoutService.orderId(order),
    orderCode: DeliveryCloseoutService.orderCode(order),
    affectedSourceId: clean(arResult?.entry?.sourceId || DeliveryCloseoutService.orderId(order)),
    affectedCustomerCode: clean(order.customerCode),
    readModelSyncNeeded: arResult?.posted === true,
    closeout: confirmedCloseout,
    arDebtOpen: arResult,
    patchResult,
    diagnostic: buildCloseoutDiagnostic(order, confirmedCloseout, arResult)
  };
}

async function confirmDeliveryAccountingInternal(body = {}, normalized = {}) {
  const date = normalized.date || dateUtil.toDateOnly(body.date || dateUtil.todayVN());
  const selectedOrderIds = normalized.selectedOrderIds || normalizeOrderIds(body);
  if (!selectedOrderIds.length) return { error: 'Vui lòng chọn ít nhất một đơn để xác nhận kế toán', status: 400 };
  const actor = clean(normalized.confirmedBy || body.confirmedBy || body.userName || body.accountantName || 'accountant');
  const reason = clean(normalized.reason || body.reason || body.note || 'Chốt sổ giao hàng cuối ngày');
  const orders = await loadOrders(selectedOrderIds);
  if (!orders.length) return { error: `Không tìm thấy đơn đã chọn trong ngày ${date} để kế toán xác nhận`, status: 404, code: 'ORDER_SELECTION_NOT_FOUND' };
  const scopeError = validateSelectedOrderScope(orders, body, selectedOrderIds);
  if (scopeError) return scopeError;

  const alreadyConfirmedOrders = orders.filter(isAccountingConfirmed);
  const pendingConfirmOrders = orders.filter((order) => !isAccountingConfirmed(order));
  const results = alreadyConfirmedOrders.map((order) => buildAlreadyConfirmedResult(order));

  if (!pendingConfirmOrders.length) {
    const diagnostics = results.map((row) => row.diagnostic).filter(Boolean);
    return {
      ok: true,
      status: 'idempotent',
      processed: 0,
      skipped: results.length,
      date,
      confirmedOrders: 0,
      skippedOrders: results.length,
      totalOrders: orders.length,
      architecture: 'salesOrders.deliveryCloseout -> single AR-DEBT-OPEN',
      arPolicy: 'no AR-SALE / AR-RETURN / AR-RECEIPT from delivery accounting',
      results,
      diagnostics,
      warnings: [],
      readModelRebuilds: [],
      readModelSync: { mode: 'skipped', queued: 0, status: 'not_needed' },
      reason,
      message: 'Các đơn đã được kế toán chốt trước đó. Hệ thống bỏ qua để tránh ghi lại SalesOrder, sinh trùng AR-DEBT-OPEN hoặc rebuild công nợ không cần thiết.'
    };
  }

  const returnOrders = await findReturnOrdersForDeliveryChildren(pendingConfirmOrders);
  const returnByKey = groupReturnOrdersBySalesOrder(returnOrders, pendingConfirmOrders);

  const readModelSyncJobs = [];
  await withMongoTransaction(async (session) => {
    for (const order of pendingConfirmOrders) {
      const rows = returnOrdersForOrder(order, returnByKey);
      const result = await confirmOneOrder(order, rows, { session, actor, confirmedBy: actor, reason, note: reason });
      results.push(result);
    }

    const readModelAffectedResults = results.filter((row) => row && row.confirmed && row.readModelSyncNeeded);
    const syncGroups = new Map();
    for (const row of readModelAffectedResults) {
      const customerCode = clean(row.affectedCustomerCode);
      const sourceId = clean(row.affectedSourceId || row.orderId);
      if (!customerCode && !sourceId) continue;
      const key = customerCode || '(missing-customer)';
      if (!syncGroups.has(key)) syncGroups.set(key, { customerCode, sourceIds: [] });
      if (sourceId) syncGroups.get(key).sourceIds.push(sourceId);
    }
    for (const group of syncGroups.values()) {
      readModelSyncJobs.push(await readModelSyncJobService.enqueueArDebtSyncJobs({
        customerCode: group.customerCode,
        sourceIds: unique(group.sourceIds),
        reason,
        actor,
        source: 'DELIVERY_CLOSEOUT',
        metadata: { route: 'POST /api/new/delivery-today/closeout' }
      }, { session }));
    }
  });

  if (readModelSyncJobs.some((row) => Number(row.queued || 0) > 0)) {
    readModelSyncJobService.scheduleDrain({ limit: 10, actor, reason });
  }
  const readModelSyncQueued = readModelSyncJobs.reduce((sum, row) => sum + Number(row.queued || 0), 0);

  const confirmedOrders = results.filter((row) => row.confirmed).length;
  const skippedOrders = results.filter((row) => row.skipped).length;
  const diagnostics = results.map((row) => row.diagnostic).filter(Boolean);
  const warnings = diagnostics
    .filter((row) => row.normalizedDebtAmount < 0)
    .map((row) => ({ code: 'OVERPAID_OR_NEGATIVE_DEBT', orderCode: row.orderCode, customerCode: row.customerCode, normalizedDebtAmount: row.normalizedDebtAmount }));
  const status = confirmedOrders > 0 ? (skippedOrders > 0 ? 'partial' : 'confirmed') : 'idempotent';
  return {
    ok: true,
    status,
    processed: confirmedOrders,
    skipped: skippedOrders,
    date,
    confirmedOrders,
    skippedOrders,
    totalOrders: orders.length,
    architecture: 'salesOrders.deliveryCloseout -> single AR-DEBT-OPEN',
    arPolicy: 'no AR-SALE / AR-RETURN / AR-RECEIPT from delivery accounting',
    results,
    diagnostics,
    warnings,
    readModelRebuilds: [],
    readModelSync: { mode: 'queued', queued: readModelSyncQueued, status: readModelSyncQueued > 0 ? 'pending' : 'not_needed', jobs: readModelSyncJobs.flatMap((row) => row.jobs || []) },
    reason,
    message: confirmedOrders > 0
      ? `Kế toán đã xác nhận ${confirmedOrders} đơn theo deliveryCloseout. Bỏ qua ${skippedOrders} đơn đã chốt trước đó. Công nợ được đồng bộ nền.`
      : 'Các đơn đã được kế toán chốt trước đó.'
  };
}

async function confirmDeliveryAccounting(body = {}) {
  const date = dateUtil.toDateOnly(body.date || dateUtil.todayVN());
  const selectedOrderIds = normalizeOrderIds(body);
  if (!selectedOrderIds.length) return { error: 'Vui lòng chọn ít nhất một đơn để xác nhận kế toán', status: 400 };
  const confirmedBy = clean(body.confirmedBy || body.userName || body.accountantName || 'accountant');
  const reason = clean(body.reason || body.note || 'Chốt sổ giao hàng cuối ngày');
  const now = Date.now();
  cleanupGuards(now);
  const key = guardKey(date, selectedOrderIds, confirmedBy);
  const existing = inFlight.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.promise.then((result) => ({ ...result, duplicateSubmitSuppressed: true }));
  }
  const promise = confirmDeliveryAccountingInternal(body, { date, selectedOrderIds, confirmedBy, reason });
  inFlight.set(key, { expiresAt: now + CONFIRM_GUARD_TTL_MS, promise });
  try {
    const result = await promise;
    inFlight.set(key, { expiresAt: Date.now() + CONFIRM_GUARD_TTL_MS, promise: Promise.resolve(result) });
    return result;
  } catch (err) {
    inFlight.delete(key);
    throw err;
  }
}

module.exports = {
  confirmDeliveryAccounting,
  confirmDeliveryAccountingInternal,
  confirmOneOrder,
  loadOrders,
  groupReturnOrdersBySalesOrder,
  returnOrdersForOrder,
  _internal: {
    normalizeOrderIds,
    validateSelectedOrderScope,
    orderDeliveryDate,
    orderDeliveryStaffCode,
    orderSalesStaffCode,
    isCompletedDelivery,
    buildConfirmedOrderPatchFields,
    guardKey,
    stripOperationalDetails,
    compactCloseoutForOrder,
    isAccountingConfirmed,
    buildAlreadyConfirmedResult,
    buildCloseoutDiagnostic
  }
};
