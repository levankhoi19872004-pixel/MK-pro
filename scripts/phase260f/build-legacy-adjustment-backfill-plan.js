#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_AUDIT = path.join(ROOT, 'PHASE260F_R1_LEGACY_ADJUSTMENT_AUDIT.json');
const JSON_OUT = path.join(ROOT, 'PHASE260F_R1_BACKFILL_PLAN.json');
const CSV_OUT = path.join(ROOT, 'PHASE260F_R1_BACKFILL_PLAN.csv');

function text(value = '') { return String(value ?? '').trim(); }
function csv(value) {
  const raw = Array.isArray(value) ? value.join('|') : text(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}
function argValue(argv = process.argv.slice(2), name = '') {
  const inline = argv.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] || '' : '';
}
function inputPath(argv = process.argv.slice(2)) {
  return path.resolve(ROOT, argValue(argv, '--input') || DEFAULT_AUDIT);
}
function sha256(value = '') {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function canonicalFamily(row = {}) {
  if (row.classification === 'PAYMENT_RECORDED_AS_ADJUSTMENT') return { family: 'PAYMENT', category: 'AR-DEBT-PAYMENT', applyStage: 'R2A' };
  if (row.classification === 'RETURN_RECORDED_AS_ADJUSTMENT') return { family: 'RETURN', category: 'AR-RETURN', applyStage: 'R2B' };
  if (row.classification === 'REWARD_RECORDED_AS_ADJUSTMENT') return { family: 'REWARD_ALLOWANCE', category: 'AR-REWARD-ALLOWANCE', applyStage: 'R2C' };
  if (['MANUAL_VALID_DEBIT_ADJUSTMENT', 'MANUAL_VALID_CREDIT_ADJUSTMENT'].includes(row.classification)) return { family: 'MANUAL', category: 'AR-ADJUSTMENT', applyStage: 'R2C' };
  return { family: '', category: '', applyStage: '' };
}
function planAction(row = {}) {
  if (row.canonicalReplacementExists || ['ALREADY_BACKFILLED', 'CANONICAL_SOURCE_ALREADY_EXISTS'].includes(row.classification)) {
    return { proposedAction: 'NO_OP_EXISTING_CANONICAL_SOURCE', autoApplicable: false, skippedReason: 'canonical_replacement_or_source_already_exists' };
  }
  if (['PAYMENT_RECORDED_AS_ADJUSTMENT', 'RETURN_RECORDED_AS_ADJUSTMENT', 'REWARD_RECORDED_AS_ADJUSTMENT'].includes(row.classification)) {
    return { proposedAction: 'DRY_RUN_BACKFILL_CANDIDATE', autoApplicable: false, skippedReason: 'requires_confirmed_source_re_read_and_approval' };
  }
  if (['SOURCE_IDENTITY_AMBIGUOUS', 'BUSINESS_EVIDENCE_INCOMPLETE', 'CANONICAL_SOURCE_MISSING'].includes(row.classification)) {
    return { proposedAction: 'KEEP_LEGACY_FALLBACK_OR_UNRESOLVED', autoApplicable: false, skippedReason: 'source_identity_not_sufficient_for_backfill' };
  }
  return { proposedAction: 'MANUAL_REVIEW', autoApplicable: false, skippedReason: 'manual_or_duplicate_classification_requires_accounting_review' };
}
function buildPlan(audit = {}) {
  const sourceAuditStatus = audit.status || 'PRODUCTION_AUDIT_NOT_EXECUTED';
  const items = (audit.rows || []).map((row, index) => {
    const family = canonicalFamily(row);
    const action = planAction(row);
    const evidenceHash = sha256(JSON.stringify({
      adjustmentLedgerId: row.adjustmentLedgerId,
      classification: row.classification,
      sourceEvidenceFields: row.sourceEvidenceFields,
      existingCanonicalLedgerIds: row.existingCanonicalLedgerIds
    }));
    return {
      itemId: `PHASE260F-R1-${String(index + 1).padStart(4, '0')}`,
      adjustmentLedgerId: text(row.adjustmentLedgerId),
      orderId: text(row.orderId),
      orderCode: text(row.orderCode),
      customerCode: text(row.customerCode),
      classification: text(row.classification),
      reasonCode: text(row.reasonCode),
      sourceType: text(row.sourceType),
      sourceId: text(row.sourceId),
      debit: row.debit || 0,
      credit: row.credit || 0,
      netEffect: row.netEffect || 0,
      canonicalFamily: family.family,
      canonicalCategory: family.category,
      applyStage: family.applyStage,
      sourceEvidenceFields: row.sourceEvidenceFields || [],
      existingCanonicalLedgerIds: row.existingCanonicalLedgerIds || [],
      canonicalReplacementExists: row.canonicalReplacementExists === true,
      mutation: false,
      evidenceHash,
      ...action
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260F-R1',
    mode: 'dry_run_plan_no_apply',
    status: sourceAuditStatus === 'PRODUCTION_AUDIT_NOT_EXECUTED' ? 'PRODUCTION_AUDIT_NOT_EXECUTED' : 'PLAN_READY',
    sourceAuditStatus,
    scannedCount: audit.scannedCount || 0,
    classifiedCount: audit.classifiedCount || items.length,
    backfilledCount: 0,
    alreadyCanonicalCount: items.filter((row) => row.canonicalReplacementExists).length,
    unresolvedCount: items.filter((row) => ['SOURCE_IDENTITY_AMBIGUOUS', 'BUSINESS_EVIDENCE_INCOMPLETE', 'CANONICAL_SOURCE_MISSING'].includes(row.classification)).length,
    failedCount: 0,
    skippedReason: sourceAuditStatus === 'PRODUCTION_AUDIT_NOT_EXECUTED' ? 'production_audit_not_executed' : '',
    warnings: audit.warnings || [],
    items
  };
}
function writeCsv(plan = {}, file = CSV_OUT) {
  const headers = ['itemId', 'orderCode', 'customerCode', 'adjustmentLedgerId', 'debit', 'credit', 'classification', 'canonicalFamily', 'canonicalCategory', 'proposedAction', 'autoApplicable', 'skippedReason'];
  const lines = [headers.join(',')];
  for (const row of plan.items || []) lines.push(headers.map((key) => csv(row[key])).join(','));
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}
function main(argv = process.argv.slice(2)) {
  const input = inputPath(argv);
  const audit = fs.existsSync(input)
    ? JSON.parse(fs.readFileSync(input, 'utf8'))
    : { status: 'PRODUCTION_AUDIT_NOT_EXECUTED', rows: [], warnings: [`Missing audit input ${input}`] };
  const plan = buildPlan(audit);
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(plan, null, 2)}\n`);
  writeCsv(plan);
  console.log(JSON.stringify({ status: plan.status, scannedCount: plan.scannedCount, items: plan.items.length, json: path.basename(JSON_OUT), csv: path.basename(CSV_OUT) }, null, 2));
}
if (require.main === module) main();

module.exports = { buildPlan, planAction, canonicalFamily, writeCsv };
