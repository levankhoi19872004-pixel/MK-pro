'use strict';

const INACTIVE_LEDGER_STATUSES = Object.freeze([
  'void',
  'voided',
  'cancelled',
  'canceled',
  'deleted',
  'removed',
  'reversed',
  'superseded'
]);

function normalizeLedgerStatus(value = '') {
  return String(value ?? '').trim().toLowerCase();
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

function isActiveLedgerDoc(doc = {}, options = {}) {
  if (!doc || typeof doc !== 'object') return false;
  if (doc.reversed === true || doc.isDeleted === true || doc.deleted === true) return false;
  if (doc.deletedAt !== undefined && doc.deletedAt !== null && String(doc.deletedAt).trim() !== '') return false;
  if (doc.voidedAt || doc.removedAt || doc.cancelledAt || doc.supersededAt) return false;

  const statusFields = [doc.status, doc.lifecycleStatus, doc.accountingStatus];
  if (statusFields.some((status) => isInactiveLedgerStatus(status, options))) return false;

  const refType = normalizeLedgerStatus(doc.refType).toUpperCase();
  const sourceAction = normalizeLedgerStatus(doc.sourceAction);
  const entryType = normalizeLedgerStatus(doc.entryType);
  const type = normalizeLedgerStatus(doc.type);
  const ledgerType = normalizeLedgerStatus(doc.ledgerType).toUpperCase();
  const category = normalizeLedgerStatus(doc.category).toUpperCase();

  if (refType === 'AR_LEDGER_REVERSAL') return false;
  if (sourceAction === 'reverse') return false;
  if (entryType === 'reversal') return false;
  if (['ar_reversal', 'reversal', 'ar_void'].includes(type)) return false;
  if (/REVERSAL$/.test(ledgerType) || /REVERSAL$/.test(category)) return false;

  return true;
}

function buildInactiveStatusCondition(options = {}) {
  return { $nin: [...inactiveSet(options.extraInactiveStatuses)] };
}

function buildActiveLedgerMongoFilter(extra = {}, options = {}) {
  const activeFilter = {
    status: buildInactiveStatusCondition(options),
    lifecycleStatus: buildInactiveStatusCondition(options),
    accountingStatus: buildInactiveStatusCondition(options),
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    deletedAt: { $in: [null, ''] },
    refType: { $ne: 'AR_LEDGER_REVERSAL' },
    entryType: { $ne: 'reversal' },
    sourceAction: { $ne: 'reverse' },
    type: { $nin: ['ar_reversal', 'reversal', 'ar_void'] }
  };

  if (!extra || !Object.keys(extra).length) return activeFilter;
  return { $and: [extra, activeFilter] };
}

module.exports = {
  INACTIVE_LEDGER_STATUSES,
  normalizeLedgerStatus,
  isInactiveLedgerStatus,
  isActiveLedgerDoc,
  buildActiveLedgerMongoFilter
};
