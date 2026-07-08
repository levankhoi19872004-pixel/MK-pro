'use strict';

const crypto = require('node:crypto');
const dateUtil = require('../utils/date.util');
const { toNumber, makeId } = require('../utils/common.util');
const { calculateDeliveryDebtAmount, normalizeDebtAmount } = require('../constants/finance.constants');
const { withOptionalMongoTransaction } = require('../utils/transaction.util');
const SalesOrder = require('../models/SalesOrder');
const ReturnOrder = require('../models/ReturnOrder');
const returnOrderRepository = require('../repositories/returnOrderRepository');
const DeliveryCloseoutCorrection = require('../models/DeliveryCloseoutCorrection');
const DeliveryCloseoutVersion = require('../models/DeliveryCloseoutVersion');
const ArDebtAdjustmentPostingService = require('./accounting/ArDebtAdjustmentPostingService');
const OrderPaymentAllocationService = require('./accounting/OrderPaymentAllocationService');
const { emitDomainEventSafe } = require('./events/domainEventBus');
const { EVENT_TYPES } = require('./events/domainEventTypes');

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function quantity(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? n : 0;
}


function hasOwnValue(obj = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(obj || {}, key)
    && obj[key] !== undefined
    && obj[key] !== null
    && String(obj[key]).trim() !== '';
}

function firstExplicitMoneyValue(source = {}, keys = [], fallbackValue = 0) {
  for (const key of keys) {
    if (hasOwnValue(source, key)) return money(source[key]);
  }
  return money(fallbackValue);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function hash(value = '') {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

function shortHash(value = '') {
  return hash(value).slice(0, 12);
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

function closeoutStatus(order = {}) {
  const closeout = closeoutOf(order);
  return text(closeout.status || order.accountingStatus || order.status || order.deliveryStatus).toLowerCase();
}

function isCloseoutConfirmed(order = {}) {
  const closeout = closeoutOf(order);
  const versions = Array.isArray(closeout.versions) ? closeout.versions : [];
  const status = closeoutStatus(order);
  return ['accounting_confirmed', 'confirmed', 'closed', 'corrected_confirmed'].includes(status)
    || order.accountingConfirmed === true
    || versions.some((version) => ['accounting_confirmed', 'confirmed', 'closed', 'corrected_confirmed'].includes(text(version.status).toLowerCase()));
}

function assertConfirmedCloseout(order = {}) {
  if (!isCloseoutConfirmed(order)) {
    const err = new Error('Chỉ được tạo điều chỉnh khi closeout đã chốt/xác nhận kế toán.');
    err.code = 'DELIVERY_CLOSEOUT_NOT_CONFIRMED';
    err.status = 400;
    throw err;
  }
  return closeoutOf(order);
}

function closeoutVersionNumber(closeout = {}) {
  const direct = Number(closeout.closeoutVersion || closeout.version || 0);
  const versions = Array.isArray(closeout.versions) ? closeout.versions : [];
  const nestedMax = versions.reduce((max, row) => Math.max(max, Number(row.closeoutVersion || row.version || 0) || 0), 0);
  return Math.max(direct, nestedMax, 1);
}

function originalCloseoutIdentity(order = {}) {
  const closeout = closeoutOf(order);
  const base = orderId(order) || orderCode(order);
  const version = closeoutVersionNumber(closeout);
  const id = text(closeout.id || closeout.closeoutId || closeout.code || closeout.closeoutCode || `DCO-${base}-v${version}`);
  const code = text(closeout.code || closeout.closeoutCode || id);
  return { id, code, version };
}

function saleAmount(order = {}, closeout = {}) {
  return money(closeout.saleAmount ?? closeout.originalAmount ?? order.totalAmount ?? order.amount ?? order.total ?? order.finalAmount ?? order.orderAmount);
}

function previousReturnAmount(snapshot = {}) {
  return money(snapshot.returnAmount ?? snapshot.returnedAmount ?? snapshot.previousReturnAmount ?? 0);
}

function previousCashAmount(snapshot = {}) {
  return money(snapshot.cashAmount ?? snapshot.newCashAmount ?? snapshot.cashCollectedAmount ?? snapshot.previousCashAmount ?? snapshot.previousCashCollectedAmount ?? 0);
}

function previousBankAmount(snapshot = {}) {
  return money(snapshot.bankAmount ?? snapshot.newBankAmount ?? snapshot.transferAmount ?? snapshot.bankTransferAmount ?? snapshot.previousBankAmount ?? 0);
}

function previousRewardAmount(snapshot = {}) {
  return money(snapshot.rewardAmount ?? snapshot.newRewardAmount ?? snapshot.bonusAmount ?? snapshot.allowanceAmount ?? snapshot.previousRewardAmount ?? 0);
}

function previousDebtAmount(snapshot = {}, order = {}) {
  const explicit = snapshot.debtAmount ?? snapshot.finalDebtAmount ?? snapshot.previousDebtAmount;
  if (explicit !== undefined && explicit !== null && explicit !== '') return normalizeDebtAmount(explicit);
  const calculation = calculateDeliveryDebtAmount({
    receivableAmount: saleAmount(order, snapshot),
    cashAmount: previousCashAmount(snapshot),
    bankAmount: previousBankAmount(snapshot),
    rewardAmount: previousRewardAmount(snapshot),
    returnAmount: previousReturnAmount(snapshot)
  });
  return money(calculation.debtAmount);
}

function previousPaymentState(snapshot = {}, order = {}) {
  const receivableAmount = saleAmount(order, snapshot);
  const returnAmount = previousReturnAmount(snapshot);
  const cashAmount = previousCashAmount(snapshot);
  const bankAmount = previousBankAmount(snapshot);
  const rewardAmount = previousRewardAmount(snapshot);
  const debtAmount = previousDebtAmount(snapshot, order);
  const collectedAmount = money(cashAmount + bankAmount + rewardAmount);
  return { receivableAmount, returnAmount, cashAmount, bankAmount, rewardAmount, collectedAmount, debtAmount };
}


function firstOrderMoney(source = {}, keys = [], fallbackValue = 0) {
  for (const key of keys) {
    if (hasOwnValue(source, key)) return money(source[key]);
  }
  return money(fallbackValue);
}

function openOrderPaymentState(order = {}) {
  const closeout = closeoutOf(order);
  const receivableAmount = saleAmount(order, closeout);
  const returnAmount = firstOrderMoney(closeout, ['returnAmount', 'returnedAmount'], firstOrderMoney(order, ['returnAmount', 'returnedAmount', 'returnOrderAmount'], 0));
  const cashAmount = firstOrderMoney(closeout, ['cashAmount', 'cashCollectedAmount', 'cashReceivedAmount'], firstOrderMoney(order, ['cashAmount', 'cashCollectedAmount', 'cashReceivedAmount', 'paidCashAmount'], 0));
  const bankAmount = firstOrderMoney(closeout, ['bankAmount', 'bankTransferAmount', 'transferAmount'], firstOrderMoney(order, ['bankAmount', 'bankTransferAmount', 'transferAmount', 'paidBankAmount'], 0));
  const rewardAmount = firstOrderMoney(closeout, ['rewardAmount', 'bonusAmount', 'allowanceAmount'], firstOrderMoney(order, ['rewardAmount', 'bonusAmount', 'allowanceAmount'], 0));
  const debtCalculation = calculateDeliveryDebtAmount({
    receivableAmount,
    cashAmount,
    bankAmount,
    rewardAmount,
    returnAmount
  });
  const explicitDebt = closeout.finalDebtAmount ?? closeout.debtAmount;
  const debtAmount = explicitDebt !== undefined && explicitDebt !== null && explicitDebt !== ''
    ? normalizeDebtAmount(explicitDebt)
    : money(debtCalculation.debtAmount);
  const collectedAmount = money(cashAmount + bankAmount + rewardAmount);
  return { receivableAmount, returnAmount, cashAmount, bankAmount, rewardAmount, collectedAmount, debtAmount };
}

function paymentMethodOf(line = {}) {
  const method = text(line.paymentMethod || line.method || line.type || 'cash').toLowerCase();
  if (['bank', 'transfer', 'ck', 'wire', 'bank_transfer'].includes(method)) return 'bank';
  if (['reward', 'bonus', 'allowance', 'promotion', 'offset'].includes(method)) return 'reward';
  return 'cash';
}

function finalPaymentStateFromInput(input = {}, rawLines = [], currentState = {}) {
  const paymentCorrection = input.paymentCorrection && typeof input.paymentCorrection === 'object' ? input.paymentCorrection : {};
  const next = {
    cashAmount: firstExplicitMoneyValue(paymentCorrection, ['correctedCashAmount', 'cashAmount', 'newCashAmount', 'finalCashAmount'], currentState.cashAmount),
    bankAmount: firstExplicitMoneyValue(paymentCorrection, ['correctedBankAmount', 'bankAmount', 'newBankAmount', 'finalBankAmount'], currentState.bankAmount),
    rewardAmount: firstExplicitMoneyValue(paymentCorrection, ['correctedRewardAmount', 'rewardAmount', 'newRewardAmount', 'finalRewardAmount'], currentState.rewardAmount)
  };

  for (const line of Array.isArray(rawLines) ? rawLines : []) {
    const method = paymentMethodOf(line);
    const key = method === 'bank' ? 'bankAmount' : method === 'reward' ? 'rewardAmount' : 'cashAmount';
    next[key] = firstExplicitMoneyValue(line, ['newAmount', 'correctedAmount', 'finalAmount', 'amount', 'correctedCashAmount', 'correctedBankAmount', 'correctedRewardAmount'], currentState[key]);
  }

  next.collectedAmount = money(next.cashAmount + next.bankAmount + next.rewardAmount);
  return next;
}

function buildFinalPaymentLines(currentState = {}, nextState = {}) {
  return [
    { paymentMethod: 'cash', oldAmount: money(currentState.cashAmount), newAmount: money(nextState.cashAmount) },
    { paymentMethod: 'bank', oldAmount: money(currentState.bankAmount), newAmount: money(nextState.bankAmount) },
    { paymentMethod: 'reward', oldAmount: money(currentState.rewardAmount), newAmount: money(nextState.rewardAmount) }
  ].map((line) => ({
    ...line,
    adjustmentAmount: money(line.newAmount - line.oldAmount),
    note: '',
    correctionSemantics: 'final_state_value'
  }));
}

function itemAdjustmentAmount(item = {}) {
  if (item.adjustmentAmount !== undefined) return money(item.adjustmentAmount);
  if (item.oldAmount !== undefined || item.newAmount !== undefined) return money(item.newAmount) - money(item.oldAmount);
  const oldQty = quantity(item.oldReturnQty ?? item.currentReturnQty ?? item.oldQty ?? item.oldQuantity ?? 0);
  const newQty = quantity(item.newReturnQty ?? item.desiredReturnQty ?? item.newQty ?? item.newQuantity ?? item.returnQty ?? item.qty ?? oldQty);
  const price = money(item.unitPrice ?? item.salePrice ?? item.price ?? item.finalPrice ?? 0);
  return money((newQty - oldQty) * price);
}

function returnAdjustmentInputItems(input = {}) {
  if (input.returnAdjustment && Array.isArray(input.returnAdjustment.items)) return input.returnAdjustment.items;
  if (Array.isArray(input.returnAdjustmentItems)) return input.returnAdjustmentItems;
  if (Array.isArray(input.correctedReturnItems)) return input.correctedReturnItems;
  return [];
}

function normalizeReturnAdjustmentItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const oldQty = quantity(item.oldReturnQty ?? item.currentReturnQty ?? item.oldQty ?? item.oldQuantity ?? 0);
    const newQty = quantity(item.newReturnQty ?? item.desiredReturnQty ?? item.newQty ?? item.newQuantity ?? item.returnQty ?? item.qty ?? oldQty);
    const unitPrice = money(item.unitPrice ?? item.salePrice ?? item.price ?? item.finalPrice ?? 0);
    const adjustmentQty = item.adjustmentQty !== undefined ? quantity(item.adjustmentQty) : quantity(newQty - oldQty);
    const adjustmentAmount = itemAdjustmentAmount({ ...item, oldReturnQty: oldQty, newReturnQty: newQty, unitPrice });
    return {
      productCode: text(item.productCode || item.code || item.sku),
      productName: text(item.productName || item.name || item.description),
      oldReturnQty: oldQty,
      currentReturnQty: oldQty,
      newReturnQty: newQty,
      desiredReturnQty: newQty,
      deliveredQty: quantity(item.deliveredQty ?? item.deliveryQty ?? item.shipQty ?? 0),
      unitPrice,
      adjustmentQty,
      deltaReturnQty: adjustmentQty,
      adjustmentAmount,
      deltaReturnAmount: adjustmentAmount,
      note: text(item.note || '')
    };
  });
}

function cashLineAdjustmentAmount(line = {}) {
  const currentAmount = firstExplicitMoneyValue(line, ['oldAmount', 'currentAmount', 'previousAmount'], 0);
  const correctedAmount = firstExplicitMoneyValue(line, ['newAmount', 'correctedAmount', 'finalAmount', 'amount'], currentAmount);
  return correctedAmount - currentAmount;
}

function normalizeCashAdjustmentLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).map((line) => {
    const oldAmount = firstExplicitMoneyValue(line, ['oldAmount', 'currentAmount', 'currentCashAmount', 'currentBankAmount', 'currentRewardAmount', 'previousAmount'], 0);
    const newAmount = firstExplicitMoneyValue(line, ['newAmount', 'correctedAmount', 'correctedCashAmount', 'correctedBankAmount', 'correctedRewardAmount', 'finalAmount', 'amount'], oldAmount);
    const adjustmentAmount = newAmount - oldAmount;
    return {
      paymentMethod: text(line.paymentMethod || line.method || 'cash'),
      oldAmount,
      newAmount,
      adjustmentAmount,
      note: text(line.note || ''),
      correctionSemantics: 'corrected_final_amount'
    };
  });
}

function sumAdjustments(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + money(row.adjustmentAmount), 0);
}

function validateCorrectionInput(input = {}, calculated = {}) {
  const paymentLabels = {
    cash: 'Tiền mặt sau điều chỉnh',
    bank: 'Chuyển khoản sau điều chỉnh',
    reward: 'Trả thưởng sau điều chỉnh'
  };
  for (const line of calculated.cashAdjustmentLines || []) {
    if (money(line.newAmount) < 0) {
      const label = paymentLabels[text(line.paymentMethod).toLowerCase()] || 'Tiền thu sau điều chỉnh';
      const err = new Error(`${label} không được âm.`);
      err.code = 'DELIVERY_CLOSEOUT_CORRECTION_NEGATIVE_CASH';
      err.status = 400;
      throw err;
    }
  }
  // No-change corrections are intentionally allowed. They create an immutable
  // closeout version/audit history without forcing a cash, bank, reward or return delta.
}

function correctionReason(input = {}) {
  return text(input.reason ?? input.adjustReason ?? input.correctionReason ?? '');
}

function correctionAuditReason(input = {}) {
  return correctionReason(input) || 'Điều chỉnh không ghi lý do';
}

function buildIdempotencyKey(input = {}, order = {}) {
  const closeout = originalCloseoutIdentity(order);
  return [
    'DELIVERY_CLOSEOUT_CORRECTION',
    closeout.id,
    hash(stableJson(returnAdjustmentInputItems(input))),
    hash(stableJson(input.correctedCashLines || input.cashAdjustmentLines || [])),
    hash(stableJson(input.paymentCorrection || {})),
    hash(stableJson({ returnAdjustmentAmount: money(input.returnAdjustmentAmount), cashAdjustmentAmount: money(input.cashAdjustmentAmount), debtAdjustmentAmount: input.debtAdjustmentAmount === undefined ? null : money(input.debtAdjustmentAmount) })),
    hash(correctionReason(input))
  ].join(':');
}

function buildOrderLookup(ref = '') {
  const value = text(ref);
  if (!value) return null;
  return {
    $or: [
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
    ]
  };
}

function isMongoObjectId(value = '') {
  return /^[a-fA-F0-9]{24}$/.test(text(value));
}

function isCloseoutContextId(value = '') {
  return /^(DCO|DTC|DCOV|DCOA|DCOC)[-_]/i.test(text(value));
}

function uniqueText(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function queryWithOptionalSession(query, options = {}) {
  return options.session && query && typeof query.session === 'function' ? query.session(options.session) : query;
}

function correctionLookup(input = {}) {
  const directKeys = uniqueText([
    input.adjustmentCode,
    input.correctionCode,
    input.adjustmentId,
    input.correctionId,
    input.id,
    input.code
  ]);
  const or = [];
  for (const key of directKeys) {
    or.push(
      { id: key },
      { code: key },
      { correctionCode: key },
      { newCloseoutId: key },
      { newCloseoutCode: key },
      { originalCloseoutId: key },
      { originalCloseoutCode: key },
      { arDebtAdjustmentLedgerId: key },
      { arDebtAdjustmentLedgerCode: key }
    );
    if (isMongoObjectId(key)) or.push({ _id: key });
  }
  if (or.length) return { $or: or };

  const orderKeys = uniqueText([input.orderCode, input.salesOrderCode]);
  if (!orderKeys.length) return null;
  return {
    $or: orderKeys.flatMap((key) => ([
      { salesOrderCode: key },
      { orderCode: key }
    ]))
  };
}

function versionLookup(input = {}, correction = null) {
  const keys = uniqueText([
    input.closeoutVersionId,
    input.closeoutVersionCode,
    input.adjustmentCode,
    input.correctionCode,
    input.adjustmentId,
    input.correctionId,
    input.orderId && isCloseoutContextId(input.orderId) ? input.orderId : '',
    correction && correction.id,
    correction && correction.code,
    correction && correction.correctionCode,
    correction && correction.newCloseoutId,
    correction && correction.newCloseoutCode,
    correction && correction.originalCloseoutId,
    correction && correction.originalCloseoutCode
  ]);
  const or = [];
  for (const key of keys) {
    or.push(
      { id: key },
      { code: key },
      { closeoutCode: key },
      { correctionId: key },
      { correctionCode: key },
      { originalCloseoutId: key },
      { originalCloseoutCode: key },
      { correctionOfCloseoutId: key }
    );
    if (isMongoObjectId(key)) or.push({ _id: key });
  }
  if (or.length) return { $or: or };
  return null;
}

function activeOrderGuard() {
  return {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    deleteMode: { $nin: ['hard_deleted', 'deleted'] }
  };
}

function orderLookupFromResolver(input = {}, correction = null, version = null) {
  const rawOrderId = text(input.orderId || input.salesOrderId);
  const keys = uniqueText([
    input.canonicalOrderId,
    input.salesOrderId,
    !isCloseoutContextId(rawOrderId) ? rawOrderId : '',
    input.orderCode,
    input.salesOrderCode,
    correction && correction.salesOrderId,
    correction && correction.orderId,
    correction && correction.salesOrderCode,
    correction && correction.orderCode,
    version && version.salesOrderId,
    version && version.orderId,
    version && version.salesOrderCode,
    version && version.orderCode
  ]);
  if (!keys.length) return null;
  const or = [];
  for (const key of keys) {
    or.push(
      { id: key },
      { code: key },
      { orderCode: key },
      { salesOrderCode: key },
      { documentCode: key },
      { invoiceCode: key },
      { 'deliveryCloseout.id': key },
      { 'deliveryCloseout.code': key },
      { 'deliveryCloseout.closeoutId': key },
      { 'deliveryCloseout.closeoutCode': key }
    );
    if (isMongoObjectId(key)) or.push({ _id: key });
  }
  return { ...activeOrderGuard(), $or: or };
}

function adjustmentPublic(correction = {}, version = null) {
  const source = correction && Object.keys(correction).length ? correction : (version || {});
  return {
    id: text(source.id || source._id),
    code: text(source.code || source.correctionCode || source.closeoutCode),
    adjustmentId: text(source.id || source._id),
    adjustmentCode: text(source.correctionCode || source.code || source.id),
    correctionId: text(source.id || source._id),
    correctionCode: text(source.correctionCode || source.code || source.id),
    orderId: text(source.salesOrderId || source.orderId),
    orderCode: text(source.salesOrderCode || source.orderCode),
    closeoutVersionId: text(source.newCloseoutId || source.id || source.code || source.closeoutCode),
    closeoutVersionCode: text(source.newCloseoutCode || source.closeoutCode || source.code),
    originalCloseoutId: text(source.originalCloseoutId || source.correctionOfCloseoutId),
    originalCloseoutCode: text(source.originalCloseoutCode),
    deliveryDate: text(source.deliveryDate),
    deliveryStaffCode: text(source.deliveryStaffCode),
    deliveryStaffName: text(source.deliveryStaffName),
    salesStaffCode: text(source.salesStaffCode),
    salesStaffName: text(source.salesStaffName),
    customerCode: text(source.customerCode),
    customerName: text(source.customerName),
    previousReturnAmount: money(source.previousReturnAmount),
    previousCashAmount: money(source.previousCashAmount),
    previousBankAmount: money(source.previousBankAmount),
    previousRewardAmount: money(source.previousRewardAmount),
    previousDebtAmount: money(source.previousDebtAmount),
    newReturnAmount: money(source.newReturnAmount ?? source.returnAmount ?? source.returnedAmount),
    newCashAmount: money(source.newCashAmount ?? source.cashAmount),
    newBankAmount: money(source.newBankAmount ?? source.bankAmount),
    newRewardAmount: money(source.newRewardAmount ?? source.rewardAmount),
    newDebtAmount: money(source.newDebtAmount ?? source.finalDebtAmount ?? source.debtAmount),
    cashDeltaAmount: money(source.cashDeltaAmount),
    bankDeltaAmount: money(source.bankDeltaAmount),
    rewardDeltaAmount: money(source.rewardDeltaAmount),
    debtDeltaAmount: money(source.debtDeltaAmount ?? source.debtAdjustmentAmount),
    returnAdjustmentAmount: money(source.returnAdjustmentAmount),
    returnDelta: money(source.returnAdjustmentAmount),
    cashDelta: money(source.cashDeltaAmount),
    bankDelta: money(source.bankDeltaAmount),
    rewardDelta: money(source.rewardDeltaAmount),
    debtDelta: money(source.debtDeltaAmount ?? source.debtAdjustmentAmount),
    returnDeltaAmount: money(source.returnAdjustmentAmount),
    totalCollectedDelta: money(source.totalCollectedDelta ?? source.cashAdjustmentAmount),
    createdAt: text(source.createdAt),
    createdBy: text(source.createdBy),
    reason: text(source.reason || source.auditReason),
    note: text(source.note),
    status: text(source.status || 'confirmed'),
    sourceType: text(source.sourceType || (version ? 'DELIVERY_CLOSEOUT_VERSION' : 'DELIVERY_CLOSEOUT_CORRECTION'))
  };
}

function syntheticOrderFromAdjustment(adjustment = {}, version = null) {
  return {
    id: adjustment.orderId || adjustment.originalCloseoutId || adjustment.adjustmentId || adjustment.adjustmentCode,
    orderId: adjustment.orderId || adjustment.originalCloseoutId || adjustment.adjustmentId || adjustment.adjustmentCode,
    orderCode: adjustment.orderCode || adjustment.adjustmentCode,
    customerCode: adjustment.customerCode,
    customerName: adjustment.customerName,
    deliveryDate: adjustment.deliveryDate,
    salesStaffCode: adjustment.salesStaffCode,
    salesStaffName: adjustment.salesStaffName,
    deliveryStaffCode: adjustment.deliveryStaffCode,
    deliveryStaffName: adjustment.deliveryStaffName,
    status: adjustment.status || 'adjusted_readonly',
    closeoutStatus: adjustment.status || 'corrected_confirmed',
    accountingConfirmed: true,
    viewSelectable: false,
    closeoutEligible: false,
    adjustmentAllowed: false,
    closeoutLocked: true,
    canCloseout: false,
    canAdjust: false,
    correctionVersionApplied: true,
    correctionId: adjustment.correctionId,
    correctionCode: adjustment.correctionCode,
    closeoutVersionId: adjustment.closeoutVersionId || (version && text(version.id || version.code || version.closeoutCode)),
    originalAmount: money((version && (version.originalAmount ?? version.saleAmount)) ?? adjustment.originalAmount ?? 0),
    returnedAmount: money(adjustment.newReturnAmount),
    returnOrderCount: 0,
    returnOrderCodes: [],
    latestReturnDate: '',
    returnOrders: [],
    cashAmount: money(adjustment.newCashAmount),
    bankAmount: money(adjustment.newBankAmount),
    rewardAmount: money(adjustment.newRewardAmount),
    offsetAmount: 0,
    collectedAmount: money(adjustment.newCashAmount + adjustment.newBankAmount + adjustment.newRewardAmount),
    finalDebtAmount: money(adjustment.newDebtAmount),
    rawFinalDebtAmount: money(adjustment.newDebtAmount),
    closeoutFinalDebtAmount: money(adjustment.newDebtAmount),
    closeoutDelta: 0,
    returnAdjustmentAmount: money(adjustment.returnAdjustmentAmount),
    cashAdjustmentAmount: money(adjustment.totalCollectedDelta),
    cashDeltaAmount: money(adjustment.cashDeltaAmount),
    bankDeltaAmount: money(adjustment.bankDeltaAmount),
    rewardDeltaAmount: money(adjustment.rewardDeltaAmount),
    debtAdjustmentAmount: money(adjustment.debtDeltaAmount),
    returnOrderIds: [],
    paymentIds: [],
    version: Number((version && version.closeoutVersion) || 0),
    source: 'deliveryCloseoutCorrections read-only resolver',
    correctionRequired: true,
    correctionMessage: 'Đã tìm thấy bản ghi điều chỉnh nhưng không tìm thấy đơn gốc trong orders.'
  };
}

async function findOrderForCorrection(input = {}, options = {}) {
  const refs = uniqueText([
    input.orderId,
    input.salesOrderId,
    input.orderCode,
    input.salesOrderCode,
    input.canonicalOrderId,
    input.originalCloseoutId,
    input.closeoutId,
    input.id,
    input.code
  ]);
  if (!refs.length) {
    const err = new Error('Thiếu mã closeout/đơn bán để tạo điều chỉnh.');
    err.code = 'DELIVERY_CLOSEOUT_CORRECTION_MISSING_REF';
    err.status = 400;
    throw err;
  }

  for (const ref of refs) {
    const filter = buildOrderLookup(ref);
    if (!filter) continue;
    let query = SalesOrder.findOne(filter).lean();
    if (options.session) query = query.session(options.session);
    const order = await query;
    if (order) return order;
  }

  const err = new Error('Không tìm thấy đơn/closeout gốc để tạo điều chỉnh.');
  err.code = 'DELIVERY_CLOSEOUT_CORRECTION_ORDER_NOT_FOUND';
  err.status = 404;
  throw err;
}


function orderItemProductKey(item = {}) {
  const code = text(item.productCode || item.code || item.sku || item.itemCode || item.productId);
  if (code) return `code:${code}`;
  return `name:${text(item.productName || item.name || item.description || item.itemName).toLowerCase()}|price:${money(item.unitPrice ?? item.salePrice ?? item.price ?? item.finalPrice ?? item.priceAfterPromotion ?? item.actualPrice)}`;
}

function returnItemProductKey(item = {}) {
  const code = text(item.productCode || item.code || item.sku || item.itemCode || item.productId);
  if (code) return `code:${code}`;
  return `name:${text(item.productName || item.name || item.description || item.itemName).toLowerCase()}|price:${money(item.unitPrice ?? item.salePrice ?? item.price ?? item.finalPrice ?? item.priceAfterPromotion ?? item.actualPrice)}`;
}

function orderDeliveredQty(item = {}) {
  return quantity(
    item.deliveredQty
      ?? item.deliveryQty
      ?? item.shipQty
      ?? item.soldQty
      ?? item.quantitySold
      ?? item.orderQty
      ?? item.saleQty
      ?? item.totalQty
      ?? item.quantity
      ?? item.qty
      ?? item.looseQty
      ?? item.units
  );
}

function orderUnitPrice(item = {}) {
  return money(item.unitPrice ?? item.salePrice ?? item.price ?? item.finalPrice ?? item.priceAfterPromotion ?? item.actualPrice);
}

function orderSourceItems(order = {}) {
  return []
    .concat(Array.isArray(order.items) ? order.items : [])
    .concat(Array.isArray(order.orderItems) ? order.orderItems : [])
    .concat(Array.isArray(order.soldItems) ? order.soldItems : [])
    .concat(Array.isArray(order.products) ? order.products : [])
    .concat(Array.isArray(order.lines) ? order.lines : []);
}

function compactDeliveredItemsFromOrder(order = {}) {
  const map = new Map();
  for (const raw of orderSourceItems(order)) {
    const productCode = text(raw.productCode || raw.code || raw.sku || raw.itemCode || raw.productId);
    const productName = text(raw.productName || raw.name || raw.description || raw.itemName);
    const unitPrice = orderUnitPrice(raw);
    const deliveredQty = orderDeliveredQty(raw);
    const key = orderItemProductKey({ ...raw, productCode, productName, unitPrice });
    if (!productCode && !productName && !deliveredQty) continue;
    if (!map.has(key)) {
      map.set(key, {
        productKey: key,
        productCode,
        productName,
        unit: text(raw.unit || raw.baseUnit || raw.uom || raw.unitName),
        deliveredQty: 0,
        unitPrice,
        deliveredAmount: 0,
        source: { deliveredQtySource: 'orders.items' }
      });
    }
    const row = map.get(key);
    row.deliveredQty = quantity(row.deliveredQty + deliveredQty);
    row.deliveredAmount = money(row.deliveredAmount + (money(raw.amount ?? raw.lineTotal ?? raw.totalAmount ?? raw.finalAmount) || deliveredQty * unitPrice));
  }
  return Array.from(map.values());
}

function returnOrderLookupRefs(order = {}) {
  return uniqueText([
    order.id, order._id, order.code, order.orderCode, order.salesOrderCode, order.documentCode, order.invoiceCode,
    order.salesOrderId, order.sourceOrderId, order.sourceOrderCode
  ]);
}

function buildReturnOrderLookupForOrder(order = {}) {
  const refs = returnOrderLookupRefs(order);
  if (!refs.length) return null;
  return {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    $or: [
      { salesOrderId: { $in: refs } },
      { orderId: { $in: refs } },
      { sourceOrderId: { $in: refs } },
      { originalOrderId: { $in: refs } },
      { deliveryOrderId: { $in: refs } },
      { salesOrderCode: { $in: refs } },
      { orderCode: { $in: refs } },
      { sourceOrderCode: { $in: refs } },
      { originalOrderCode: { $in: refs } },
      { deliveryOrderCode: { $in: refs } },
      { code: { $in: refs.map((ref) => `RO-${String(ref).replace(/^RO[-_]?/i, '')}`) } }
    ]
  };
}

function returnOrderActive(row = {}) {
  const status = text(row.status || row.returnStatus || row.returnState).toLowerCase();
  return !['cancelled', 'canceled', 'void', 'voided', 'deleted', 'removed', 'rejected', 'duplicate_cancelled'].includes(status)
    && row.deleted !== true
    && row.isDeleted !== true;
}

function returnOrderLockedForDirectEdit(row = {}) {
  const accountingStatus = text(row.accountingStatus || row.status || row.returnStatus || row.returnState).toLowerCase();
  const stockInStatus = text(row.stockInStatus || row.warehouseReceiveStatus || row.stockReceiveStatus).toLowerCase();
  return row.inventoryPosted === true
    || row.stockPosted === true
    || stockInStatus === 'posted'
    || row.accountingConfirmed === true
    || ['accounting_confirmed', 'confirmed', 'posted'].includes(accountingStatus);
}

function returnItemQty(item = {}) {
  return quantity(item.returnQty ?? item.returnedQty ?? item.actualReturnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.quantity ?? item.qty ?? item.totalQty ?? item.units ?? item.looseQty);
}

function returnItemUnitPrice(item = {}) {
  return money(item.unitPrice ?? item.salePrice ?? item.price ?? item.finalPrice ?? item.actualPrice ?? item.priceAfterPromotion);
}

async function loadReturnOrdersForOrder(order = {}, options = {}) {
  const filter = buildReturnOrderLookupForOrder(order);
  if (!filter) return [];
  let query = ReturnOrder.find(filter).sort({ updatedAt: -1, createdAt: -1 }).lean();
  if (options.session) query = query.session(options.session);
  return query;
}

function currentReturnMapFromOrders(returnOrders = []) {
  const map = new Map();
  for (const ro of returnOrders || []) {
    if (!returnOrderActive(ro)) continue;
    for (const item of Array.isArray(ro.items) ? ro.items : []) {
      const unitPrice = returnItemUnitPrice(item);
      const normalized = {
        productCode: text(item.productCode || item.code || item.sku || item.itemCode || item.productId),
        productName: text(item.productName || item.name || item.description || item.itemName),
        unitPrice
      };
      const key = returnItemProductKey(normalized);
      if (!map.has(key)) {
        map.set(key, { productKey: key, ...normalized, currentReturnQty: 0, currentReturnAmount: 0, source: { currentReturnQtySource: 'returnOrders.items' } });
      }
      const row = map.get(key);
      const qty = returnItemQty(item);
      row.currentReturnQty = quantity(row.currentReturnQty + qty);
      row.currentReturnAmount = money(row.currentReturnAmount + money(item.returnAmount ?? item.amount ?? item.lineTotal ?? item.totalAmount ?? (qty * unitPrice)));
    }
  }
  return map;
}

async function buildDeliveryAdjustmentReturnRows(input = {}, options = {}) {
  const order = options.order || await findOrderForCorrection(input, options);
  const returnOrders = await loadReturnOrdersForOrder(order, options);
  const deliveredRows = compactDeliveredItemsFromOrder(order);
  const returnMap = currentReturnMapFromOrders(returnOrders);
  const rows = deliveredRows.map((item) => {
    const ret = returnMap.get(item.productKey) || { currentReturnQty: 0, currentReturnAmount: 0 };
    const currentReturnQty = quantity(ret.currentReturnQty);
    const unitPrice = money(item.unitPrice || ret.unitPrice || 0);
    return {
      productKey: item.productKey,
      productCode: item.productCode,
      productName: item.productName,
      unit: item.unit,
      deliveredQty: quantity(item.deliveredQty),
      unitPrice,
      deliveredAmount: money(item.deliveredAmount || item.deliveredQty * unitPrice),
      currentReturnQty,
      oldReturnQty: currentReturnQty,
      desiredReturnQty: currentReturnQty,
      newReturnQty: currentReturnQty,
      deltaReturnQty: 0,
      returnAmount: money(currentReturnQty * unitPrice),
      deltaReturnAmount: 0,
      source: { deliveredQtySource: 'orders.items', currentReturnQtySource: 'returnOrders.items' }
    };
  });

  for (const [key, ret] of returnMap.entries()) {
    if (rows.some((row) => row.productKey === key)) continue;
    const currentReturnQty = quantity(ret.currentReturnQty);
    rows.push({
      productKey: key,
      productCode: ret.productCode,
      productName: ret.productName,
      unit: '',
      deliveredQty: currentReturnQty,
      unitPrice: money(ret.unitPrice),
      deliveredAmount: money(currentReturnQty * money(ret.unitPrice)),
      currentReturnQty,
      oldReturnQty: currentReturnQty,
      desiredReturnQty: currentReturnQty,
      newReturnQty: currentReturnQty,
      deltaReturnQty: 0,
      returnAmount: money(ret.currentReturnAmount || currentReturnQty * money(ret.unitPrice)),
      deltaReturnAmount: 0,
      source: { deliveredQtySource: 'returnOrders_unmatched_fallback', currentReturnQtySource: 'returnOrders.items' },
      warning: 'Mã hàng trả chưa khớp với orders.items; giữ dòng để tránh mất dữ liệu hiện hữu.'
    });
  }

  return {
    orderId: orderId(order),
    orderCode: orderCode(order),
    returnRows: rows,
    rows,
    returnOrders: returnOrders.filter(returnOrderActive),
    source: 'orders.items + returnOrders.items',
    diagnostics: {
      deliveredQtySource: 'orders.items',
      currentReturnQtySource: 'returnOrders.items',
      returnOrderCount: returnOrders.filter(returnOrderActive).length
    }
  };
}

function returnLineDocumentFromRow(row = {}, desiredReturnQty = 0) {
  const unitPrice = money(row.unitPrice ?? row.salePrice ?? row.price ?? row.finalPrice ?? 0);
  const returnQty = quantity(desiredReturnQty);
  const amount = money(returnQty * unitPrice);
  return {
    productCode: text(row.productCode || row.code || row.sku || row.itemCode || row.productId),
    productName: text(row.productName || row.name || row.description || row.itemName),
    unit: text(row.unit || row.baseUnit || row.uom || row.unitName),
    deliveredQty: quantity(row.deliveredQty),
    soldQty: quantity(row.deliveredQty),
    returnQty,
    qtyReturn: returnQty,
    returnQuantity: returnQty,
    returnedQty: returnQty,
    quantity: returnQty,
    qty: returnQty,
    unitPrice,
    salePrice: unitPrice,
    price: unitPrice,
    returnAmount: amount,
    amount,
    totalAmount: amount
  };
}

function returnAdjustmentItemKey(item = {}) {
  return returnItemProductKey({
    productCode: item.productCode,
    productName: item.productName,
    unitPrice: item.unitPrice
  });
}

function canonicalReturnCodeForOrder(order = {}) {
  const clean = String(orderCode(order) || orderId(order) || '').replace(/^RO[-_]?/i, '').trim();
  return clean ? `RO-${clean}` : makeId('RO');
}

async function applyReturnOrderAdjustment({ order = {}, items = [], actor = 'system', reason = '', note = '' } = {}, options = {}) {
  const normalizedInput = normalizeReturnAdjustmentItems(items);
  if (!normalizedInput.length) return { skipped: true, returnUpdated: false, reason: 'no_return_adjustment_items', updatedLines: 0, warnings: [] };

  const detail = await buildDeliveryAdjustmentReturnRows({ orderId: orderId(order), orderCode: orderCode(order) }, { ...options, order });
  const canonicalByKey = new Map(detail.returnRows.map((row) => [row.productKey || returnAdjustmentItemKey(row), row]));
  const desiredByKey = new Map(detail.returnRows.map((row) => [row.productKey || returnAdjustmentItemKey(row), quantity(row.currentReturnQty)]));
  const warnings = [];

  for (const item of normalizedInput) {
    const key = returnAdjustmentItemKey(item);
    let canonical = canonicalByKey.get(key);
    if (!canonical && item.productCode) {
      canonical = detail.returnRows.find((row) => text(row.productCode) === text(item.productCode));
    }
    if (!canonical && text(item.productName)) {
      canonical = detail.returnRows.find((row) => text(row.productName).toLowerCase() === text(item.productName).toLowerCase());
    }
    const deliveredQty = quantity((canonical && canonical.deliveredQty) || item.deliveredQty || 0);
    const desiredQty = quantity(item.newReturnQty ?? item.desiredReturnQty ?? item.returnQty ?? 0);
    if (desiredQty < 0) {
      const err = new Error('SL trả đúng không được âm.');
      err.code = 'RETURN_ADJUSTMENT_NEGATIVE_QTY';
      err.status = 400;
      throw err;
    }
    if (desiredQty > deliveredQty) {
      const err = new Error('SL trả đúng không được lớn hơn SL giao.');
      err.code = 'RETURN_ADJUSTMENT_QTY_EXCEEDS_DELIVERED';
      err.status = 400;
      err.data = { productCode: item.productCode, productName: item.productName, deliveredQty, desiredQty };
      throw err;
    }
    if (!canonical) {
      const err = new Error('Không tìm thấy sản phẩm trong đơn gốc để điều chỉnh hàng trả.');
      err.code = 'RETURN_ADJUSTMENT_PRODUCT_NOT_IN_ORDER';
      err.status = 400;
      err.data = { productCode: item.productCode, productName: item.productName };
      throw err;
    }
    desiredByKey.set(canonical.productKey || key, desiredQty);
  }

  const activeReturnOrders = (detail.returnOrders || []).filter(returnOrderActive);
  const locked = activeReturnOrders.find(returnOrderLockedForDirectEdit);
  const changed = detail.returnRows.some((row) => quantity(desiredByKey.get(row.productKey)) !== quantity(row.currentReturnQty));
  if (!changed) return { skipped: true, returnUpdated: false, reason: 'no_return_quantity_delta', updatedLines: 0, warnings };
  if (locked) {
    const err = new Error('Phiếu trả hàng đã nhập kho/xác nhận kế toán, không thể sửa trực tiếp trong điều chỉnh đơn giao.');
    err.code = 'RETURN_ORDER_ALREADY_POSTED_OR_CONFIRMED';
    err.status = 409;
    err.data = { returnOrderId: text(locked.id), returnOrderCode: text(locked.code), stockPosted: locked.stockPosted === true, stockInStatus: text(locked.stockInStatus), accountingStatus: text(locked.accountingStatus) };
    throw err;
  }

  const primary = activeReturnOrders[0] || null;
  const selected = primary || {};
  const now = options.now || dateUtil.nowIso();
  const desiredLines = detail.returnRows
    .map((row) => returnLineDocumentFromRow(row, desiredByKey.get(row.productKey) || 0))
    .filter((line) => quantity(line.returnQty) > 0);
  const totalQuantity = desiredLines.reduce((sum, line) => quantity(sum + quantity(line.returnQty)), 0);
  const totalAmount = desiredLines.reduce((sum, line) => money(sum + money(line.returnAmount ?? line.amount)), 0);

  if (!primary && totalQuantity <= 0) return { skipped: true, returnUpdated: false, reason: 'no_return_order_needed', updatedLines: 0, warnings };

  const returnCode = text(selected.code || selected.id || canonicalReturnCodeForOrder(order));
  const lifecycleStatus = totalQuantity > 0 ? 'waiting_receive' : 'cancelled';
  const payload = {
    ...selected,
    id: text(selected.id || returnCode),
    code: returnCode,
    date: dateUtil.toDateOnly(selected.date || order.deliveryDate || order.orderDate || order.date || now),
    documentDate: dateUtil.toDateOnly(selected.documentDate || order.deliveryDate || order.orderDate || order.date || now),
    deliveryDate: dateUtil.toDateOnly(selected.deliveryDate || order.deliveryDate || order.orderDate || order.date || now),
    returnDate: dateUtil.toDateOnly(selected.returnDate || order.deliveryDate || order.orderDate || order.date || now),
    salesOrderId: text(order.id || order._id || selected.salesOrderId || selected.orderId),
    salesOrderCode: orderCode(order) || text(selected.salesOrderCode || selected.orderCode),
    orderId: text(order.id || order._id || selected.orderId || selected.salesOrderId),
    orderCode: orderCode(order) || text(selected.orderCode || selected.salesOrderCode),
    sourceOrderId: text(order.id || order._id || selected.sourceOrderId),
    sourceOrderCode: orderCode(order) || text(selected.sourceOrderCode),
    customerId: text(order.customerId || selected.customerId),
    customerCode: text(order.customerCode || selected.customerCode),
    customerName: text(order.customerName || selected.customerName),
    salesStaffId: text(order.salesStaffId || selected.salesStaffId),
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode || order.nvbhCode || selected.salesStaffCode || selected.salesmanCode || selected.nvbhCode),
    salesStaffName: text(order.salesStaffName || order.salesmanName || order.nvbhName || selected.salesStaffName || selected.salesmanName || selected.nvbhName),
    salesmanCode: text(order.salesStaffCode || order.salesmanCode || order.nvbhCode || selected.salesmanCode || selected.salesStaffCode),
    salesmanName: text(order.salesStaffName || order.salesmanName || order.nvbhName || selected.salesmanName || selected.salesStaffName),
    deliveryStaffId: text(order.deliveryStaffId || selected.deliveryStaffId),
    deliveryStaffCode: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode || selected.deliveryStaffCode || selected.deliveryCode || selected.nvghCode),
    deliveryStaffName: text(order.deliveryStaffName || order.deliveryName || order.nvghName || selected.deliveryStaffName || selected.deliveryName || selected.nvghName),
    staffCode: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode || selected.staffCode),
    staffName: text(order.deliveryStaffName || order.deliveryName || order.nvghName || selected.staffName),
    masterOrderId: text(order.masterOrderId || selected.masterOrderId),
    masterOrderCode: text(order.masterOrderCode || selected.masterOrderCode),
    items: desiredLines,
    totalQuantity,
    totalQty: totalQuantity,
    totalAmount,
    amount: totalAmount,
    returnAmount: totalAmount,
    debtReduction: totalAmount,
    totalReturnAmount: totalAmount,
    status: lifecycleStatus,
    returnStatus: lifecycleStatus,
    returnState: lifecycleStatus,
    returnMergeStatus: text(selected.returnMergeStatus || 'unmerged'),
    warehouseReceiveStatus: lifecycleStatus,
    warehouseCheckStatus: totalQuantity > 0 ? text(selected.warehouseCheckStatus || 'pending') : 'cancelled',
    stockInStatus: totalQuantity > 0 ? text(selected.stockInStatus || 'pending') : 'cancelled',
    stockPosted: false,
    stockTransactionIds: Array.isArray(selected.stockTransactionIds) ? selected.stockTransactionIds : [],
    source: text(selected.source || 'delivery_adjustment_return_correction'),
    accountingStatus: totalQuantity > 0 ? text(selected.accountingStatus || 'pending') : 'cancelled',
    accountingConfirmed: false,
    note: [text(selected.note), text(note || reason)].filter(Boolean).join(' | '),
    adjustedBy: actor,
    adjustedAt: now,
    updatedBy: actor,
    updatedAt: now,
    createdAt: selected.createdAt || now
  };

  await returnOrderRepository.upsert(payload, { session: options.session });

  const clearedDuplicateReturnOrderIds = [];
  for (const duplicate of activeReturnOrders.slice(1)) {
    const cleared = {
      ...duplicate,
      items: [],
      totalQuantity: 0,
      totalQty: 0,
      totalAmount: 0,
      amount: 0,
      returnAmount: 0,
      debtReduction: 0,
      totalReturnAmount: 0,
      status: 'cancelled',
      returnStatus: 'cancelled',
      returnState: 'cancelled',
      warehouseReceiveStatus: 'cancelled',
      warehouseCheckStatus: 'cancelled',
      stockInStatus: 'cancelled',
      accountingStatus: 'cancelled',
      note: [text(duplicate.note), `Auto-cancel duplicate by delivery adjustment ${orderCode(order) || orderId(order)}`].filter(Boolean).join(' | '),
      updatedAt: now,
      updatedBy: actor
    };
    await returnOrderRepository.upsert(cleared, { session: options.session });
    clearedDuplicateReturnOrderIds.push(text(duplicate.id || duplicate.code));
  }
  if (clearedDuplicateReturnOrderIds.length) warnings.push(`Đã hủy ${clearedDuplicateReturnOrderIds.length} phiếu trả trùng chưa post để tránh cộng lặp số lượng trả.`);

  return {
    returnUpdated: true,
    returnOrderId: payload.id,
    returnOrderCode: payload.code,
    returnUpdatedLines: desiredLines.length,
    updatedLines: desiredLines.length,
    totalQuantity,
    totalAmount,
    warnings,
    clearedDuplicateReturnOrderIds
  };
}

async function latestVersionForOriginal(originalCloseoutId = '', options = {}) {
  if (!originalCloseoutId) return null;
  let query = DeliveryCloseoutVersion.findOne({ originalCloseoutId }).sort({ closeoutVersion: -1, createdAt: -1 }).lean();
  if (options.session) query = query.session(options.session);
  return query;
}

function buildVersionSnapshot(order = {}, baseSnapshot = {}, correction = {}, now = dateUtil.nowIso()) {
  const original = originalCloseoutIdentity(order);
  const previousState = previousPaymentState(baseSnapshot, order);
  const previousReturn = previousState.returnAmount;
  const previousDebt = previousState.debtAmount;
  const sale = previousState.receivableAmount;
  const newReturn = money(correction.returnAmount ?? correction.newReturnAmount ?? (previousReturn + correction.returnAdjustmentAmount));
  const newCash = money(correction.cashAmount ?? correction.newCashAmount ?? previousState.cashAmount);
  const newBank = money(correction.bankAmount ?? correction.newBankAmount ?? previousState.bankAmount);
  const newReward = money(correction.rewardAmount ?? correction.newRewardAmount ?? previousState.rewardAmount);
  const debtCalculation = calculateDeliveryDebtAmount({
    receivableAmount: sale,
    cashAmount: newCash,
    bankAmount: newBank,
    rewardAmount: newReward,
    returnAmount: newReturn
  });
  const newDebt = money(correction.debtAmount ?? correction.newDebtAmount ?? debtCalculation.debtAmount);
  const version = Number(correction.newCloseoutVersion || original.version + 1);
  const cashDeltaAmount = money(newCash - previousState.cashAmount);
  const bankDeltaAmount = money(newBank - previousState.bankAmount);
  const rewardDeltaAmount = money(newReward - previousState.rewardAmount);
  const totalCollectedDelta = money(cashDeltaAmount + bankDeltaAmount + rewardDeltaAmount);
  const debtDeltaAmount = money(newDebt - previousDebt);
  return {
    id: text(correction.newCloseoutId || `DCOV-${orderId(order) || orderCode(order)}-v${version}-${shortHash(correction.idempotencyKey)}`),
    code: text(correction.newCloseoutCode || `DCOV-${orderCode(order) || orderId(order)}-v${version}`),
    closeoutCode: text(correction.newCloseoutCode || `DCOV-${orderCode(order) || orderId(order)}-v${version}`),
    tenantId: text(order.tenantId),
    closeoutVersion: version,
    originalCloseoutVersion: original.version,
    originalCloseoutId: original.id,
    originalCloseoutCode: original.code,
    correctionOfCloseoutId: original.id,
    correctionId: correction.id,
    correctionCode: correction.correctionCode,
    deliveryDate: text(order.deliveryDate || order.orderDate || order.date || order.documentDate),
    deliveryStaffCode: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
    deliveryStaffName: text(order.deliveryStaffName || order.deliveryName || order.nvghName),
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode || order.nvbhCode),
    salesStaffName: text(order.salesStaffName || order.salesmanName || order.nvbhName),
    salesOrderId: orderId(order),
    salesOrderCode: orderCode(order),
    orderId: orderId(order),
    orderCode: orderCode(order),
    customerId: text(order.customerId),
    customerCode: text(order.customerCode),
    customerName: text(order.customerName),
    saleAmount: sale,
    originalAmount: sale,
    returnAmount: newReturn,
    returnedAmount: newReturn,
    cashAmount: newCash,
    bankAmount: newBank,
    rewardAmount: newReward,
    cashCollectedAmount: newCash,
    collectedAmount: money(newCash + newBank + newReward),
    debtAmount: newDebt,
    finalDebtAmount: newDebt,
    rawDebtAmount: debtCalculation.rawDebtAmount,
    rawFinalDebtAmount: debtCalculation.rawDebtAmount,
    previousReturnAmount: previousReturn,
    previousCashAmount: previousState.cashAmount,
    previousBankAmount: previousState.bankAmount,
    previousRewardAmount: previousState.rewardAmount,
    previousCashCollectedAmount: previousState.cashAmount,
    previousCollectedAmount: previousState.collectedAmount,
    previousDebtAmount: previousDebt,
    returnAdjustmentAmount: money(newReturn - previousReturn),
    cashDeltaAmount,
    bankDeltaAmount,
    rewardDeltaAmount,
    totalCollectedDelta,
    // Backward-compatible aggregate: total payment delta, not the cash final state.
    cashAdjustmentAmount: totalCollectedDelta,
    debtDeltaAmount,
    debtAdjustmentAmount: debtDeltaAmount,
    status: 'corrected_confirmed',
    immutable: true,
    isLatest: true,
    sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
    idempotencyKey: correction.idempotencyKey,
    reason: text(correction.reason),
    auditReason: text(correction.auditReason || correction.reason || 'Điều chỉnh không ghi lý do'),
    note: text(correction.note),
    createdBy: text(correction.createdBy),
    createdAt: now,
    updatedAt: now,
    auditTrail: [{ at: now, by: text(correction.createdBy), action: 'CREATE_CLOSEOUT_VERSION_FROM_FINAL_STATE_CORRECTION', originalCloseoutId: original.id }],
    metadata: { source: 'Phase109', immutableContract: true, correctionSemantics: 'final_state_value' }
  };
}

function correctionAllocationIdempotencyKey(order = {}, version = {}) {
  const source = orderId(order) || orderCode(order) || text(version.orderId || version.orderCode);
  const correction = text(version.correctionId || version.id || version.code || version.idempotencyKey || 'correction');
  const versionNo = Number(version.closeoutVersion || version.sourceVersion || version.version || 1) || 1;
  return `OPA:${source}:delivery_closeout_correction:${correction}:v${versionNo}`;
}

async function upsertCorrectionPaymentAllocation(order = {}, version = {}, options = {}) {
  if (!version || typeof version !== 'object') return null;
  const versionNo = Number(version.closeoutVersion || version.sourceVersion || version.version || 1) || 1;
  const token = text(orderCode(order) || orderId(order) || version.orderCode || version.orderId || 'UNKNOWN').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'UNKNOWN';
  const allocation = OrderPaymentAllocationService.buildAllocationFromCloseout(order, version, {
    ...options,
    sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
    sourceId: orderId(order) || text(version.orderId || version.salesOrderId),
    sourceCode: orderCode(order) || text(version.orderCode || version.salesOrderCode),
    sourceVersion: versionNo,
    allocationCode: text(`OPA-${token}-CORRECTION-v${versionNo}`),
    idempotencyKey: correctionAllocationIdempotencyKey(order, version),
    status: 'posted',
    closeoutScope: 'delivery_closeout_correction',
    closeoutScopeHash: text(version.correctionId || version.id || version.code || version.idempotencyKey),
    metadata: {
      source: 'deliveryCloseoutVersions',
      correctionId: text(version.correctionId),
      correctionCode: text(version.correctionCode),
      closeoutVersionId: text(version.id || version.code),
      closeoutVersion: versionNo,
      integration: 'manual_adjustment_payment_correction',
      postingPolicy: 'mirror_final_state_only; AR delta handled by AR-DEBT-ADJUSTMENT reconcile'
    }
  });
  allocation.postedBy = actorName(options.actor || version.createdBy || 'accountant');
  allocation.postedAt = options.now || dateUtil.nowIso();
  allocation.updatedBy = allocation.postedBy;
  allocation.updatedAt = allocation.postedAt;
  const saved = await OrderPaymentAllocationService.upsertAllocation(allocation, options);
  return saved || allocation;
}
async function loadIdempotentResult(correction = {}, options = {}) {
  if (!correction) return null;
  let versionQuery = DeliveryCloseoutVersion.findOne({ correctionId: correction.id }).lean();
  if (options.session) versionQuery = versionQuery.session(options.session);
  const newCloseoutVersion = await versionQuery;
  const arDebtAdjustmentLedger = correction.arDebtAdjustmentLedgerCode
    ? {
      id: text(correction.arDebtAdjustmentLedgerId),
      code: text(correction.arDebtAdjustmentLedgerCode),
      category: 'AR-DEBT-ADJUSTMENT',
      ledgerType: 'AR-DEBT-ADJUSTMENT',
      sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
      sourceId: text(correction.id),
      sourceCode: text(correction.correctionCode || correction.code),
      idempotencyKey: `AR-DEBT-ADJUSTMENT:${correction.id}`
    }
    : null;
  return { idempotent: true, correction, newCloseoutVersion, arDebtAdjustmentLedger };
}


async function createOpenOrderAdjustment(input = {}, order = {}, options = {}) {
  const session = options.session;
  const now = options.now || dateUtil.nowIso();
  const actor = actorName(input.actor || options.actor || input.createdBy || input.correctedBy || 'accountant');
  const currentState = openOrderPaymentState(order);
  const rawReturnAdjustmentItems = returnAdjustmentInputItems(input);
  const returnAdjustmentItems = normalizeReturnAdjustmentItems(rawReturnAdjustmentItems);
  const rawCashLines = input.correctedCashLines || input.cashAdjustmentLines || [];
  const explicitReturnAdjustment = input.returnAdjustmentAmount !== undefined ? money(input.returnAdjustmentAmount) : null;
  const returnAdjustmentAmount = money(explicitReturnAdjustment === null ? sumAdjustments(returnAdjustmentItems) : explicitReturnAdjustment);
  const newReturnAmount = money(currentState.returnAmount + returnAdjustmentAmount);
  const nextPaymentState = finalPaymentStateFromInput(input, rawCashLines, currentState);
  const cashAdjustmentLines = buildFinalPaymentLines(currentState, nextPaymentState);
  const cashDeltaAmount = money(nextPaymentState.cashAmount - currentState.cashAmount);
  const bankDeltaAmount = money(nextPaymentState.bankAmount - currentState.bankAmount);
  const rewardDeltaAmount = money(nextPaymentState.rewardAmount - currentState.rewardAmount);
  const cashAdjustmentAmount = money(cashDeltaAmount + bankDeltaAmount + rewardDeltaAmount);
  const debtCalculation = calculateDeliveryDebtAmount({
    receivableAmount: currentState.receivableAmount,
    cashAmount: nextPaymentState.cashAmount,
    bankAmount: nextPaymentState.bankAmount,
    rewardAmount: nextPaymentState.rewardAmount,
    returnAmount: newReturnAmount
  });
  const newDebtAmount = money(debtCalculation.debtAmount);
  const debtAdjustmentAmount = money(newDebtAmount - currentState.debtAmount);
  const calculated = {
    returnAdjustmentItems,
    cashAdjustmentLines,
    returnAdjustmentAmount,
    cashAdjustmentAmount,
    debtAdjustmentAmount,
    currentState,
    finalState: { ...nextPaymentState, returnAmount: newReturnAmount, debtAmount: newDebtAmount }
  };
  validateCorrectionInput(input, calculated);

  const original = originalCloseoutIdentity(order);
  const baseId = orderId(order) || orderCode(order) || original.id;
  const correctionId = text(input.id || `DCOA-${baseId}-${Date.now()}-${shortHash(stableJson(input))}`);
  const correctionCode = text(input.correctionCode || input.code || correctionId);
  const collectedWithoutReward = money(nextPaymentState.cashAmount + nextPaymentState.bankAmount);
  const closeout = closeoutOf(order);
  const nextCloseout = {
    ...closeout,
    id: text(closeout.id || closeout.closeoutId || original.id),
    code: text(closeout.code || closeout.closeoutCode || original.code),
    status: text(closeout.status || 'draft'),
    originalAmount: currentState.receivableAmount,
    saleAmount: currentState.receivableAmount,
    returnedAmount: newReturnAmount,
    returnAmount: newReturnAmount,
    cashAmount: nextPaymentState.cashAmount,
    bankAmount: nextPaymentState.bankAmount,
    rewardAmount: nextPaymentState.rewardAmount,
    collectedAmount: collectedWithoutReward,
    totalCollectedAmount: collectedWithoutReward,
    rawFinalDebtAmount: debtCalculation.rawDebtAmount,
    finalDebtAmount: newDebtAmount,
    debtAmount: newDebtAmount,
    adjustedBeforeCloseout: true,
    adjustedBeforeCloseoutAt: now,
    adjustedBeforeCloseoutBy: actor,
    updatedAt: now,
    updatedBy: actor
  };

  const correction = {
    id: correctionId,
    code: correctionCode,
    correctionCode,
    tenantId: text(order.tenantId),
    originalCloseoutId: original.id,
    originalCloseoutCode: original.code,
    originalCloseoutVersion: original.version,
    newCloseoutVersion: original.version,
    deliveryDate: text(order.deliveryDate || order.orderDate || order.date || order.documentDate),
    deliveryStaffCode: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
    deliveryStaffName: text(order.deliveryStaffName || order.deliveryName || order.nvghName),
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode || order.nvbhCode),
    salesStaffName: text(order.salesStaffName || order.salesmanName || order.nvbhName),
    customerId: text(order.customerId),
    customerCode: text(order.customerCode),
    customerName: text(order.customerName),
    salesOrderId: orderId(order),
    salesOrderCode: orderCode(order),
    orderId: orderId(order),
    orderCode: orderCode(order),
    previousReturnAmount: currentState.returnAmount,
    previousCashAmount: currentState.cashAmount,
    previousBankAmount: currentState.bankAmount,
    previousRewardAmount: currentState.rewardAmount,
    previousCashCollectedAmount: currentState.cashAmount,
    previousCollectedAmount: currentState.collectedAmount,
    previousDebtAmount: currentState.debtAmount,
    newReturnAmount,
    newCashAmount: nextPaymentState.cashAmount,
    newBankAmount: nextPaymentState.bankAmount,
    newRewardAmount: nextPaymentState.rewardAmount,
    newCashCollectedAmount: nextPaymentState.cashAmount,
    newCollectedAmount: nextPaymentState.collectedAmount,
    newDebtAmount,
    cashAmount: nextPaymentState.cashAmount,
    bankAmount: nextPaymentState.bankAmount,
    rewardAmount: nextPaymentState.rewardAmount,
    returnAmount: newReturnAmount,
    debtAmount: newDebtAmount,
    finalDebtAmount: newDebtAmount,
    rawDebtAmount: debtCalculation.rawDebtAmount,
    returnAdjustmentAmount,
    cashDeltaAmount,
    bankDeltaAmount,
    rewardDeltaAmount,
    totalCollectedDelta: cashAdjustmentAmount,
    cashAdjustmentAmount,
    debtDeltaAmount: debtAdjustmentAmount,
    debtAdjustmentAmount,
    returnAdjustmentItems,
    cashAdjustmentLines,
    reason: correctionReason(input),
    auditReason: correctionAuditReason(input),
    note: text(input.note || ''),
    status: 'open_order_adjusted',
    sourceType: 'DELIVERY_OPEN_ADJUSTMENT',
    idempotencyKey: text(input.idempotencyKey || `DELIVERY_OPEN_ADJUSTMENT:${correctionId}`),
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
    auditTrail: [{ at: now, by: actor, action: 'UPDATE_DELIVERY_ORDER_BEFORE_CLOSEOUT', originalCloseoutId: original.id }],
    metadata: { phase: 'Phase173', preCloseoutAdjustment: true, correctionSemantics: 'final_state_value', doesNotPostLedger: true }
  };

  const returnOrderAdjustment = await applyReturnOrderAdjustment({
    order,
    items: rawReturnAdjustmentItems,
    actor,
    reason: correction.reason || correction.auditReason,
    note: correction.note
  }, { ...options, session, now });

  await DeliveryCloseoutCorrection.findOneAndUpdate(
    { id: correctionId },
    { $setOnInsert: correction },
    { upsert: true, new: true, setDefaultsOnInsert: true, session }
  );

  await SalesOrder.updateOne(
    buildOrderLookup(orderId(order) || orderCode(order)),
    {
      $set: {
        cashAmount: nextPaymentState.cashAmount,
        bankAmount: nextPaymentState.bankAmount,
        rewardAmount: nextPaymentState.rewardAmount,
        paidAmount: collectedWithoutReward,
        collectedAmount: collectedWithoutReward,
        debtAmount: newDebtAmount,
        deliveryCloseout: nextCloseout,
        updatedAt: now
      }
    },
    { session }
  );

  return {
    success: true,
    preCloseoutAdjustment: true,
    correction,
    newCloseout: nextCloseout,
    newCloseoutVersion: null,
    arDebtAdjustmentLedger: null,
    arDebtAdjustment: { posted: false, skipped: true, reason: 'pre_closeout_no_ledger' },
    returnOrderAdjustment,
    returnUpdated: Boolean(returnOrderAdjustment && returnOrderAdjustment.returnUpdated),
    message: returnOrderAdjustment && returnOrderAdjustment.returnUpdated ? 'Đã cập nhật điều chỉnh trước chốt sổ và ghi nhận hàng trả.' : 'Đã cập nhật điều chỉnh trước chốt sổ; chưa sinh AR ledger.'
  };
}

async function createCorrection(input = {}, options = {}) {
  const result = await withOptionalMongoTransaction(options, async (session) => {
    const now = options.now || dateUtil.nowIso();
    const actor = actorName(input.actor || options.actor || input.createdBy || input.correctedBy || 'accountant');
    const order = await findOrderForCorrection(input, { ...options, session });
    if (!isCloseoutConfirmed(order)) {
      return createOpenOrderAdjustment(input, order, { ...options, session, now, actor });
    }
    const originalCloseout = assertConfirmedCloseout(order);
    const original = originalCloseoutIdentity(order);
    const idempotencyKey = text(input.idempotencyKey || buildIdempotencyKey(input, order));

    const existing = await DeliveryCloseoutCorrection.findOne({ idempotencyKey }).lean().session(session);
    if (existing) return loadIdempotentResult(existing, { ...options, session });

    const rawReturnAdjustmentItems = returnAdjustmentInputItems(input);
  const returnAdjustmentItems = normalizeReturnAdjustmentItems(rawReturnAdjustmentItems);
    const rawCashLines = input.correctedCashLines || input.cashAdjustmentLines || [];

    const latest = await latestVersionForOriginal(original.id, { ...options, session });
    const baseSnapshot = latest || originalCloseout;
    const currentState = previousPaymentState(baseSnapshot, order);
    const previousVersion = latest ? Number(latest.closeoutVersion || 0) : original.version;
    const newCloseoutVersionNo = previousVersion + 1;
    const correctionId = text(input.id || `DCOC-${orderId(order) || orderCode(order)}-${newCloseoutVersionNo}-${shortHash(idempotencyKey)}`);
    const correctionCode = text(input.correctionCode || input.code || correctionId);
    const newCloseoutId = text(`DCOV-${orderId(order) || orderCode(order)}-v${newCloseoutVersionNo}-${shortHash(correctionId)}`);
    const newCloseoutCode = text(`DCOV-${orderCode(order) || orderId(order)}-v${newCloseoutVersionNo}`);

    const previousReturn = currentState.returnAmount;
    const previousCash = currentState.cashAmount;
    const previousBank = currentState.bankAmount;
    const previousReward = currentState.rewardAmount;
    const previousDebt = currentState.debtAmount;
    const sale = currentState.receivableAmount;

    const explicitReturnAdjustment = input.returnAdjustmentAmount !== undefined ? money(input.returnAdjustmentAmount) : null;
    const returnAdjustmentAmount = money(explicitReturnAdjustment === null ? sumAdjustments(returnAdjustmentItems) : explicitReturnAdjustment);
    const newReturnAmount = money(previousReturn + returnAdjustmentAmount);

    const nextPaymentState = finalPaymentStateFromInput(input, rawCashLines, currentState);
    const cashAdjustmentLines = buildFinalPaymentLines(currentState, nextPaymentState);
    const cashDeltaAmount = money(nextPaymentState.cashAmount - previousCash);
    const bankDeltaAmount = money(nextPaymentState.bankAmount - previousBank);
    const rewardDeltaAmount = money(nextPaymentState.rewardAmount - previousReward);
    const cashAdjustmentAmount = money(cashDeltaAmount + bankDeltaAmount + rewardDeltaAmount);
    const debtCalculation = calculateDeliveryDebtAmount({
      receivableAmount: sale,
      cashAmount: nextPaymentState.cashAmount,
      bankAmount: nextPaymentState.bankAmount,
      rewardAmount: nextPaymentState.rewardAmount,
      returnAmount: newReturnAmount
    });
    const newDebtAmount = money(debtCalculation.debtAmount);
    const debtAdjustmentAmount = money(newDebtAmount - previousDebt);

    const calculated = {
      returnAdjustmentItems,
      cashAdjustmentLines,
      returnAdjustmentAmount,
      cashAdjustmentAmount,
      debtAdjustmentAmount,
      currentState,
      finalState: { ...nextPaymentState, returnAmount: newReturnAmount, debtAmount: newDebtAmount }
    };
    validateCorrectionInput(input, calculated);

    const correction = {
      id: correctionId,
      code: correctionCode,
      correctionCode,
      tenantId: text(order.tenantId),
      originalCloseoutId: original.id,
      originalCloseoutCode: original.code,
      newCloseoutId,
      newCloseoutCode,
      originalCloseoutVersion: original.version,
      newCloseoutVersion: newCloseoutVersionNo,
      deliveryDate: text(order.deliveryDate || order.orderDate || order.date || order.documentDate),
      deliveryStaffCode: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
      deliveryStaffName: text(order.deliveryStaffName || order.deliveryName || order.nvghName),
      salesStaffCode: text(order.salesStaffCode || order.salesmanCode || order.nvbhCode),
      salesStaffName: text(order.salesStaffName || order.salesmanName || order.nvbhName),
      customerId: text(order.customerId),
      customerCode: text(order.customerCode),
      customerName: text(order.customerName),
      salesOrderId: orderId(order),
      salesOrderCode: orderCode(order),
      orderId: orderId(order),
      orderCode: orderCode(order),
      previousReturnAmount: previousReturn,
      previousCashAmount: previousCash,
      previousBankAmount: previousBank,
      previousRewardAmount: previousReward,
      previousCashCollectedAmount: previousCash,
      previousCollectedAmount: currentState.collectedAmount,
      previousDebtAmount: previousDebt,
      newReturnAmount,
      newCashAmount: nextPaymentState.cashAmount,
      newBankAmount: nextPaymentState.bankAmount,
      newRewardAmount: nextPaymentState.rewardAmount,
      newCashCollectedAmount: nextPaymentState.cashAmount,
      newCollectedAmount: nextPaymentState.collectedAmount,
      newDebtAmount,
      cashAmount: nextPaymentState.cashAmount,
      bankAmount: nextPaymentState.bankAmount,
      rewardAmount: nextPaymentState.rewardAmount,
      returnAmount: newReturnAmount,
      debtAmount: newDebtAmount,
      finalDebtAmount: newDebtAmount,
      rawDebtAmount: debtCalculation.rawDebtAmount,
      returnAdjustmentAmount,
      cashDeltaAmount,
      bankDeltaAmount,
      rewardDeltaAmount,
      totalCollectedDelta: cashAdjustmentAmount,
      // Backward-compatible aggregate field: total payment delta, not cash final state.
      cashAdjustmentAmount,
      debtDeltaAmount: debtAdjustmentAmount,
      debtAdjustmentAmount,
      returnAdjustmentItems,
      cashAdjustmentLines,
      reason: correctionReason(input),
      auditReason: correctionAuditReason(input),
      note: text(input.note || ''),
      status: 'confirmed',
      sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
      idempotencyKey,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
      auditTrail: [{ at: now, by: actor, action: 'CREATE_DELIVERY_CLOSEOUT_FINAL_STATE_CORRECTION', originalCloseoutId: original.id }],
      metadata: { phase: 'Phase109', immutableContract: true, correctionSemantics: 'final_state_value' }
    };

    const newCloseoutVersion = buildVersionSnapshot(order, baseSnapshot, correction, now);

    const returnOrderAdjustment = await applyReturnOrderAdjustment({
      order,
      items: rawReturnAdjustmentItems,
      actor,
      reason: correction.reason || correction.auditReason,
      note: correction.note
    }, { ...options, session, now });

    await DeliveryCloseoutCorrection.findOneAndUpdate(
      { idempotencyKey },
      { $setOnInsert: correction },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );
    await DeliveryCloseoutVersion.findOneAndUpdate(
      { correctionId },
      { $setOnInsert: newCloseoutVersion },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );

    const paymentAllocation = await upsertCorrectionPaymentAllocation(order, newCloseoutVersion, {
      ...options,
      session,
      now,
      actor
    });

    const adjustment = await ArDebtAdjustmentPostingService.postAdjustment(order, {
      reconcileDebt: true,
      correctionId,
      correctionCode,
      sourceId: correctionId,
      sourceCode: correctionCode,
      orderId: orderId(order),
      orderCode: orderCode(order),
      originalCloseoutId: original.id,
      originalCloseoutCode: original.code,
      newCloseoutId,
      newCloseoutCode,
      deliveryCloseoutVersion: newCloseoutVersionNo,
      version: newCloseoutVersionNo,
      oldFinalDebtAmount: previousDebt,
      newFinalDebtAmount: correction.newDebtAmount,
      deltaDebt: debtAdjustmentAmount,
      debtAdjustmentAmount,
      receivableAmount: sale,
      cashAmount: nextPaymentState.cashAmount,
      bankAmount: nextPaymentState.bankAmount,
      rewardAmount: nextPaymentState.rewardAmount,
      returnAmount: newReturnAmount,
      rawDebtAmount: debtCalculation.rawDebtAmount,
      zeroTolerance: 1000,
      reconcileAllocation: {
        allocationCode: correctionId,
        idempotencyKey: `DCO-RECONCILE:${orderCode(order) || orderId(order)}:DELIVERY_CLOSEOUT_CORRECTION:${correctionId}:v${newCloseoutVersionNo}`,
        orderId: orderId(order),
        orderCode: orderCode(order),
        customerCode: text(order.customerCode),
        customerName: text(order.customerName),
        salesStaffCode: text(order.salesStaffCode || order.salesmanCode || order.nvbhCode),
        salesStaffName: text(order.salesStaffName || order.salesmanName || order.nvbhName),
        deliveryStaffCode: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
        deliveryStaffName: text(order.deliveryStaffName || order.deliveryName || order.nvghName),
        deliveryDate: text(order.deliveryDate || order.orderDate || order.date || order.documentDate),
        sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
        sourceId: correctionId,
        sourceCode: correctionCode,
        sourceVersion: newCloseoutVersionNo,
        receivableAmount: sale,
        cashAmount: nextPaymentState.cashAmount,
        bankAmount: nextPaymentState.bankAmount,
        rewardAmount: nextPaymentState.rewardAmount,
        returnAmount: newReturnAmount,
        rawDebtAmount: debtCalculation.rawDebtAmount,
        normalizedDebtAmount: correction.newDebtAmount,
        debtAmount: correction.newDebtAmount,
        zeroTolerance: 1000,
        zeroToleranceApplied: Math.abs(money(debtCalculation.rawDebtAmount)) <= 1000 && money(debtCalculation.rawDebtAmount) !== correction.newDebtAmount,
        zeroToleranceAdjustmentAmount: money(debtCalculation.rawDebtAmount - correction.newDebtAmount),
        status: 'posted'
      },
      returnAdjustmentAmount,
      cashAdjustmentAmount,
      reason: correction.auditReason || correction.reason || 'Điều chỉnh không ghi lý do',
      correctedBy: actor,
      correctedAt: now
    }, { ...options, session, actor, reconcileDebt: true, sourceType: 'DELIVERY_CLOSEOUT_CORRECTION', sourceId: correctionId, sourceCode: correctionCode, sourceModel: 'deliveryCloseoutCorrections' });

    const ledgerEntry = adjustment && (adjustment.entry || adjustment.arDebtAdjustmentLedger || adjustment);
    if (ledgerEntry && ledgerEntry.code) {
      await DeliveryCloseoutCorrection.updateOne(
        { id: correctionId },
        { $set: { arDebtAdjustmentLedgerId: text(ledgerEntry.id), arDebtAdjustmentLedgerCode: text(ledgerEntry.code), updatedAt: now } },
        { session }
      );
    }

    const adjustmentDirection = text(ledgerEntry && (ledgerEntry.direction || ledgerEntry.amountField))
      || (money(ledgerEntry && ledgerEntry.debit) > 0 ? 'debit' : (money(ledgerEntry && ledgerEntry.credit) > 0 ? 'credit' : ''));
    const adjustmentAmountForMessage = Math.max(money(ledgerEntry && ledgerEntry.debit), money(ledgerEntry && ledgerEntry.credit), money(ledgerEntry && ledgerEntry.amount));
    const adjustmentMessage = ledgerEntry && ledgerEntry.code && adjustmentAmountForMessage > 0
      ? `và AR-DEBT-ADJUSTMENT ${adjustmentDirection || (debtAdjustmentAmount >= 0 ? 'debit' : 'credit')} ${adjustmentAmountForMessage}`
      : 'không sinh AR-DEBT-ADJUSTMENT vì không có chênh lệch công nợ';

    return {
      success: true,
      correction,
      newCloseoutVersion,
      newCloseout: newCloseoutVersion,
      arDebtAdjustmentLedger: ledgerEntry,
      arDebtAdjustment: adjustment,
      paymentAllocation,
      orderPaymentAllocation: paymentAllocation,
      paymentAllocationIntegrated: Boolean(paymentAllocation),
      returnOrderAdjustment,
      returnUpdated: Boolean(returnOrderAdjustment && returnOrderAdjustment.returnUpdated),
      message: `${paymentAllocation ? 'Đã đồng bộ orderPaymentAllocations; ' : ''}${returnOrderAdjustment && returnOrderAdjustment.returnUpdated ? 'Đã cập nhật returnOrders; ' : ''}Đã tạo correction version ${newCloseoutVersionNo}; ${adjustmentMessage}.`
    };
  });

  if (result && result.success && result.correction) {
    const correction = result.correction;
    const hasMoneyDelta = money(correction.cashDeltaAmount) !== 0 || money(correction.bankDeltaAmount) !== 0 || money(correction.rewardDeltaAmount) !== 0 || money(correction.debtDeltaAmount) !== 0 || money(correction.returnAdjustmentAmount) !== 0;
    await emitDomainEventSafe({
      eventType: EVENT_TYPES.DELIVERY_CLOSEOUT_ADJUSTED,
      entityType: 'deliveryCloseout',
      entityId: text(correction.newCloseoutId || correction.originalCloseoutId || correction.salesOrderId),
      entityCode: text(correction.salesOrderCode || correction.orderCode || correction.newCloseoutCode),
      severity: hasMoneyDelta ? 'warning' : 'info',
      actor: input.actor || options.actor || { name: correction.createdBy || 'accountant', role: 'accountant' },
      before: {
        cashAmount: money(correction.previousCashAmount),
        bankAmount: money(correction.previousBankAmount),
        rewardAmount: money(correction.previousRewardAmount),
        returnAmount: money(correction.previousReturnAmount),
        debtAmount: money(correction.previousDebtAmount)
      },
      after: {
        cashAmount: money(correction.newCashAmount),
        bankAmount: money(correction.newBankAmount),
        rewardAmount: money(correction.newRewardAmount),
        returnAmount: money(correction.newReturnAmount),
        debtAmount: money(correction.newDebtAmount)
      },
      diff: {
        cashDeltaAmount: money(correction.cashDeltaAmount),
        bankDeltaAmount: money(correction.bankDeltaAmount),
        rewardDeltaAmount: money(correction.rewardDeltaAmount),
        returnAdjustmentAmount: money(correction.returnAdjustmentAmount),
        debtDeltaAmount: money(correction.debtDeltaAmount)
      },
      metadata: {
        orderCode: text(correction.salesOrderCode || correction.orderCode),
        salesOrderCode: text(correction.salesOrderCode || correction.orderCode),
        orderId: text(correction.salesOrderId || correction.orderId),
        salesOrderId: text(correction.salesOrderId || correction.orderId),
        canonicalOrderId: text(correction.salesOrderId || correction.orderId),
        closeoutVersionId: text(correction.newCloseoutId || correction.originalCloseoutId),
        closeoutVersionCode: text(correction.newCloseoutCode || correction.originalCloseoutCode),
        originalCloseoutId: text(correction.originalCloseoutId),
        newCloseoutId: text(correction.newCloseoutId),
        deliveryDate: text(correction.deliveryDate),
        customerCode: text(correction.customerCode),
        customerName: text(correction.customerName),
        deliveryStaffCode: text(correction.deliveryStaffCode),
        deliveryStaffName: text(correction.deliveryStaffName),
        salesStaffCode: text(correction.salesStaffCode),
        salesStaffName: text(correction.salesStaffName),
        reason: text(correction.reason || correction.auditReason),
        correctionId: text(correction.id),
        adjustmentId: text(correction.id),
        correctionCode: text(correction.correctionCode || correction.code),
        adjustmentCode: text(correction.correctionCode || correction.code),
        targetPage: 'delivery-today-new',
        action: 'open-adjustment-detail',
        source: 'deliveryCloseoutCorrections',
        resolverContract: 'delivery-adjustment-deeplink'
      },
      idempotencyKey: `DELIVERY_CLOSEOUT_ADJUSTED:${text(correction.id || correction.correctionCode)}`
    });
  }

  return result;
}

async function resolveAdjustmentDeepLink(input = {}, options = {}) {
  const modelSet = options.models || { SalesOrder, DeliveryCloseoutCorrection, DeliveryCloseoutVersion };
  const warnings = [];
  const filtersBefore = input.filtersBefore && typeof input.filtersBefore === 'object' ? input.filtersBefore : {};
  const lookup = correctionLookup(input);
  let correction = null;
  if (lookup) {
    let query = modelSet.DeliveryCloseoutCorrection.findOne(lookup).sort({ createdAt: -1, updatedAt: -1 }).lean();
    correction = await queryWithOptionalSession(query, options);
  }

  const vLookup = versionLookup(input, correction);
  let version = null;
  if (vLookup) {
    let query = modelSet.DeliveryCloseoutVersion.findOne(vLookup).sort({ closeoutVersion: -1, createdAt: -1 }).lean();
    version = await queryWithOptionalSession(query, options);
  }

  if (!correction && !version) {
    const err = new Error('Không tìm thấy bản ghi điều chỉnh theo adjustmentCode/correctionCode.');
    err.code = 'DELIVERY_ADJUSTMENT_NOT_FOUND';
    err.status = 404;
    err.data = {
      contract: 'delivery-adjustment-deeplink',
      adjustmentCode: text(input.adjustmentCode || input.correctionCode),
      orderCode: text(input.orderCode || input.salesOrderCode),
      urlOrderId: text(input.orderId || input.salesOrderId),
      adjustmentFound: false,
      orderFound: false,
      source: 'deliveryAdjustmentResolver'
    };
    throw err;
  }

  const adjustment = adjustmentPublic(correction || {}, version);
  const oLookup = orderLookupFromResolver(input, correction, version);
  let order = null;
  if (oLookup) {
    let query = modelSet.SalesOrder.findOne(oLookup).lean();
    order = await queryWithOptionalSession(query, options);
  }
  if (!order) warnings.push('Không tìm thấy đơn gốc trong orders, nhưng đã tìm thấy bản ghi điều chỉnh.');

  let row = null;
  if (order) {
    try {
      const deliveryTodayNewService = require('./v2/deliveryTodayNew.service');
      const returnsByKey = await deliveryTodayNewService._private.loadReturnsForOrders([order], options);
      const versionsByKey = await deliveryTodayNewService._private.loadLatestVersionsForOrders([order], options);
      row = deliveryTodayNewService.summarizeOrder(order, returnsByKey, versionsByKey);
    } catch (err) {
      warnings.push(`Không chuẩn hóa được order row bằng DeliveryTodayNewService: ${err.message || err}`);
    }
  }
  if (!row) row = syntheticOrderFromAdjustment(adjustment, version);

  const versionKeys = uniqueText([
    adjustment.originalCloseoutId,
    adjustment.originalCloseoutCode,
    adjustment.orderId,
    adjustment.orderCode,
    adjustment.adjustmentId,
    adjustment.adjustmentCode,
    row.orderId,
    row.orderCode
  ]);
  let versions = [];
  if (versionKeys.length) {
    const versionOr = versionKeys.flatMap((key) => ([
      { originalCloseoutId: key },
      { originalCloseoutCode: key },
      { salesOrderId: key },
      { salesOrderCode: key },
      { orderId: key },
      { orderCode: key },
      { correctionId: key },
      { correctionCode: key },
      { id: key },
      { code: key },
      { closeoutCode: key }
    ]));
    let query = modelSet.DeliveryCloseoutVersion.find({ $or: versionOr }).sort({ closeoutVersion: -1, createdAt: -1 }).lean();
    versions = await queryWithOptionalSession(query, options);
  }
  if (!versions.length && version) versions = [version];

  const resolvedDeliveryDate = text(row.deliveryDate || adjustment.deliveryDate || (version && version.deliveryDate));
  const resolvedDeliveryStaffCode = text(row.deliveryStaffCode || adjustment.deliveryStaffCode || (version && version.deliveryStaffCode));
  const resolvedSalesStaffCode = text(row.salesStaffCode || adjustment.salesStaffCode || (version && version.salesStaffCode));
  const diagnostics = {
    contract: 'delivery-adjustment-deeplink',
    action: 'open-adjustment-detail',
    adjustmentCode: text(input.adjustmentCode || input.correctionCode || adjustment.adjustmentCode),
    orderCode: text(input.orderCode || input.salesOrderCode || adjustment.orderCode || row.orderCode),
    urlOrderId: text(input.orderId || input.salesOrderId),
    resolvedOrderId: text(row.orderId || row.id || (order && (order.id || order._id))),
    closeoutVersionId: text(adjustment.closeoutVersionId || (version && (version.id || version.code || version.closeoutCode))),
    adjustmentFound: true,
    orderFound: Boolean(order),
    deliveryDate: resolvedDeliveryDate,
    filtersBefore,
    filtersAfter: {
      date: resolvedDeliveryDate,
      orderCode: text(row.orderCode || adjustment.orderCode),
      deliveryStaffCode: resolvedDeliveryStaffCode,
      salesStaffCode: resolvedSalesStaffCode
    },
    source: 'deliveryAdjustmentResolver'
  };

  return {
    ok: true,
    success: true,
    source: 'deliveryAdjustmentResolver',
    adjustmentFound: true,
    orderFound: Boolean(order),
    adjustment,
    order: order ? {
      _id: text(order._id),
      id: text(order.id || order._id),
      orderId: text(order.id || order._id),
      orderCode: orderCode(order),
      deliveryDate: text(order.deliveryDate || order.orderDate || order.date || order.documentDate),
      deliveryStaffCode: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
      deliveryStaffName: text(order.deliveryStaffName || order.deliveryName || order.nvghName),
      salesStaffCode: text(order.salesStaffCode || order.salesmanCode || order.nvbhCode),
      salesStaffName: text(order.salesStaffName || order.salesmanName || order.nvbhName),
      customerCode: text(order.customerCode),
      customerName: text(order.customerName)
    } : null,
    row,
    rows: row ? [row] : [],
    versions,
    context: {
      deliveryDate: resolvedDeliveryDate,
      deliveryStaffCode: resolvedDeliveryStaffCode,
      deliveryStaffName: text(row.deliveryStaffName || adjustment.deliveryStaffName || (version && version.deliveryStaffName)),
      salesStaffCode: resolvedSalesStaffCode,
      salesStaffName: text(row.salesStaffName || adjustment.salesStaffName || (version && version.salesStaffName)),
      closeoutVersionId: diagnostics.closeoutVersionId,
      originalCloseoutId: text(adjustment.originalCloseoutId),
      orderCode: text(row.orderCode || adjustment.orderCode),
      orderId: text(row.orderId || adjustment.orderId)
    },
    warnings,
    diagnostics
  };
}

async function listCorrections(originalCloseoutId = '', options = {}) {
  const id = text(originalCloseoutId);
  if (!id) return [];
  let query = DeliveryCloseoutCorrection.find({ $or: [{ originalCloseoutId: id }, { salesOrderId: id }, { salesOrderCode: id }, { orderId: id }, { orderCode: id }] })
    .sort({ createdAt: -1 })
    .lean();
  if (options.session) query = query.session(options.session);
  return query;
}

async function listVersions(originalCloseoutId = '', options = {}) {
  const id = text(originalCloseoutId);
  if (!id) return [];
  let query = DeliveryCloseoutVersion.find({
    $or: [
      { originalCloseoutId: id },
      { originalCloseoutCode: id },
      { salesOrderId: id },
      { salesOrderCode: id },
      { orderId: id },
      { orderCode: id },
      { correctionId: id },
      { correctionCode: id },
      { id },
      { code: id },
      { closeoutCode: id }
    ]
  })
    .sort({ closeoutVersion: -1, createdAt: -1 })
    .lean();
  if (options.session) query = query.session(options.session);
  return query;
}

async function correctionSession(input = {}, options = {}) {
  return createCorrection(input, options);
}

async function addReturn(input = {}, options = {}) {
  const amount = Math.abs(money(input.returnAdjustmentAmount ?? input.amount ?? input.returnAmount ?? input.totalAmount));
  return createCorrection({
    ...input,
    correctedReturnItems: input.correctedReturnItems || input.returnAdjustmentItems || [{
      productCode: text(input.productCode || ''),
      productName: text(input.productName || ''),
      adjustmentAmount: amount
    }]
  }, options);
}

async function reduceReturn(input = {}, options = {}) {
  const amount = -Math.abs(money(input.returnAdjustmentAmount ?? input.amount ?? input.returnAmount ?? input.totalAmount));
  return createCorrection({
    ...input,
    correctedReturnItems: input.correctedReturnItems || input.returnAdjustmentItems || [{
      productCode: text(input.productCode || ''),
      productName: text(input.productName || ''),
      adjustmentAmount: amount
    }]
  }, options);
}

module.exports = {
  createCorrection,
  correctionSession,
  addReturn,
  reduceReturn,
  listCorrections,
  listVersions,
  resolveAdjustmentDeepLink,
  buildDeliveryAdjustmentReturnRows,
  applyReturnOrderAdjustment,
  upsertCorrectionPaymentAllocation,
  correctionAllocationIdempotencyKey,
  normalizeReturnAdjustmentItems,
  normalizeCashAdjustmentLines,
  createOpenOrderAdjustment,
  buildIdempotencyKey,
  buildVersionSnapshot,
  assertConfirmedCloseout,
  _internal: {
    money,
    quantity,
    text,
    stableJson,
    hash,
    shortHash,
    originalCloseoutIdentity,
    previousReturnAmount,
    previousCashAmount,
    previousDebtAmount,
    openOrderPaymentState,
    itemAdjustmentAmount,
    cashLineAdjustmentAmount,
    correctionReason,
    correctionAuditReason,
    validateCorrectionInput,
    isCloseoutContextId,
    correctionLookup,
    versionLookup,
    orderLookupFromResolver,
    adjustmentPublic,
    syntheticOrderFromAdjustment,
    compactDeliveredItemsFromOrder,
    currentReturnMapFromOrders,
    returnOrderLockedForDirectEdit,
    upsertCorrectionPaymentAllocation,
    correctionAllocationIdempotencyKey
  }
};
