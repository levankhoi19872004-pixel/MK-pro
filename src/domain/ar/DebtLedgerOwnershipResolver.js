'use strict';

const { normalizeAccountingAmount } = require('./arLedgerValidator');
const { SEMANTIC_ROLES, LEDGER_FAMILIES, registryEntryForLedger } = require('./debtLedgerSemanticRegistry');
const { buildDebtBusinessEventIdentity } = require('./debtBusinessEventIdentity');

const MISSING_BUSINESS_EVENT_IDENTITY = 'MISSING_BUSINESS_EVENT_IDENTITY';

const FAMILY_PRIORITY = Object.freeze({
  [LEDGER_FAMILIES.CANONICAL_DEBT]: 10,
  [LEDGER_FAMILIES.RETURN_DEBT]: 9,
  [LEDGER_FAMILIES.CORRECTION_DEBT]: 8,
  [LEDGER_FAMILIES.LEGACY_RECEIPT_AR]: 5,
  [LEDGER_FAMILIES.LEGACY_SALES_AR]: 4,
  [LEDGER_FAMILIES.REVERSAL_DEBT]: 2,
  [LEDGER_FAMILIES.CUSTOMER_SCOPE_DEBT]: 1,
  [LEDGER_FAMILIES.UNKNOWN]: 0
});

function text(value = '') {
  return String(value ?? '').trim();
}

function ledgerId(row = {}) {
  return text(row.id || row.code || row._id || row.ledgerId || row.idempotencyKey);
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function ledgerEffect(row = {}) {
  const amounts = normalizeAccountingAmount({
    debit: row.debit ?? 0,
    credit: row.credit ?? 0,
    amount: row.amount ?? Math.max(money(row.debit), money(row.credit)),
    direction: row.direction || (money(row.debit) > 0 ? 'debit' : 'credit'),
    amountField: row.amountField || (money(row.debit) > 0 ? 'debit' : 'credit')
  });
  return money(amounts.debit - amounts.credit);
}

function normalizeEntry(row = {}, index = 0) {
  const registry = registryEntryForLedger(row);
  const identity = buildDebtBusinessEventIdentity({ ...row, semanticRole: registry.semanticRole });
  return {
    ...row,
    _ownershipIndex: index,
    ledgerId: ledgerId(row),
    ledgerFamily: registry.ledgerFamily,
    semanticRole: registry.semanticRole,
    balanceImpacting: registry.balanceImpacting,
    businessEventIdentity: identity.businessEventIdentity,
    businessEventIdentityOk: identity.ok,
    businessEventIdentityCode: identity.code,
    businessEventSourceKind: identity.sourceKind,
    businessEventEvidenceFields: identity.evidenceFields,
    projectionPolicy: registry.projectionPolicy,
    ownershipEffect: ledgerEffect(row)
  };
}

function selectedSort(a, b) {
  const priority = (FAMILY_PRIORITY[b.ledgerFamily] || 0) - (FAMILY_PRIORITY[a.ledgerFamily] || 0);
  if (priority) return priority;
  return String(a.ledgerId || '').localeCompare(String(b.ledgerId || ''));
}

function classifyGroup(entries = []) {
  const sorted = [...entries].sort(selectedSort);
  const role = sorted[0]?.semanticRole || SEMANTIC_ROLES.UNSUPPORTED;
  if (sorted.length === 1) {
    return {
      selected: sorted,
      shadowed: [],
      duplicates: [],
      reasonCode: 'SINGLE_OWNER',
      classification: 'DISTINCT_BUSINESS_EVENTS',
      autoResolved: true
    };
  }

  if (role === SEMANTIC_ROLES.OPENING_OBLIGATION) {
    const canonical = sorted.filter((row) => row.ledgerFamily === LEDGER_FAMILIES.CANONICAL_DEBT);
    if (canonical.length === 1) {
      return {
        selected: canonical,
        shadowed: sorted.filter((row) => row !== canonical[0]),
        duplicates: [],
        reasonCode: 'CANONICAL_DEBT_OPEN_SHADOWS_LEGACY_AR_SALE',
        classification: 'PROJECTION_SHADOW',
        autoResolved: true
      };
    }
  }

  if (role === SEMANTIC_ROLES.PAYMENT_REDUCTION) {
    const canonical = sorted.filter((row) => row.ledgerFamily === LEDGER_FAMILIES.CANONICAL_DEBT);
    if (canonical.length === 1) {
      return {
        selected: canonical,
        shadowed: sorted.filter((row) => row !== canonical[0]),
        duplicates: [],
        reasonCode: 'CANONICAL_DEBT_PAYMENT_SHADOWS_LEGACY_AR_RECEIPT',
        classification: 'PROJECTION_SHADOW',
        autoResolved: true
      };
    }
  }

  if (role === SEMANTIC_ROLES.RETURN_REDUCTION || role === SEMANTIC_ROLES.CORRECTION_DELTA) {
    const dedicatedReturn = sorted.filter((row) => row.ledgerFamily === LEDGER_FAMILIES.RETURN_DEBT);
    if (dedicatedReturn.length === 1) {
      return {
        selected: dedicatedReturn,
        shadowed: sorted.filter((row) => row !== dedicatedReturn[0]),
        duplicates: [],
        reasonCode: 'DEDICATED_RETURN_SHADOWS_CORRECTION_RETURN_EFFECT',
        classification: 'PROJECTION_SHADOW',
        autoResolved: true
      };
    }
  }

  const selected = [sorted[0]];
  return {
    selected,
    shadowed: [],
    duplicates: sorted.slice(1),
    reasonCode: 'MULTIPLE_ACTIVE_LEDGER_SAME_BUSINESS_EVENT',
    classification: 'ACTUAL_DUPLICATE_FINANCIAL_EFFECT',
    autoResolved: false
  };
}

function buildDecision(groupKey, entries, outcome) {
  return {
    semanticRole: entries[0]?.semanticRole || SEMANTIC_ROLES.UNSUPPORTED,
    businessEventIdentity: entries[0]?.businessEventIdentity || '',
    selectedLedgerIds: outcome.selected.map((row) => row.ledgerId),
    shadowedLedgerIds: outcome.shadowed.map((row) => row.ledgerId),
    duplicateLedgerIds: outcome.duplicates.map((row) => row.ledgerId),
    selectedFamily: outcome.selected[0]?.ledgerFamily || '',
    reasonCode: outcome.reasonCode,
    classification: outcome.classification,
    evidenceFields: entries.map((row) => ({
      ledgerId: row.ledgerId,
      category: row.category,
      ledgerFamily: row.ledgerFamily,
      sourceType: row.sourceType || '',
      sourceId: row.sourceId || '',
      sourceVersion: row.sourceVersion || row.metadata?.sourceVersion || '',
      evidence: row.businessEventEvidenceFields
    })),
    confidencePolicy: outcome.autoResolved ? 'CONTRACT_MATCH' : 'MANUAL_REVIEW_REQUIRED',
    autoResolved: outcome.autoResolved,
    groupKey
  };
}

function ownershipGroupRole(entry = {}) {
  if (entry.semanticRole === SEMANTIC_ROLES.CORRECTION_DELTA && entry.businessEventSourceKind === 'return') {
    return SEMANTIC_ROLES.RETURN_REDUCTION;
  }
  return entry.semanticRole;
}

function resolveDebtLedgerOwnership(rows = []) {
  const selectedEntries = [];
  const shadowedEntries = [];
  const duplicateEntries = [];
  const unsupportedEntries = [];
  const unresolvedEntries = [];
  const duplicateGroups = [];
  const ownershipDecisions = [];
  const groups = new Map();

  (Array.isArray(rows) ? rows : []).map(normalizeEntry).forEach((entry) => {
    if (entry.semanticRole === SEMANTIC_ROLES.UNSUPPORTED || entry.balanceImpacting === false) {
      unsupportedEntries.push({ ...entry, ownershipClassification: 'UNSUPPORTED' });
      return;
    }
    if (!entry.businessEventIdentityOk) {
      unresolvedEntries.push({ ...entry, ownershipClassification: entry.businessEventIdentityCode || MISSING_BUSINESS_EVENT_IDENTITY });
      return;
    }
    const key = `${ownershipGroupRole(entry)}::${entry.businessEventIdentity}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });

  for (const [groupKey, entries] of groups.entries()) {
    const outcome = classifyGroup(entries);
    selectedEntries.push(...outcome.selected.map((row) => ({ ...row, ownershipClassification: 'SELECTED', ownershipReasonCode: outcome.reasonCode })));
    shadowedEntries.push(...outcome.shadowed.map((row) => ({ ...row, ownershipClassification: 'PROJECTION_SHADOW', ownershipReasonCode: outcome.reasonCode })));
    duplicateEntries.push(...outcome.duplicates.map((row) => ({ ...row, ownershipClassification: 'ACTUAL_DUPLICATE_FINANCIAL_EFFECT', ownershipReasonCode: outcome.reasonCode })));
    if (outcome.duplicates.length) {
      duplicateGroups.push({
        semanticRole: entries[0].semanticRole,
        businessEventIdentity: entries[0].businessEventIdentity,
        ledgerIds: entries.map((row) => row.ledgerId),
        duplicateLedgerIds: outcome.duplicates.map((row) => row.ledgerId),
        reasonCode: outcome.reasonCode
      });
    }
    ownershipDecisions.push(buildDecision(groupKey, entries, outcome));
  }

  selectedEntries.sort((a, b) => a._ownershipIndex - b._ownershipIndex);

  return {
    selectedEntries,
    shadowedEntries,
    duplicateGroups,
    duplicateEntries,
    unresolvedEntries,
    unsupportedEntries,
    ownershipDecisions,
    diagnostics: {
      inputCount: Array.isArray(rows) ? rows.length : 0,
      selectedCount: selectedEntries.length,
      shadowedCount: shadowedEntries.length,
      duplicateCount: duplicateEntries.length,
      unresolvedCount: unresolvedEntries.length,
      unsupportedCount: unsupportedEntries.length
    }
  };
}

module.exports = {
  resolveDebtLedgerOwnership,
  _private: { normalizeEntry, classifyGroup, ledgerEffect, selectedSort }
};
