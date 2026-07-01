'use strict';

const crypto = require('node:crypto');
const dateUtil = require('../utils/date.util');
const { toNumber } = require('../utils/common.util');
const { calculateDeliveryDebtAmount, normalizeDebtAmount } = require('../constants/finance.constants');
const { withOptionalMongoTransaction } = require('../utils/transaction.util');
const SalesOrder = require('../models/SalesOrder');
const DeliveryCloseoutCorrection = require('../models/DeliveryCloseoutCorrection');
const DeliveryCloseoutVersion = require('../models/DeliveryCloseoutVersion');
const ArDebtAdjustmentPostingService = require('./accounting/ArDebtAdjustmentPostingService');

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? Math.round(n) : 0;
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
  const oldQty = money(item.oldReturnQty ?? item.oldQty ?? item.oldQuantity ?? 0);
  const newQty = money(item.newReturnQty ?? item.newQty ?? item.newQuantity ?? item.returnQty ?? item.qty ?? 0);
  const price = money(item.unitPrice ?? item.salePrice ?? item.price ?? item.finalPrice ?? 0);
  return money((newQty - oldQty) * price);
}

function normalizeReturnAdjustmentItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const oldQty = money(item.oldReturnQty ?? item.oldQty ?? item.oldQuantity ?? 0);
    const newQty = money(item.newReturnQty ?? item.newQty ?? item.newQuantity ?? item.returnQty ?? item.qty ?? oldQty);
    const unitPrice = money(item.unitPrice ?? item.salePrice ?? item.price ?? item.finalPrice ?? 0);
    const adjustmentQty = item.adjustmentQty !== undefined ? money(item.adjustmentQty) : money(newQty - oldQty);
    const adjustmentAmount = itemAdjustmentAmount({ ...item, oldReturnQty: oldQty, newReturnQty: newQty, unitPrice });
    return {
      productCode: text(item.productCode || item.code || item.sku),
      productName: text(item.productName || item.name || item.description),
      oldReturnQty: oldQty,
      newReturnQty: newQty,
      unitPrice,
      adjustmentQty,
      adjustmentAmount,
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
  const reason = text(input.reason);
  if (!reason) {
    const err = new Error('Bắt buộc nhập lý do điều chỉnh.');
    err.code = 'DELIVERY_CLOSEOUT_CORRECTION_REASON_REQUIRED';
    err.status = 400;
    throw err;
  }
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
  if (!money(calculated.returnAdjustmentAmount) && !money(calculated.cashAdjustmentAmount)) {
    const err = new Error('Không có chênh lệch hàng trả hoặc tiền thu để điều chỉnh.');
    err.code = 'DELIVERY_CLOSEOUT_CORRECTION_EMPTY';
    err.status = 400;
    throw err;
  }
}

function buildIdempotencyKey(input = {}, order = {}) {
  const closeout = originalCloseoutIdentity(order);
  return [
    'DELIVERY_CLOSEOUT_CORRECTION',
    closeout.id,
    hash(stableJson(input.correctedReturnItems || input.returnAdjustmentItems || [])),
    hash(stableJson(input.correctedCashLines || input.cashAdjustmentLines || [])),
    hash(stableJson(input.paymentCorrection || {})),
    hash(stableJson({ returnAdjustmentAmount: money(input.returnAdjustmentAmount), cashAdjustmentAmount: money(input.cashAdjustmentAmount), debtAdjustmentAmount: input.debtAdjustmentAmount === undefined ? null : money(input.debtAdjustmentAmount) })),
    hash(text(input.reason))
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

async function findOrderForCorrection(input = {}, options = {}) {
  const ref = text(input.originalCloseoutId || input.closeoutId || input.orderId || input.orderCode || input.salesOrderId || input.salesOrderCode || input.id || input.code);
  const filter = buildOrderLookup(ref);
  if (!filter) {
    const err = new Error('Thiếu mã closeout/đơn bán để tạo điều chỉnh.');
    err.code = 'DELIVERY_CLOSEOUT_CORRECTION_MISSING_REF';
    err.status = 400;
    throw err;
  }
  let query = SalesOrder.findOne(filter).lean();
  if (options.session) query = query.session(options.session);
  const order = await query;
  if (!order) {
    const err = new Error('Không tìm thấy đơn/closeout gốc để tạo điều chỉnh.');
    err.code = 'DELIVERY_CLOSEOUT_CORRECTION_ORDER_NOT_FOUND';
    err.status = 404;
    throw err;
  }
  return order;
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
    note: text(correction.note),
    createdBy: text(correction.createdBy),
    createdAt: now,
    updatedAt: now,
    auditTrail: [{ at: now, by: text(correction.createdBy), action: 'CREATE_CLOSEOUT_VERSION_FROM_FINAL_STATE_CORRECTION', originalCloseoutId: original.id }],
    metadata: { source: 'Phase109', immutableContract: true, correctionSemantics: 'final_state_value' }
  };
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

async function createCorrection(input = {}, options = {}) {
  return withOptionalMongoTransaction(options, async (session) => {
    const now = options.now || dateUtil.nowIso();
    const actor = actorName(input.actor || options.actor || input.createdBy || input.correctedBy || 'accountant');
    const order = await findOrderForCorrection(input, { ...options, session });
    const originalCloseout = assertConfirmedCloseout(order);
    const original = originalCloseoutIdentity(order);
    const idempotencyKey = text(input.idempotencyKey || buildIdempotencyKey(input, order));

    const existing = await DeliveryCloseoutCorrection.findOne({ idempotencyKey }).lean().session(session);
    if (existing) return loadIdempotentResult(existing, { ...options, session });

    const returnAdjustmentItems = normalizeReturnAdjustmentItems(input.correctedReturnItems || input.returnAdjustmentItems || []);
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
      reason: text(input.reason),
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

    const adjustment = await ArDebtAdjustmentPostingService.postAdjustment(order, {
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
      returnAdjustmentAmount,
      cashAdjustmentAmount,
      reason: correction.reason,
      correctedBy: actor,
      correctedAt: now,
      idempotencyKey: `AR-DEBT-ADJUSTMENT:${correctionId}`
    }, { ...options, session, actor, sourceType: 'DELIVERY_CLOSEOUT_CORRECTION', sourceId: correctionId, sourceCode: correctionCode });

    const ledgerEntry = adjustment && (adjustment.entry || adjustment.arDebtAdjustmentLedger || adjustment);
    if (ledgerEntry && ledgerEntry.code) {
      await DeliveryCloseoutCorrection.updateOne(
        { id: correctionId },
        { $set: { arDebtAdjustmentLedgerId: text(ledgerEntry.id), arDebtAdjustmentLedgerCode: text(ledgerEntry.code), updatedAt: now } },
        { session }
      );
    }

    return {
      success: true,
      correction,
      newCloseoutVersion,
      newCloseout: newCloseoutVersion,
      arDebtAdjustmentLedger: ledgerEntry,
      arDebtAdjustment: adjustment,
      message: `Đã tạo correction version ${newCloseoutVersionNo} và AR-DEBT-ADJUSTMENT ${debtAdjustmentAmount >= 0 ? 'debit' : 'credit'} ${Math.abs(debtAdjustmentAmount)}.`
    };
  });
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
  let query = DeliveryCloseoutVersion.find({ $or: [{ originalCloseoutId: id }, { salesOrderId: id }, { salesOrderCode: id }, { orderId: id }, { orderCode: id }] })
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
  normalizeReturnAdjustmentItems,
  normalizeCashAdjustmentLines,
  buildIdempotencyKey,
  buildVersionSnapshot,
  assertConfirmedCloseout,
  _internal: {
    money,
    text,
    stableJson,
    hash,
    shortHash,
    originalCloseoutIdentity,
    previousReturnAmount,
    previousCashAmount,
    previousDebtAmount,
    itemAdjustmentAmount,
    cashLineAdjustmentAmount,
    validateCorrectionInput
  }
};
