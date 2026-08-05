'use strict';

const { toNumber } = require('../../../utils/common.util');

const DEFAULT_DEBT_ZERO_TOLERANCE = 1000;

const CASH_FIELDS = Object.freeze([
  'cashAmount', 'newCashAmount', 'cashCollectedAmount', 'newCashCollectedAmount',
  'cashReceivedAmount', 'paymentCashAmount', 'paidCashAmount', 'paidCash',
  'collectedCash', 'deliveryCashAmount', 'cashCollected', 'cash',
  'cashInAmount', 'cashPaymentAmount'
]);
const BANK_FIELDS = Object.freeze([
  'bankAmount', 'newBankAmount', 'transferAmount', 'newTransferAmount',
  'bankTransferAmount', 'paymentTransferAmount', 'paymentBankAmount',
  'paidBankAmount', 'paidTransferAmount', 'collectedBankAmount',
  'deliveryBankAmount', 'bankCollected', 'bankCollectedAmount',
  'newBankCollectedAmount', 'transferCollectedAmount', 'bankPaymentAmount'
]);
const REWARD_FIELDS = Object.freeze([
  'rewardAmount', 'newRewardAmount', 'bonusAmount', 'newBonusAmount',
  'allowanceAmount', 'newAllowanceAmount', 'promotionRewardAmount',
  'newPromotionRewardAmount', 'displayRewardAmount', 'newDisplayRewardAmount',
  'bonusReturnAmount', 'newBonusReturnAmount', 'correctedRewardAmount',
  'finalRewardAmount'
]);
const OFFSET_FIELDS = Object.freeze([
  'offsetAmount', 'newOffsetAmount', 'debtOffsetAmount', 'newDebtOffsetAmount',
  'otherOffsetAmount', 'newOtherOffsetAmount', 'deliveryOffsetAmount',
  'newDeliveryOffsetAmount', 'rewardOffsetAmount', 'newRewardOffsetAmount',
  'promotionOffsetAmount', 'newPromotionOffsetAmount', 'correctedOffsetAmount',
  'finalOffsetAmount'
]);
const COLLECTED_FIELDS = Object.freeze([
  'collectedAmount', 'newCollectedAmount', 'cashCollectedTotal', 'paidAmount',
  'paymentAmount', 'deliveryCollectedAmount'
]);
const RECEIVABLE_FIELDS = Object.freeze([
  'receivableAmount', 'originalAmount', 'saleAmount', 'totalReceivable',
  'totalAmount', 'amount', 'total', 'finalAmount', 'orderAmount'
]);

function text(value = '') {
  return String(value ?? '').trim();
}

function hasOwnValue(source = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(source || {}, key)
    && source[key] !== undefined
    && source[key] !== null
    && source[key] !== '';
}

function parseMoney(value) {
  if (value === undefined || value === null || value === '') {
    return { present: false, valid: false, value: 0, reason: 'ABSENT' };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { present: true, valid: false, value: 0, reason: 'NON_FINITE' };
    return { present: true, valid: true, value: Math.round(value) };
  }
  const raw = text(value);
  if (!raw) return { present: false, valid: false, value: 0, reason: 'ABSENT' };
  if (!/[0-9]/.test(raw) || /(?:nan|infinity)/i.test(raw)) {
    return { present: true, valid: false, value: 0, reason: 'UNPARSEABLE' };
  }
  const parsed = Number(toNumber(raw));
  if (!Number.isFinite(parsed)) return { present: true, valid: false, value: 0, reason: 'NON_FINITE' };
  return { present: true, valid: true, value: Math.round(parsed) };
}

function pushDiagnostic(diagnostics, entry) {
  if (!Array.isArray(diagnostics)) return;
  diagnostics.push(entry);
}

function readFirstMoney(source = {}, keys = [], options = {}) {
  const diagnostics = options.diagnostics;
  const sourceName = options.sourceName || 'unknown';
  const component = options.component || 'money';
  for (const key of keys) {
    if (!hasOwnValue(source, key)) continue;
    const parsed = parseMoney(source[key]);
    if (!parsed.valid) {
      pushDiagnostic(diagnostics, {
        code: 'INVALID_MONEY', source: sourceName, component, field: key,
        reason: parsed.reason
      });
      continue;
    }
    if (options.nonNegative === true && parsed.value < 0) {
      pushDiagnostic(diagnostics, {
        code: 'NEGATIVE_INPUT_COMPONENT', source: sourceName, component,
        field: key, value: parsed.value
      });
      continue;
    }
    return { present: true, valid: true, value: parsed.value, field: key };
  }
  return { present: false, valid: false, value: 0, field: '' };
}

function firstDefinedMoney(source = {}, keys = []) {
  return readFirstMoney(source, keys).value;
}

function hasAnyExplicitField(source = {}, keys = []) {
  return keys.some((key) => hasOwnValue(source, key));
}

function readPaymentBreakdown(source = {}, options = {}) {
  const diagnostics = options.diagnostics || [];
  const sourceName = options.sourceName || 'unknown';
  const cash = readFirstMoney(source, CASH_FIELDS, { diagnostics, sourceName, component: 'cashAmount', nonNegative: true });
  const bank = readFirstMoney(source, BANK_FIELDS, { diagnostics, sourceName, component: 'bankAmount', nonNegative: true });
  const reward = readFirstMoney(source, REWARD_FIELDS, { diagnostics, sourceName, component: 'rewardAmount', nonNegative: true });
  const offset = readFirstMoney(source, OFFSET_FIELDS, { diagnostics, sourceName, component: 'offsetAmount', nonNegative: true });
  const explicitCollected = readFirstMoney(source, COLLECTED_FIELDS, { diagnostics, sourceName, component: 'totalCollectedAmount', nonNegative: true });

  const hasComponentField = cash.present || bank.present || reward.present || offset.present;
  let cashAmount = cash.value;
  let bankAmount = bank.value;
  let rewardAmount = reward.value;
  let offsetAmount = offset.value;

  // Legacy documents sometimes only stored a total collected amount. Preserve that
  // behavior without using truthiness and without double counting explicit components.
  if (!hasComponentField && explicitCollected.present) cashAmount = explicitCollected.value;

  const totalCollectedAmount = cashAmount + bankAmount + rewardAmount + offsetAmount;
  return {
    cashAmount,
    bankAmount,
    rewardAmount,
    offsetAmount,
    totalCollectedAmount,
    collectedAmount: totalCollectedAmount,
    hasExplicitPayment: hasComponentField || explicitCollected.present,
    invalid: diagnostics.some((row) => row && row.source === sourceName
      && ['INVALID_MONEY', 'NEGATIVE_INPUT_COMPONENT'].includes(row.code))
  };
}

function readReceivableAmount(source = {}, options = {}) {
  const result = readFirstMoney(source, options.keys || RECEIVABLE_FIELDS, {
    diagnostics: options.diagnostics,
    sourceName: options.sourceName || 'unknown',
    component: 'receivableAmount',
    nonNegative: true
  });
  return result;
}

function calculateDebt({ receivableAmount = 0, cashAmount = 0, bankAmount = 0, rewardAmount = 0, offsetAmount = 0, returnAmount = 0 } = {}, options = {}) {
  const tolerance = Number.isFinite(Number(options.zeroTolerance))
    ? Math.max(0, Math.round(Number(options.zeroTolerance)))
    : DEFAULT_DEBT_ZERO_TOLERANCE;
  const totalCollectedAmount = Math.round(cashAmount + bankAmount + rewardAmount + offsetAmount);
  const totalHandledAmount = Math.round(totalCollectedAmount + returnAmount);
  const debtRaw = Math.round(receivableAmount - totalHandledAmount);
  const debtAmount = Math.abs(debtRaw) <= tolerance ? 0 : debtRaw;
  return {
    totalCollectedAmount,
    collectedAmount: totalCollectedAmount,
    totalHandledAmount,
    debtRaw,
    debtAmount,
    openDebtAmount: Math.max(0, debtAmount),
    overpaidAmount: Math.max(0, -debtAmount),
    zeroTolerance: tolerance,
    zeroToleranceApplied: debtAmount === 0 && debtRaw !== 0
  };
}

module.exports = {
  DEFAULT_DEBT_ZERO_TOLERANCE,
  CASH_FIELDS,
  BANK_FIELDS,
  REWARD_FIELDS,
  OFFSET_FIELDS,
  COLLECTED_FIELDS,
  RECEIVABLE_FIELDS,
  text,
  hasOwnValue,
  parseMoney,
  readFirstMoney,
  firstDefinedMoney,
  hasAnyExplicitField,
  readPaymentBreakdown,
  readReceivableAmount,
  calculateDebt
};
