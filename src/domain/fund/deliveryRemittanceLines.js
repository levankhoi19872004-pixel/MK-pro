'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');

const LINE_STATUSES = Object.freeze(['draft', 'submitted', 'confirmed', 'reversed', 'cancelled']);
const IMMUTABLE_CONFIRMED_FIELDS = Object.freeze([
  'method', 'fundType', 'amount', 'remittanceDate', 'bankAccountCode', 'bankReference'
]);

function money(value) {
  const amount = Number(toNumber(value));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
}

const METHOD_ALIASES = Object.freeze(['cash', 'bank', 'transfer', 'bank_transfer', 'account']);

function canonicalMethod(value) {
  const raw = String(value || '').trim().toLowerCase();
  return ['bank', 'transfer', 'bank_transfer', 'account'].includes(raw) ? 'bank' : 'cash';
}

function invalidMethod(value) {
  const raw = String(value || '').trim().toLowerCase();
  return Boolean(raw && !METHOD_ALIASES.includes(raw));
}


function canonicalLineStatus(value, fallback = 'draft') {
  const status = String(value || fallback).trim().toLowerCase();
  return LINE_STATUSES.includes(status) ? status : fallback;
}

function sanitizeLineId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96);
}

function createLineId({ submissionIdentity = '', method = 'cash', index = 0, makeId } = {}) {
  if (typeof makeId === 'function') return String(makeId('NQGHL')).trim();
  const suffix = `${Date.now()}-${index + 1}`;
  return `NQGHL-${sanitizeLineId(submissionIdentity || 'DRAFT')}-${canonicalMethod(method).toUpperCase()}-${suffix}`;
}

function normalizeLine(raw = {}, options = {}) {
  const rawMethod = raw.method || raw.fundType || raw.paymentMethod;
  const method = canonicalMethod(rawMethod);
  const lineId = sanitizeLineId(raw.lineId || raw.id) || createLineId({
    submissionIdentity: options.submissionIdentity,
    method,
    index: options.index,
    makeId: options.makeId
  });
  const status = canonicalLineStatus(raw.status, options.defaultStatus || 'draft');
  const remittanceDate = dateUtil.toDateOnly(raw.remittanceDate || raw.accountingDate || '', '');
  return {
    lineId,
    method,
    fundType: method,
    invalidMethod: raw.invalidMethod === true || invalidMethod(rawMethod),
    amount: money(raw.amount),
    remittanceDate,
    bankAccountCode: method === 'bank' ? String(raw.bankAccountCode || raw.account || '').trim() : '',
    bankReference: method === 'bank' ? String(raw.bankReference || raw.reference || '').trim() : '',
    status,
    confirmedAt: String(raw.confirmedAt || '').trim(),
    confirmedBy: String(raw.confirmedBy || '').trim(),
    fundLedgerId: String(raw.fundLedgerId || '').trim(),
    idempotencyKey: String(raw.idempotencyKey || '').trim(),
    reversedAt: String(raw.reversedAt || '').trim(),
    reversedBy: String(raw.reversedBy || '').trim(),
    reversalFundLedgerId: String(raw.reversalFundLedgerId || '').trim(),
    legacyDerived: raw.legacyDerived === true,
    manualReviewRequired: raw.manualReviewRequired === true || !remittanceDate,
    note: String(raw.note || '').trim()
  };
}

function activeLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).filter((line) => !['cancelled', 'reversed'].includes(canonicalLineStatus(line.status)));
}

function normalizeLines(lines = [], options = {}) {
  const seen = new Set();
  return (Array.isArray(lines) ? lines : [])
    .map((line, index) => normalizeLine(line, { ...options, index }))
    .filter((line) => {
      if (line.amount <= 0 || seen.has(line.lineId)) return false;
      seen.add(line.lineId);
      return true;
    });
}

function linesFromLegacyAmounts(input = {}, options = {}) {
  const lines = [];
  const remittanceDate = dateUtil.toDateOnly(input.remittanceDate || options.defaultRemittanceDate || '', '');
  const status = options.defaultStatus || 'draft';
  const cashAmount = money(input.submittedCashAmount ?? input.actualCashAmount ?? input.cashAmount);
  const bankAmount = money(input.submittedBankAmount ?? input.actualBankAmount ?? input.bankAmount);
  if (cashAmount > 0) lines.push(normalizeLine({ method: 'cash', amount: cashAmount, remittanceDate, status }, {
    ...options, index: lines.length
  }));
  if (bankAmount > 0) lines.push(normalizeLine({
    method: 'bank', amount: bankAmount, remittanceDate, status,
    bankAccountCode: input.bankAccountCode,
    bankReference: input.bankReference
  }, { ...options, index: lines.length }));
  return lines;
}

function lineTotals(lines = []) {
  const totals = {
    plannedCashAmount: 0,
    plannedBankAmount: 0,
    confirmedCashAmount: 0,
    confirmedBankAmount: 0,
    pendingCashAmount: 0,
    pendingBankAmount: 0,
    confirmedLineCount: 0,
    pendingLineCount: 0,
    activeLineCount: 0
  };
  for (const line of activeLines(lines)) {
    const method = canonicalMethod(line.method || line.fundType);
    const amount = money(line.amount);
    totals.activeLineCount += 1;
    if (method === 'bank') totals.plannedBankAmount += amount;
    else totals.plannedCashAmount += amount;
    if (canonicalLineStatus(line.status) === 'confirmed') {
      totals.confirmedLineCount += 1;
      if (method === 'bank') totals.confirmedBankAmount += amount;
      else totals.confirmedCashAmount += amount;
    } else {
      totals.pendingLineCount += 1;
      if (method === 'bank') totals.pendingBankAmount += amount;
      else totals.pendingCashAmount += amount;
    }
  }
  return totals;
}

function deriveDocumentStatus(lines = [], expected = {}, options = {}) {
  const totals = lineTotals(lines);
  const expectedCash = money(expected.cashAmount ?? expected.reportCashAmount);
  const expectedBank = money(expected.bankAmount ?? expected.reportBankAmount);
  const remainingCash = Math.max(0, expectedCash - totals.confirmedCashAmount);
  const remainingBank = Math.max(0, expectedBank - totals.confirmedBankAmount);
  const hasRemaining = remainingCash > 0 || remainingBank > 0;
  const hasConfirmed = totals.confirmedLineCount > 0;
  const hasPending = totals.pendingLineCount > 0;
  let status = 'draft';
  if (options.cancelled === true) status = 'cancelled';
  else if (hasConfirmed && (hasPending || hasRemaining)) status = 'partially_confirmed';
  else if (hasConfirmed && !hasPending && !hasRemaining) status = 'confirmed';
  else if (hasPending) status = 'pending';
  return {
    status,
    fundPosted: status === 'confirmed',
    hasPostedLines: hasConfirmed,
    remainingCashAmount: remainingCash,
    remainingBankAmount: remainingBank,
    ...totals
  };
}

function validateLineForConfirmation(line = {}, context = {}) {
  const normalized = normalizeLine(line, context);
  const deliveryDate = dateUtil.toDateOnly(context.deliveryDate, '');
  const today = dateUtil.toDateOnly(context.today || dateUtil.todayVN(), '');
  if (normalized.invalidMethod) return { error: 'Phương thức nộp tiền không hợp lệ; chỉ chấp nhận tiền mặt hoặc ngân hàng', status: 422, code: 'INVALID_REMITTANCE_METHOD' };
  if (normalized.amount <= 0) return { error: 'Số tiền nộp phải lớn hơn 0', status: 400, code: 'INVALID_REMITTANCE_AMOUNT' };
  if (!normalized.remittanceDate) return { error: 'Cần chọn ngày nộp tiền thực tế trước khi xác nhận', status: 422, code: 'REMITTANCE_DATE_REQUIRED', manualReviewRequired: true };
  if (deliveryDate && normalized.remittanceDate < deliveryDate) {
    return { error: 'Ngày nộp tiền không được trước ngày giao hàng', status: 422, code: 'REMITTANCE_DATE_BEFORE_DELIVERY_DATE' };
  }
  if (today && normalized.remittanceDate > today) {
    return { error: 'Không được xác nhận khoản nộp có ngày nộp trong tương lai', status: 422, code: 'FUTURE_REMITTANCE_DATE' };
  }
  if (typeof context.isAccountingDateLocked === 'function' && context.isAccountingDateLocked(normalized.remittanceDate)) {
    return { error: 'Ngày nộp tiền thuộc kỳ kế toán đã khóa', status: 409, code: 'ACCOUNTING_PERIOD_LOCKED' };
  }
  return { line: normalized };
}

function buildLineIdempotencyKey(submission = {}, line = {}) {
  const submissionIdentity = sanitizeLineId(submission.id || submission.code);
  const lineIdentity = sanitizeLineId(line.lineId || line.id);
  if (!submissionIdentity || !lineIdentity) return '';
  return `FUND-DELIVERY-REMITTANCE:${submissionIdentity}:${lineIdentity}:${canonicalMethod(line.method || line.fundType).toUpperCase()}`;
}

function sameProtectedFields(left = {}, right = {}) {
  return IMMUTABLE_CONFIRMED_FIELDS.every((field) => {
    if (field === 'amount') return money(left[field]) === money(right[field]);
    return String(left[field] || '').trim() === String(right[field] || '').trim();
  });
}

function mergeEditableLines(currentLines = [], incomingLines = [], options = {}) {
  const current = normalizeLines(currentLines, options);
  const incoming = normalizeLines(incomingLines, options);
  const incomingById = new Map(incoming.map((line) => [line.lineId, line]));
  const confirmed = current.filter((line) => canonicalLineStatus(line.status) === 'confirmed');
  for (const line of confirmed) {
    const replacement = incomingById.get(line.lineId);
    if (replacement && !sameProtectedFields(line, replacement)) {
      return { error: 'Dòng nộp tiền đã ghi quỹ, không được sửa số tiền/ngày/phương thức', status: 409, code: 'POSTED_REMITTANCE_LINE_IMMUTABLE', lineId: line.lineId };
    }
    incomingById.set(line.lineId, line);
  }
  const merged = [];
  const orderedIds = [...current.map((line) => line.lineId), ...incoming.map((line) => line.lineId)];
  const seen = new Set();
  for (const lineId of orderedIds) {
    if (seen.has(lineId) || !incomingById.has(lineId)) continue;
    seen.add(lineId);
    merged.push(incomingById.get(lineId));
  }
  return { lines: merged };
}

function remittanceDateRange(lines = []) {
  const dates = activeLines(lines).map((line) => dateUtil.toDateOnly(line.remittanceDate, '')).filter(Boolean).sort();
  return { from: dates[0] || '', to: dates[dates.length - 1] || '', multiple: new Set(dates).size > 1 };
}

function applyLineSummary(submission = {}, lines = [], options = {}) {
  const normalizedLines = normalizeLines(lines, {
    submissionIdentity: submission.id || submission.code,
    makeId: options.makeId
  });
  const state = deriveDocumentStatus(normalizedLines, {
    reportCashAmount: submission.reportCashAmount,
    reportBankAmount: submission.reportBankAmount
  }, options);
  const range = remittanceDateRange(normalizedLines);
  return {
    ...submission,
    remittanceLines: normalizedLines,
    submittedCashAmount: state.plannedCashAmount,
    submittedBankAmount: state.plannedBankAmount,
    totalActualCashAmount: state.confirmedCashAmount,
    totalActualBankAmount: state.confirmedBankAmount,
    differenceCashAmount: state.plannedCashAmount - money(submission.reportCashAmount),
    differenceBankAmount: state.plannedBankAmount - money(submission.reportBankAmount),
    remainingCashAmount: state.remainingCashAmount,
    remainingBankAmount: state.remainingBankAmount,
    status: options.forceStatus || state.status,
    fundPosted: options.forceFundPosted ?? state.fundPosted,
    hasPostedLines: state.hasPostedLines,
    manualReviewRequired: normalizedLines.some((line) => line.manualReviewRequired),
    remittanceDateFrom: range.from,
    remittanceDateTo: range.to,
    remittanceDateMultiple: range.multiple
  };
}

module.exports = {
  LINE_STATUSES,
  canonicalMethod,
  invalidMethod,
  canonicalLineStatus,
  normalizeLine,
  normalizeLines,
  linesFromLegacyAmounts,
  lineTotals,
  deriveDocumentStatus,
  validateLineForConfirmation,
  buildLineIdempotencyKey,
  mergeEditableLines,
  remittanceDateRange,
  applyLineSummary,
  money
};
