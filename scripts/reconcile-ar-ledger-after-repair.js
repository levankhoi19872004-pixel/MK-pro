#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const { isActiveLedgerDoc } = require('../src/utils/arLedgerStatus.util');
const {
  clean,
  ledgerObjectId,
  ledgerEffect,
  sourceKey,
  customerKey,
  summarizeLedger,
  isArReturn
} = require('./audit-ar-ledger-integrity');

function valueOf(args, name) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] || '' : '';
}

function addGroup(map, key, delta) {
  const cleanKey = clean(key) || '(missing)';
  map.set(cleanKey, (map.get(cleanKey) || 0) + delta);
}

function isRepairTouched(row = {}, repairBatchId = '') {
  return clean(row.repairBatchId) === clean(repairBatchId)
    || clean(row.repairTag) === 'phase65-ar-ledger-hygiene'
    || clean(row.voidedBy) === 'ledger-repair-script';
}

function countDirectionConflicts(rows = []) {
  return rows.filter((row) => {
    const debit = Number(row.debit || 0);
    const credit = Number(row.credit || 0);
    const direction = clean(row.direction).toLowerCase();
    return (debit > 0 && direction === 'credit') || (credit > 0 && direction === 'debit') || (debit > 0 && credit > 0);
  }).length;
}

function countArReturnDebitPositive(rows = []) {
  return rows.filter((row) => isArReturn(row) && Number(row.debit || 0) > 0).length;
}

function activeArReturnIdempotencyCounts(rows = []) {
  const counts = new Map();
  for (const row of rows.filter((item) => isArReturn(item) && isActiveLedgerDoc(item, { extraInactiveStatuses: ['duplicate_cancelled', 'draft'] }))) {
    const key = clean(row.idempotencyKey) || '(missing)';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([idempotencyKey, activeCount]) => ({ idempotencyKey, activeCount }));
}

function duplicateCountFromIdempotencyCounts(counts = []) {
  return counts.filter((item) => item.activeCount > 1).length;
}

function reconcileArLedgerAfterRepair(ledgers = [], options = {}) {
  const repairBatchId = clean(options.repairBatchId);
  const rows = Array.isArray(ledgers) ? ledgers : [];
  const touched = rows.filter((row) => isRepairTouched(row, repairBatchId));
  const voided = touched.filter((row) => clean(row.status).toLowerCase() === 'voided' || clean(row.accountingStatus).toLowerCase() === 'voided');
  const normalized = touched.filter((row) => clean(row.status).toLowerCase() !== 'voided' && clean(row.accountingStatus).toLowerCase() !== 'voided');

  const byCanonical = voided.map((row) => ({
    voidedLedger: summarizeLedger(row),
    canonicalLedgerObjectId: clean(row.supersededBy),
    canonicalLedger: rows.find((candidate) => ledgerObjectId(candidate) === clean(row.supersededBy) || clean(candidate.id) === clean(row.supersededBy) || clean(candidate.code) === clean(row.supersededBy)) ? summarizeLedger(rows.find((candidate) => ledgerObjectId(candidate) === clean(row.supersededBy) || clean(candidate.id) === clean(row.supersededBy) || clean(candidate.code) === clean(row.supersededBy))) : null
  }));

  const beforeByReturnOrder = new Map();
  const afterByReturnOrder = new Map();
  const beforeByCustomer = new Map();
  const afterByCustomer = new Map();

  for (const row of rows) {
    const afterActive = isActiveLedgerDoc(row, { extraInactiveStatuses: ['duplicate_cancelled', 'draft'] });
    const beforeActive = afterActive || (voided.includes(row) && isRepairTouched(row, repairBatchId));
    if (beforeActive) {
      addGroup(beforeByReturnOrder, sourceKey(row), ledgerEffect(row));
      addGroup(beforeByCustomer, customerKey(row), ledgerEffect(row));
    }
    if (afterActive) {
      addGroup(afterByReturnOrder, sourceKey(row), ledgerEffect(row));
      addGroup(afterByCustomer, customerKey(row), ledgerEffect(row));
    }
  }

  const counts = activeArReturnIdempotencyCounts(rows);
  const activeRows = rows.filter((row) => isActiveLedgerDoc(row, { extraInactiveStatuses: ['duplicate_cancelled', 'draft'] }));

  return {
    mode: 'reconcile-after-repair',
    readOnly: true,
    generatedAt: new Date().toISOString(),
    repairBatchId,
    totals: {
      ledgersTouched: touched.length,
      ledgersVoided: voided.length,
      ledgersNormalized: normalized.length,
      activeArReturnIdempotencyKeys: counts.length,
      duplicateActiveIdempotencyRemaining: duplicateCountFromIdempotencyCounts(counts),
      directionConflictRemaining: countDirectionConflicts(activeRows),
      arReturnDebitPositiveRemaining: countArReturnDebitPositive(activeRows)
    },
    ledgersVoided: voided.map(summarizeLedger),
    ledgersNormalized: normalized.map(summarizeLedger),
    canonicalMappings: byCanonical,
    netImpactByReturnOrder: [...new Set([...beforeByReturnOrder.keys(), ...afterByReturnOrder.keys()])].sort().map((key) => ({
      returnOrderId: key,
      before: beforeByReturnOrder.get(key) || 0,
      after: afterByReturnOrder.get(key) || 0,
      delta: (afterByReturnOrder.get(key) || 0) - (beforeByReturnOrder.get(key) || 0)
    })),
    netImpactByCustomer: [...new Set([...beforeByCustomer.keys(), ...afterByCustomer.keys()])].sort().map((key) => ({
      customerCode: key,
      before: beforeByCustomer.get(key) || 0,
      after: afterByCustomer.get(key) || 0,
      delta: (afterByCustomer.get(key) || 0) - (beforeByCustomer.get(key) || 0)
    })),
    activeArReturnByIdempotencyKey: counts,
    duplicateRemaining: counts.filter((item) => item.activeCount > 1),
    directionConflictRemaining: activeRows.filter((row) => {
      const debit = Number(row.debit || 0);
      const credit = Number(row.credit || 0);
      const direction = clean(row.direction).toLowerCase();
      return (debit > 0 && direction === 'credit') || (credit > 0 && direction === 'debit') || (debit > 0 && credit > 0);
    }).map(summarizeLedger),
    arReturnDebitPositiveRemaining: activeRows.filter((row) => isArReturn(row) && Number(row.debit || 0) > 0).map(summarizeLedger)
  };
}

function csvEscape(value) {
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeReports(report, options = {}) {
  const reportsDir = path.resolve(options.reportsDir || path.join(__dirname, '..', 'reports'));
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = (options.stamp || new Date().toISOString()).replace(/[:.]/g, '-');
  const jsonPath = path.join(reportsDir, `ar-ledger-after-repair-reconcile-${stamp}.json`);
  const csvPath = path.join(reportsDir, `ar-ledger-after-repair-reconcile-${stamp}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  const lines = ['scope,key,before,after,delta'];
  for (const row of report.netImpactByReturnOrder) lines.push(['returnOrder', row.returnOrderId, row.before, row.after, row.delta].map(csvEscape).join(','));
  for (const row of report.netImpactByCustomer) lines.push(['customer', row.customerCode, row.before, row.after, row.delta].map(csvEscape).join(','));
  fs.writeFileSync(csvPath, `${lines.join('\n')}\n`);
  return { jsonPath, csvPath };
}

function printHuman(report, paths) {
  console.log('AR ledger reconcile after repair (read-only)');
  console.log('='.repeat(72));
  console.log(`Ledger đã void: ${report.totals.ledgersVoided}`);
  console.log(`Ledger đã normalize: ${report.totals.ledgersNormalized}`);
  console.log(`Duplicate active idempotency còn lại: ${report.totals.duplicateActiveIdempotencyRemaining}`);
  console.log(`Direction conflict còn lại: ${report.totals.directionConflictRemaining}`);
  console.log(`AR-RETURN debit positive còn lại: ${report.totals.arReturnDebitPositiveRemaining}`);
  console.log(`JSON: ${paths.jsonPath}`);
  console.log(`CSV : ${paths.csvPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const repairBatchId = clean(valueOf(args, '--repair-batch'));
  await require('../src/config/db')();
  const ArLedger = require('../src/models/ArLedger');
  const rows = await ArLedger.find({})
    .select('_id id code tenantId type ledgerType category status lifecycleStatus accountingStatus accountingConfirmed accountingBatchId reversed isDeleted deleted deletedAt voidedAt voidedBy voidReason supersededBy repairBatchId repairTag entryType sourceAction refType amount debit credit direction idempotencyKey source sourceType sourceModel sourceId sourceCode refId refCode returnOrderId returnOrderCode customerId customerCode customerName orderId orderCode salesOrderId salesOrderCode sourceOrderId sourceOrderCode createdAt updatedAt auditTrail')
    .lean();
  const report = reconcileArLedgerAfterRepair(rows, { repairBatchId });
  const paths = writeReports(report);
  if (json) console.log(JSON.stringify({ ...report, reports: paths }, null, 2));
  else printHuman(report, paths);
  await require('mongoose').connection.close();
  if (report.totals.duplicateActiveIdempotencyRemaining || report.totals.directionConflictRemaining || report.totals.arReturnDebitPositiveRemaining) process.exitCode = 2;
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[reconcile-ar-ledger-after-repair] failed:', err.message);
    try { await require('mongoose').connection.close(); } catch (_) {}
    process.exit(1);
  });
}

module.exports = {
  reconcileArLedgerAfterRepair,
  writeReports,
  activeArReturnIdempotencyCounts,
  countDirectionConflicts,
  countArReturnDebitPositive
};
