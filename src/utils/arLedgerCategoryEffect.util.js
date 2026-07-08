'use strict';

const { toNumber } = require('./common.util');

function clean(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return clean(value).toUpperCase();
}

function lower(value = '') {
  return clean(value).toLowerCase();
}

function combinedIdentityText(doc = {}) {
  return [
    doc.category,
    doc.ledgerType,
    doc.type,
    doc.sourceType,
    doc.sourceCategory,
    doc.source,
    doc.refType,
    doc.code,
    doc.id,
    doc.idempotencyKey,
    doc.note
  ].map((value) => clean(value)).filter(Boolean).join(' ').toUpperCase();
}

function normalizeArCategory(doc = {}) {
  const exact = upper(doc.category || doc.ledgerType || doc.type);
  const type = lower(doc.type);
  const text = combinedIdentityText(doc);

  if (exact === 'AR-DEBT-OPEN' || type === 'ar_debt_open' || /AR[-_ ]?DEBT[-_ ]?OPEN/.test(text)) return 'AR-DEBT-OPEN';
  if (exact === 'AR-RECEIPT-CASH' || type === 'ar_receipt_cash' || /AR[-_ ]?RECEIPT[-_ ]?CASH/.test(text)) return 'AR-RECEIPT-CASH';
  if (exact === 'AR-RECEIPT-BANK' || type === 'ar_receipt_bank' || /AR[-_ ]?RECEIPT[-_ ]?BANK/.test(text)) return 'AR-RECEIPT-BANK';
  if (exact === 'AR-REWARD-ALLOWANCE' || type === 'ar_reward_allowance' || /AR[-_ ]?REWARD[-_ ]?ALLOWANCE/.test(text)) return 'AR-REWARD-ALLOWANCE';
  if (exact === 'AR-DEBT-PAYMENT' || type === 'ar_debt_payment' || /AR[-_ ]?DEBT[-_ ]?PAYMENT/.test(text)) return 'AR-DEBT-PAYMENT';
  if (exact === 'AR-DEBT-ADJUSTMENT' || type === 'ar_debt_adjustment' || /AR[-_ ]?DEBT[-_ ]?ADJUSTMENT/.test(text)) return 'AR-DEBT-ADJUSTMENT';
  if (exact === 'AR-DEBT-VOID' || type === 'ar_debt_void' || /AR[-_ ]?DEBT[-_ ]?VOID/.test(text)) return 'AR-DEBT-VOID';

  if (
    exact === 'AR-SALE-REVERSAL'
    || type === 'ar_sale_reversal'
    || type === 'ar-sale-reversal'
    || /AR[-_ ]?SALE[-_ ]?REVERSAL/.test(text)
  ) return 'AR-SALE-REVERSAL';

  if (
    exact === 'AR-RETURN-REVERSAL'
    || type === 'ar_return_reversal'
    || type === 'ar-return-reversal'
    || /AR[-_ ]?RETURN[-_ ]?REVERSAL/.test(text)
  ) return 'AR-RETURN-REVERSAL';

  if (
    exact === 'AR-RECEIPT-REVERSAL'
    || type === 'ar_receipt_reversal'
    || type === 'ar-receipt-reversal'
    || /AR[-_ ]?RECEIPT[-_ ]?REVERSAL/.test(text)
  ) return 'AR-RECEIPT-REVERSAL';

  if (exact === 'AR-RETURN' || type === 'ar_return' || /^AR-RETURN/.test(upper(doc.code || doc.id || doc.idempotencyKey)) || /AR[-_ ]?RETURN|RETURN[_ -]?ORDER/.test(text)) return 'AR-RETURN';
  if (exact === 'AR-RECEIPT' || type === 'ar_receipt' || /AR[-_ ]?RECEIPT|\bRECEIPT\b|\bPAYMENT\b|DEBT[_ -]?COLLECTION|\bCOLLECTION\b/.test(text)) return 'AR-RECEIPT';
  if (exact === 'AR-SALE' || type === 'ar_sale' || /AR[-_ ]?SALE|\bSALE\b|SALES[_ -]?ORDER/.test(text)) return 'AR-SALE';
  if (exact === 'AR-EXTERNAL' || exact === 'AR-EXTERNAL-DEBT' || type === 'ar_external' || type === 'ar_external_debt' || /AR[-_ ]?EXTERNAL|EXTERNAL[_ -]?DEBT/.test(text)) return 'AR-EXTERNAL-DEBT';
  if (/AR[-_ ]?(BONUS|ALLOWANCE|REWARD|DISCOUNT)|\b(BONUS|ALLOWANCE|REWARD|DISCOUNT)\b|TRẢ THƯỞNG|TRA THUONG/.test(text)) return 'AR-BONUS-ALLOWANCE';
  if (/AR[-_ ]?ADJUSTMENT|\bADJUSTMENT\b|\bADJUST\b|WRITE[_ -]?OFF|OFFSET|CẤN TRỪ|CAN TRU/.test(text)) return 'AR-ADJUSTMENT';
  return exact || upper(doc.ledgerType || doc.type || 'UNKNOWN');
}

function isBusinessArReturnReversal(doc = {}) {
  return normalizeArCategory(doc) === 'AR-RETURN-REVERSAL';
}

function getArLedgerCategoryEffect(doc = {}) {
  const category = normalizeArCategory(doc);
  if (['AR-DEBT-OPEN', 'AR-SALE', 'AR-EXTERNAL', 'AR-EXTERNAL-DEBT', 'AR-RETURN-REVERSAL', 'AR-RECEIPT-REVERSAL'].includes(category)) {
    return { category, defaultSide: 'debit', effect: 'increase_ar' };
  }
  if (['AR-DEBT-PAYMENT', 'AR-SALE-REVERSAL', 'AR-RETURN', 'AR-RECEIPT', 'AR-RECEIPT-CASH', 'AR-RECEIPT-BANK', 'AR-REWARD-ALLOWANCE', 'AR-BONUS-ALLOWANCE'].includes(category)) {
    return { category, defaultSide: 'credit', effect: 'decrease_ar' };
  }
  if (category === 'AR-DEBT-ADJUSTMENT' || category === 'AR-DEBT-VOID' || category === 'AR-ADJUSTMENT') {
    return { category, defaultSide: 'explicit', effect: 'adjust_ar' };
  }
  return { category, defaultSide: 'explicit', effect: 'explicit_ar' };
}

function firstPositiveMoney(...values) {
  for (const value of values) {
    const n = toNumber(value);
    if (n > 0) return n;
  }
  return 0;
}

function normalizeArLedgerAmounts(doc = {}, category = normalizeArCategory(doc)) {
  let debit = Math.max(0, toNumber(doc.debit ?? doc.arDebit));
  let credit = Math.max(0, toNumber(doc.credit ?? doc.arCredit));
  const amount = Math.max(0, toNumber(doc.amount ?? doc.totalAmount ?? doc.value));

  if (debit <= 0 && credit <= 0 && amount > 0) {
    const side = getArLedgerCategoryEffect({ ...doc, category }).defaultSide;
    if (side === 'debit') debit = amount;
    else if (side === 'credit') credit = amount;
  }

  return { amount, debit, credit };
}

function isDefaultDebitArLedger(doc = {}) {
  return getArLedgerCategoryEffect(doc).defaultSide === 'debit';
}

function isDefaultCreditArLedger(doc = {}) {
  return getArLedgerCategoryEffect(doc).defaultSide === 'credit';
}

module.exports = {
  clean,
  upper,
  lower,
  combinedIdentityText,
  normalizeArCategory,
  isBusinessArReturnReversal,
  getArLedgerCategoryEffect,
  normalizeArLedgerAmounts,
  isDefaultDebitArLedger,
  isDefaultCreditArLedger,
  firstPositiveMoney
};
