#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_AUDIT = path.join(ROOT, 'PHASE260E_LEGACY_ADJUSTMENT_AUDIT.json');
const OUT = path.join(ROOT, 'PHASE260E_CANONICAL_BACKFILL_PLAN.json');

function text(value = '') { return String(value ?? '').trim(); }
function argValue(argv = process.argv.slice(2), name = '') {
  const inline = argv.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] || '' : '';
}
function inputPath(argv = process.argv.slice(2)) {
  return path.resolve(ROOT, argValue(argv, '--input') || DEFAULT_AUDIT);
}
function planAction(row = {}) {
  if (row.classification === 'CANONICAL_SOURCE_ALREADY_EXISTS' || row.classification === 'DUPLICATE_OPENING_ADJUSTMENT') {
    return { proposedAction: 'EXCLUDE_FROM_BALANCE', autoApplicable: false, skippedReason: 'canonical_source_exists_or_duplicate_opening' };
  }
  if (row.classification === 'PAYMENT_RECORDED_AS_ADJUSTMENT') {
    return { proposedAction: 'CANONICAL_PAYMENT_BACKFILL_REQUIRED', autoApplicable: false, skippedReason: 'requires_confirmed_receipt_or_allocation_evidence' };
  }
  if (row.classification === 'RETURN_RECORDED_AS_ADJUSTMENT') {
    return { proposedAction: 'CANONICAL_RETURN_BACKFILL_REQUIRED', autoApplicable: false, skippedReason: 'requires_confirmed_return_source_evidence' };
  }
  if (row.classification === 'NO_ACTION_REQUIRED' || row.classification === 'VALID_MANUAL_ADJUSTMENT') {
    return { proposedAction: 'NO_ACTION', autoApplicable: false, skippedReason: 'legacy_audit_only' };
  }
  return { proposedAction: 'MANUAL_REVIEW', autoApplicable: false, skippedReason: 'source_identity_ambiguous_or_incomplete' };
}
function buildPlan(audit = {}) {
  const items = (audit.rows || []).map((row, index) => ({
    itemId: `PHASE260E-${String(index + 1).padStart(4, '0')}`,
    orderCode: text(row.orderCode),
    customerCode: text(row.customerCode),
    ledgerId: text(row.ledgerId),
    classification: text(row.classification),
    sourceType: text(row.sourceType),
    sourceId: text(row.sourceId),
    debit: row.debit || 0,
    credit: row.credit || 0,
    netEffect: row.netEffect || 0,
    canonicalLedgerEvidence: row.canonicalLedgerEvidence || [],
    mutation: false,
    ...planAction(row)
  }));
  return {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260E',
    mode: 'dry_run_plan_no_apply',
    status: audit.status === 'PRODUCTION_AUDIT_NOT_EXECUTED' ? 'PRODUCTION_AUDIT_NOT_EXECUTED' : 'PLAN_READY',
    sourceAuditStatus: audit.status || '',
    scannedCount: audit.scannedCount || 0,
    changedCount: 0,
    skippedReason: audit.status === 'PRODUCTION_AUDIT_NOT_EXECUTED' ? 'production_audit_not_executed' : '',
    warnings: audit.warnings || [],
    items
  };
}
function main() {
  const input = inputPath();
  const audit = fs.existsSync(input) ? JSON.parse(fs.readFileSync(input, 'utf8')) : { status: 'PRODUCTION_AUDIT_NOT_EXECUTED', rows: [], warnings: [`Missing audit input ${input}`] };
  const plan = buildPlan(audit);
  fs.writeFileSync(OUT, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({ status: plan.status, scannedCount: plan.scannedCount, items: plan.items.length, json: path.basename(OUT) }, null, 2));
}
if (require.main === module) main();

module.exports = { buildPlan, planAction };
