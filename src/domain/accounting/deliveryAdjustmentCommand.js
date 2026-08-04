'use strict';

const { toNumber } = require('../../utils/common.util');

const ADJUSTMENT_INTENTS = Object.freeze({
  PAYMENT_ONLY: 'PAYMENT_ONLY',
  RETURN_ONLY: 'RETURN_ONLY',
  COMBINED: 'COMBINED',
  POST_CLOSEOUT_CORRECTION: 'POST_CLOSEOUT_CORRECTION'
});

const VALID_INTENTS = new Set(Object.values(ADJUSTMENT_INTENTS));
const RETURN_TOP_LEVEL_FIELDS = Object.freeze([
  'returnAdjustmentAmount',
  'returnAdjustmentItems',
  'correctedReturnItems',
  'correctedReturnedItems',
  'returnItems',
  'returnedItems',
  'returnAdjustment'
]);

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const amount = Number(toNumber(value));
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function quantity(value) {
  const amount = Number(toNumber(value));
  return Number.isFinite(amount) ? amount : 0;
}

function hasOwn(source = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(source || {}, key)
    && source[key] !== undefined
    && source[key] !== null;
}

function commandError(code, message, status = 400, data = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (data !== undefined) error.data = data;
  return error;
}

function normalizeIntent(value = '') {
  const intent = text(value).toUpperCase();
  if (!intent) return '';
  if (!VALID_INTENTS.has(intent)) {
    throw commandError(
      'INVALID_ADJUSTMENT_INTENT',
      'Loại điều chỉnh không hợp lệ.',
      400,
      { receivedIntent: text(value), allowedIntents: [...VALID_INTENTS] }
    );
  }
  return intent;
}

function hasAnyReturnPayloadField(input = {}) {
  return RETURN_TOP_LEVEL_FIELDS.some((key) => hasOwn(input, key));
}

function explicitReturnTotals(input = {}) {
  const totals = [];
  if (hasOwn(input, 'returnAdjustmentAmount')) {
    totals.push({ field: 'returnAdjustmentAmount', value: money(input.returnAdjustmentAmount) });
  }
  if (input.returnAdjustment && typeof input.returnAdjustment === 'object') {
    if (hasOwn(input.returnAdjustment, 'returnAdjustmentAmount')) {
      totals.push({ field: 'returnAdjustment.returnAdjustmentAmount', value: money(input.returnAdjustment.returnAdjustmentAmount) });
    }
    if (hasOwn(input.returnAdjustment, 'amount')) {
      totals.push({ field: 'returnAdjustment.amount', value: money(input.returnAdjustment.amount) });
    }
  }
  return totals;
}

function materialReturnItems(normalizedItems = []) {
  return (Array.isArray(normalizedItems) ? normalizedItems : []).filter((item) => (
    quantity(item.adjustmentQty ?? item.deltaReturnQty) !== 0
    || money(item.adjustmentAmount ?? item.deltaReturnAmount) !== 0
  ));
}

function returnTotalFromItems(items = []) {
  return money((Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + money(item.adjustmentAmount ?? item.deltaReturnAmount),
    0
  ));
}

function paymentDelta(currentState = {}, nextPaymentState = {}) {
  const cashDelta = money(nextPaymentState.cashAmount) - money(currentState.cashAmount);
  const bankDelta = money(nextPaymentState.bankAmount) - money(currentState.bankAmount);
  const rewardDelta = money(nextPaymentState.rewardAmount) - money(currentState.rewardAmount);
  return {
    cashDelta: money(cashDelta),
    bankDelta: money(bankDelta),
    rewardDelta: money(rewardDelta),
    paymentChanged: money(cashDelta) !== 0 || money(bankDelta) !== 0 || money(rewardDelta) !== 0
  };
}

function inferLegacyIntent({ input = {}, paymentChanged = false, returnChanged = false } = {}) {
  if (paymentChanged && returnChanged) return ADJUSTMENT_INTENTS.COMBINED;
  if (returnChanged) return ADJUSTMENT_INTENTS.RETURN_ONLY;
  if (paymentChanged) return ADJUSTMENT_INTENTS.PAYMENT_ONLY;

  const hasPaymentPayload = Boolean(
    (input.paymentCorrection && typeof input.paymentCorrection === 'object')
    || Array.isArray(input.correctedCashLines)
    || Array.isArray(input.cashAdjustmentLines)
  );
  if (hasPaymentPayload) return ADJUSTMENT_INTENTS.PAYMENT_ONLY;
  if (hasAnyReturnPayloadField(input)) return ADJUSTMENT_INTENTS.RETURN_ONLY;
  return ADJUSTMENT_INTENTS.PAYMENT_ONLY;
}

function assertIntentShape({
  explicitIntent,
  operationIntent,
  input,
  paymentChanged,
  returnChanged,
  closeoutConfirmed
}) {
  if (explicitIntent === ADJUSTMENT_INTENTS.POST_CLOSEOUT_CORRECTION && !closeoutConfirmed) {
    throw commandError(
      'INVALID_ADJUSTMENT_INTENT',
      'Đơn chưa chốt không thể dùng loại điều chỉnh sau chốt.',
      400,
      { receivedIntent: explicitIntent, closeoutConfirmed: false }
    );
  }

  if (explicitIntent === ADJUSTMENT_INTENTS.PAYMENT_ONLY && hasAnyReturnPayloadField(input)) {
    throw commandError(
      'PAYMENT_ONLY_CONTAINS_RETURN_MUTATION',
      'Điều chỉnh tiền thu không được chứa dữ liệu thay đổi hàng trả.',
      400,
      { receivedIntent: explicitIntent, returnFields: RETURN_TOP_LEVEL_FIELDS.filter((key) => hasOwn(input, key)) }
    );
  }

  if (operationIntent === ADJUSTMENT_INTENTS.PAYMENT_ONLY && returnChanged) {
    throw commandError(
      'PAYMENT_ONLY_CONTAINS_RETURN_MUTATION',
      'Điều chỉnh tiền thu không được chứa thay đổi hàng trả.',
      400
    );
  }
  if (operationIntent === ADJUSTMENT_INTENTS.RETURN_ONLY && paymentChanged) {
    throw commandError(
      'INVALID_ADJUSTMENT_INTENT',
      'Điều chỉnh hàng trả không được thay đổi trạng thái tiền thu.',
      400
    );
  }
  if (operationIntent === ADJUSTMENT_INTENTS.COMBINED && (!paymentChanged || !returnChanged)) {
    throw commandError(
      'INVALID_ADJUSTMENT_INTENT',
      'Điều chỉnh kết hợp phải có cả thay đổi tiền thu và thay đổi hàng trả.',
      400,
      { paymentChanged, returnChanged }
    );
  }
}

function assertReturnTotalsMatch(clientTotals = [], serverTotal = 0, tolerance = 1) {
  if (!clientTotals.length) return;
  const mismatches = clientTotals.filter((row) => Math.abs(money(row.value) - money(serverTotal)) > tolerance);
  if (!mismatches.length) return;
  throw commandError(
    'RETURN_TOTAL_MISMATCH',
    'Tổng hàng trả gửi lên không khớp với tổng hệ thống tính từ các dòng thay đổi.',
    400,
    {
      expectedReturnAdjustmentAmount: money(serverTotal),
      receivedReturnAdjustmentAmounts: clientTotals,
      tolerance: money(tolerance)
    }
  );
}

function resolveDeliveryAdjustmentCommand({
  input = {},
  currentState = {},
  nextPaymentState = {},
  normalizedReturnItems = [],
  closeoutConfirmed = false,
  returnTotalTolerance = 1
} = {}) {
  const explicitIntent = normalizeIntent(input.changeType || input.adjustmentIntent || input.commandIntent || '');
  const materialItems = materialReturnItems(normalizedReturnItems);
  const serverReturnTotal = returnTotalFromItems(materialItems);
  const returnChanged = materialItems.length > 0;
  const payment = paymentDelta(currentState, nextPaymentState);

  let operationIntent;
  if (explicitIntent === ADJUSTMENT_INTENTS.POST_CLOSEOUT_CORRECTION) {
    if (payment.paymentChanged && returnChanged) operationIntent = ADJUSTMENT_INTENTS.COMBINED;
    else if (returnChanged) operationIntent = ADJUSTMENT_INTENTS.RETURN_ONLY;
    else operationIntent = ADJUSTMENT_INTENTS.PAYMENT_ONLY;
  } else {
    operationIntent = explicitIntent || inferLegacyIntent({ input, paymentChanged: payment.paymentChanged, returnChanged });
  }

  assertIntentShape({
    explicitIntent,
    operationIntent,
    input,
    paymentChanged: payment.paymentChanged,
    returnChanged,
    closeoutConfirmed
  });

  const clientTotals = explicitReturnTotals(input);
  if (operationIntent === ADJUSTMENT_INTENTS.RETURN_ONLY || operationIntent === ADJUSTMENT_INTENTS.COMBINED) {
    assertReturnTotalsMatch(clientTotals, serverReturnTotal, returnTotalTolerance);
  }

  const ignoredLegacyReturnAggregate = !explicitIntent
    && operationIntent === ADJUSTMENT_INTENTS.PAYMENT_ONLY
    && !returnChanged
    && clientTotals.some((row) => money(row.value) !== 0);

  return {
    intent: explicitIntent || operationIntent,
    operationIntent,
    explicitIntent: Boolean(explicitIntent),
    legacyInferred: !explicitIntent,
    closeoutConfirmed: closeoutConfirmed === true,
    paymentChanged: payment.paymentChanged,
    returnChanged,
    cashDelta: payment.cashDelta,
    bankDelta: payment.bankDelta,
    rewardDelta: payment.rewardDelta,
    materialReturnItems: operationIntent === ADJUSTMENT_INTENTS.PAYMENT_ONLY ? [] : materialItems,
    returnAdjustmentAmount: operationIntent === ADJUSTMENT_INTENTS.PAYMENT_ONLY ? 0 : serverReturnTotal,
    clientReturnTotals: clientTotals,
    ignoredLegacyReturnAggregate,
    ignoredLegacyReturnAggregateAmount: ignoredLegacyReturnAggregate ? money(clientTotals[0]?.value) : 0
  };
}

module.exports = {
  ADJUSTMENT_INTENTS,
  VALID_INTENTS,
  RETURN_TOP_LEVEL_FIELDS,
  normalizeIntent,
  hasAnyReturnPayloadField,
  explicitReturnTotals,
  materialReturnItems,
  returnTotalFromItems,
  paymentDelta,
  resolveDeliveryAdjustmentCommand,
  _internal: {
    text,
    money,
    quantity,
    hasOwn,
    commandError,
    inferLegacyIntent,
    assertIntentShape,
    assertReturnTotalsMatch
  }
};
