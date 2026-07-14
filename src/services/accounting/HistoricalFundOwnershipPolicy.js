'use strict';

const ORDER_PAYMENT_ALLOCATION = 'ORDER_PAYMENT_ALLOCATION';
const DELIVERY_CASH_SUBMISSION = 'DELIVERY_CASH_SUBMISSION';

const CLASSIFICATION = Object.freeze({
  PROVEN_DUPLICATE: 'PROVEN_DUPLICATE',
  LEGACY_ONLY: 'LEGACY_ONLY',
  PARTIAL_OVERLAP: 'PARTIAL_OVERLAP',
  AMBIGUOUS: 'AMBIGUOUS',
  NOT_APPLICABLE: 'NOT_APPLICABLE'
});

const CONFIDENCE = Object.freeze({
  LEVEL_1_EXACT_IDENTITY: 'LEVEL_1_EXACT_IDENTITY',
  LEVEL_2_STRONG_BUSINESS_IDENTITY: 'LEVEL_2_STRONG_BUSINESS_IDENTITY',
  LEVEL_3_AGGREGATE_EXACT: 'LEVEL_3_AGGREGATE_EXACT',
  LEVEL_4_AMBIGUOUS: 'LEVEL_4_AMBIGUOUS',
  LEVEL_5_LEGACY_PRESERVED: 'LEVEL_5_LEGACY_PRESERVED'
});

function text(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return text(value).toUpperCase();
}

function lower(value = '') {
  return text(value).toLowerCase();
}

function money(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(Math.abs(parsed)) : 0;
}

function sourceTypeOf(row = {}) {
  return upper(row.sourceType || row.refType || row.referenceType || '');
}

function isOrderPaymentAllocation(row = {}) {
  return sourceTypeOf(row) === ORDER_PAYMENT_ALLOCATION;
}

function isDeliveryCashSubmission(row = {}) {
  return sourceTypeOf(row) === DELIVERY_CASH_SUBMISSION;
}

function directionOf(row = {}) {
  const explicit = lower(row.direction);
  if (['out', 'chi', 'expense', 'payment'].includes(explicit)) return 'out';
  if (['in', 'thu', 'receipt', 'income'].includes(explicit)) return 'in';
  return 'in';
}

function fundTypeOf(row = {}) {
  if (lower(row.fundType) === 'bank') return 'bank';
  const account = lower(row.account || row.bankAccountCode || row.fundCode);
  return account.includes('bank') || account.includes('ngan') || account.startsWith('112') ? 'bank' : 'cash';
}

function identityOf(row = {}) {
  return text(row.id || row.code || row._id || row.idempotencyKey);
}

function deliveryStaffKey(row = {}) {
  return upper(row.deliveryStaffCode || row.deliveryCode || row.nvghCode || row.deliveryStaffName || '');
}

function deliveryDateOf(row = {}) {
  return text(row.deliveryDate || '');
}

function ownershipGroupKey(row = {}) {
  const staff = deliveryStaffKey(row);
  const deliveryDate = deliveryDateOf(row);
  const fundType = fundTypeOf(row);
  if (!staff || !deliveryDate || !fundType) return '';
  return [staff, deliveryDate, fundType].join('|');
}

function directIdentityTokens(row = {}) {
  return [
    row.sourceId,
    row.sourceCode,
    row.sourceLineId,
    row.refId,
    row.refCode,
    row.referenceId,
    row.referenceCode,
    row.originalSourceId,
    row.idempotencyKey
  ].map(text).filter(Boolean);
}

function hasDirectIdentityOverlap(left = {}, right = {}) {
  const leftTokens = new Set(directIdentityTokens(left));
  if (!leftTokens.size) return false;
  return directIdentityTokens(right).some((token) => leftTokens.has(token));
}

function emptyTotals() {
  return { rows: 0, cashAmount: 0, bankAmount: 0, amount: 0 };
}

function addTotals(target, row = {}) {
  const amount = money(row.amount ?? row.debit ?? row.credit);
  target.rows += 1;
  target.amount += amount;
  if (fundTypeOf(row) === 'bank') target.bankAmount += amount;
  else target.cashAmount += amount;
}

function makeResult(row = {}, classification, confidence, evidence = {}) {
  return {
    ledgerId: identityOf(row),
    sourceType: sourceTypeOf(row),
    classification,
    confidence,
    balanceAffecting: classification !== CLASSIFICATION.PROVEN_DUPLICATE,
    originalAmount: money(row.amount ?? row.debit ?? row.credit),
    matchedAmount: money(evidence.matchedAmount),
    remainingLegacyAmount: Math.max(0, money(row.amount ?? row.debit ?? row.credit) - money(evidence.matchedAmount)),
    evidence
  };
}

function classifyOwnership(rows = []) {
  const resultByLedgerId = new Map();
  const groups = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isOrderPaymentAllocation(row) && !isDeliveryCashSubmission(row)) continue;
    if (directionOf(row) !== 'in') continue;
    const key = ownershipGroupKey(row);
    if (!key) {
      if (isOrderPaymentAllocation(row)) {
        resultByLedgerId.set(identityOf(row), makeResult(row, CLASSIFICATION.AMBIGUOUS, CONFIDENCE.LEVEL_4_AMBIGUOUS, {
          reason: 'missing_delivery_staff_or_delivery_date',
          groupKey: ''
        }));
      }
      continue;
    }
    if (!groups.has(key)) groups.set(key, { key, opa: [], dcs: [] });
    groups.get(key)[isOrderPaymentAllocation(row) ? 'opa' : 'dcs'].push(row);
  }

  for (const group of groups.values()) {
    const opaTotal = group.opa.reduce((sum, row) => sum + money(row.amount ?? row.debit ?? row.credit), 0);
    const dcsTotal = group.dcs.reduce((sum, row) => sum + money(row.amount ?? row.debit ?? row.credit), 0);
    const directIdentity = group.opa.some((opa) => group.dcs.some((dcs) => hasDirectIdentityOverlap(opa, dcs)));
    const evidenceBase = {
      groupKey: group.key,
      opaRows: group.opa.length,
      dcsRows: group.dcs.length,
      opaAmount: opaTotal,
      dcsAmount: dcsTotal,
      directIdentity
    };

    for (const opa of group.opa) {
      if (!group.dcs.length) {
        resultByLedgerId.set(identityOf(opa), makeResult(opa, CLASSIFICATION.LEGACY_ONLY, CONFIDENCE.LEVEL_5_LEGACY_PRESERVED, {
          ...evidenceBase,
          reason: 'no_delivery_cash_submission_candidate'
        }));
        continue;
      }

      if (directIdentity) {
        resultByLedgerId.set(identityOf(opa), makeResult(opa, CLASSIFICATION.PROVEN_DUPLICATE, CONFIDENCE.LEVEL_1_EXACT_IDENTITY, {
          ...evidenceBase,
          matchedAmount: money(opa.amount ?? opa.debit ?? opa.credit),
          reason: 'direct_identity_overlap'
        }));
        continue;
      }

      if (opaTotal === dcsTotal && opaTotal > 0) {
        const confidence = group.opa.length === 1 && group.dcs.length === 1
          ? CONFIDENCE.LEVEL_2_STRONG_BUSINESS_IDENTITY
          : CONFIDENCE.LEVEL_3_AGGREGATE_EXACT;
        resultByLedgerId.set(identityOf(opa), makeResult(opa, CLASSIFICATION.PROVEN_DUPLICATE, confidence, {
          ...evidenceBase,
          matchedAmount: money(opa.amount ?? opa.debit ?? opa.credit),
          reason: 'unique_delivery_staff_date_fund_aggregate_exact'
        }));
        continue;
      }

      if (Math.min(opaTotal, dcsTotal) > 0) {
        const share = opaTotal > 0 ? Math.min(money(opa.amount ?? opa.debit ?? opa.credit), Math.round(dcsTotal * (money(opa.amount ?? opa.debit ?? opa.credit) / opaTotal))) : 0;
        resultByLedgerId.set(identityOf(opa), makeResult(opa, CLASSIFICATION.PARTIAL_OVERLAP, CONFIDENCE.LEVEL_4_AMBIGUOUS, {
          ...evidenceBase,
          matchedAmount: share,
          reason: 'aggregate_amount_mismatch_manual_review_required'
        }));
        continue;
      }

      resultByLedgerId.set(identityOf(opa), makeResult(opa, CLASSIFICATION.AMBIGUOUS, CONFIDENCE.LEVEL_4_AMBIGUOUS, {
        ...evidenceBase,
        reason: 'insufficient_replacement_evidence'
      }));
    }
  }

  return resultByLedgerId;
}

function classifyRow(row = {}, context = {}) {
  if (!isOrderPaymentAllocation(row)) {
    return makeResult(row, CLASSIFICATION.NOT_APPLICABLE, CONFIDENCE.LEVEL_5_LEGACY_PRESERVED, { reason: 'not_order_payment_allocation' });
  }
  if (context && context.classification) {
    return makeResult(row, context.classification, context.confidence || CONFIDENCE.LEVEL_4_AMBIGUOUS, context.evidence || {});
  }
  const byId = context && context.ownershipByLedgerId;
  const id = identityOf(row);
  if (byId instanceof Map && byId.has(id)) return byId.get(id);
  return makeResult(row, CLASSIFICATION.LEGACY_ONLY, CONFIDENCE.LEVEL_5_LEGACY_PRESERVED, {
    reason: 'no_supersession_context_preserve_historical_movement'
  });
}

function isBalanceAffecting(row = {}, context = {}) {
  if (!isOrderPaymentAllocation(row)) return true;
  return classifyRow(row, context).classification !== CLASSIFICATION.PROVEN_DUPLICATE;
}

function summarizeClassifications(classifications = []) {
  const summary = {
    provenDuplicate: emptyTotals(),
    legacyOnly: emptyTotals(),
    partialOverlap: emptyTotals(),
    ambiguous: emptyTotals()
  };
  for (const item of classifications || []) {
    const row = {
      amount: item.originalAmount,
      fundType: item.evidence?.groupKey?.split('|')?.[2] || ''
    };
    if (item.classification === CLASSIFICATION.PROVEN_DUPLICATE) addTotals(summary.provenDuplicate, row);
    else if (item.classification === CLASSIFICATION.LEGACY_ONLY) addTotals(summary.legacyOnly, row);
    else if (item.classification === CLASSIFICATION.PARTIAL_OVERLAP) addTotals(summary.partialOverlap, row);
    else if (item.classification === CLASSIFICATION.AMBIGUOUS) addTotals(summary.ambiguous, row);
  }
  return summary;
}

module.exports = {
  ORDER_PAYMENT_ALLOCATION,
  DELIVERY_CASH_SUBMISSION,
  CLASSIFICATION,
  CONFIDENCE,
  text,
  sourceTypeOf,
  isOrderPaymentAllocation,
  isDeliveryCashSubmission,
  directionOf,
  fundTypeOf,
  ownershipGroupKey,
  identityOf,
  classifyOwnership,
  classifyRow,
  isBalanceAffecting,
  summarizeClassifications,
  _private: {
    money,
    deliveryStaffKey,
    deliveryDateOf,
    directIdentityTokens,
    hasDirectIdentityOverlap
  }
};
