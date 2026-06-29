'use strict';

const {
  normalizeArCategory,
  isBusinessArReturnReversal
} = require('./arLedgerCategoryEffect.util');

const INACTIVE_LEDGER_STATUSES = Object.freeze([
  'void',
  'voided',
  'cancelled',
  'canceled',
  'deleted',
  'removed',
  'reversed',
  'superseded',
  'duplicate_cancelled',
  'draft'
]);

const CONFIRMED_ACCOUNTING_STATUSES = Object.freeze([
  'confirmed',
  'locked',
  'posted',
  'accounting_confirmed'
]);

const REVERSAL_TYPES = Object.freeze([
  'ar_reversal',
  'reversal',
  'ar_void',
  'ar_sale_reversal'
]);

function normalizeLedgerStatus(value = '') {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeUpper(value = '') {
  return String(value ?? '').trim().toUpperCase();
}

function inactiveSet(extraStatuses = []) {
  return new Set([
    ...INACTIVE_LEDGER_STATUSES,
    ...(Array.isArray(extraStatuses) ? extraStatuses : [extraStatuses])
      .map(normalizeLedgerStatus)
      .filter(Boolean)
  ]);
}

function isInactiveLedgerStatus(status, options = {}) {
  const normalized = normalizeLedgerStatus(status);
  if (!normalized) return false;
  return inactiveSet(options.extraInactiveStatuses).has(normalized);
}

function isReversalLedgerDoc(doc = {}) {
  if (isBusinessArReturnReversal(doc)) return false;

  const refType = normalizeUpper(doc.refType);
  const sourceAction = normalizeLedgerStatus(doc.sourceAction);
  const entryType = normalizeLedgerStatus(doc.entryType);
  const type = normalizeLedgerStatus(doc.type);

  if (refType === 'AR_LEDGER_REVERSAL') return true;
  if (sourceAction === 'reverse') return true;
  if (entryType === 'reversal') return true;
  if (REVERSAL_TYPES.includes(type)) return true;
  return false;
}

function isActiveLedgerDoc(doc = {}, options = {}) {
  if (!doc || typeof doc !== 'object') return false;
  if (doc.reversed === true || doc.isDeleted === true || doc.deleted === true) return false;
  if (doc.deletedAt !== undefined && doc.deletedAt !== null && String(doc.deletedAt).trim() !== '') return false;
  if (doc.voidedAt || doc.removedAt || doc.cancelledAt || doc.supersededAt) return false;

  const statusFields = [doc.status, doc.lifecycleStatus, doc.accountingStatus];
  if (statusFields.some((status) => isInactiveLedgerStatus(status, options))) return false;
  if (isReversalLedgerDoc(doc)) return false;
  return true;
}

function isConfirmedArLedger(doc = {}, options = {}) {
  if (!isActiveLedgerDoc(doc, options)) return false;
  const account = normalizeUpper(doc.account || 'AR');
  if (account && account !== 'AR') return false;
  if (doc.accountingConfirmed === false) return false;

  const accountingStatus = normalizeLedgerStatus(doc.accountingStatus);
  if (accountingStatus && !CONFIRMED_ACCOUNTING_STATUSES.includes(accountingStatus)) return false;
  return true;
}

function buildInactiveStatusCondition(options = {}) {
  return { $nin: [...inactiveSet(options.extraInactiveStatuses)] };
}

function buildNotDeletedCondition() {
  return { $in: [null, ''] };
}

function buildActiveLedgerMongoFilter(extra = {}, options = {}) {
  const activeFilter = {
    status: buildInactiveStatusCondition(options),
    lifecycleStatus: buildInactiveStatusCondition(options),
    accountingStatus: buildInactiveStatusCondition(options),
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    deletedAt: buildNotDeletedCondition(),
    refType: { $ne: 'AR_LEDGER_REVERSAL' },
    entryType: { $ne: 'reversal' },
    sourceAction: { $ne: 'reverse' },
    type: { $nin: [...REVERSAL_TYPES] }
  };

  if (!extra || !Object.keys(extra).length) return activeFilter;
  return { ...extra, ...activeFilter };
}

function buildActiveArLedgerFilter(extra = {}, options = {}) {
  return {
    ...buildActiveLedgerMongoFilter(extra, options),
    account: options.accountRegex === false ? 'AR' : /^AR$/i,
    accountingConfirmed: true
  };
}

function buildConfirmedArLedgerFilter(extra = {}, options = {}) {
  return {
    ...buildActiveArLedgerFilter(extra, options),
    accountingStatus: { $in: [...CONFIRMED_ACCOUNTING_STATUSES] }
  };
}

function combinedIdentityText(doc = {}) {
  return [
    doc.category,
    doc.ledgerType,
    doc.type,
    doc.sourceType,
    doc.sourceCategory,
    doc.code,
    doc.id,
    doc.idempotencyKey,
    doc.refType
  ].map((value) => String(value || '')).join(' ').toUpperCase();
}

function isArSaleLedger(doc = {}) {
  return ['AR-SALE', 'AR-EXTERNAL-DEBT'].includes(normalizeArCategory(doc));
}

function isArReturnLedger(doc = {}) {
  return normalizeArCategory(doc) === 'AR-RETURN';
}

function isArReceiptLedger(doc = {}) {
  return normalizeArCategory(doc) === 'AR-RECEIPT';
}

function isArBonusOrAllowanceLedger(doc = {}) {
  return normalizeArCategory(doc) === 'AR-BONUS-ALLOWANCE';
}

module.exports = {
  INACTIVE_LEDGER_STATUSES,
  CONFIRMED_ACCOUNTING_STATUSES,
  REVERSAL_TYPES,
  normalizeLedgerStatus,
  isInactiveLedgerStatus,
  isReversalLedgerDoc,
  isActiveLedgerDoc,
  isConfirmedArLedger,
  buildInactiveStatusCondition,
  buildActiveLedgerMongoFilter,
  buildActiveArLedgerFilter,
  buildConfirmedArLedgerFilter,
  normalizeArCategory,
  isArSaleLedger,
  isArReturnLedger,
  isArReceiptLedger,
  isArBonusOrAllowanceLedger
};
