#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_AUDIT = path.join(ROOT, 'PHASE260D_R3_MIXED_LEDGER_AUDIT.json');
const JSON_OUT = path.join(ROOT, 'PHASE260D_R3_DUPLICATE_BUSINESS_EVENT_PLAN.json');
const CSV_OUT = path.join(ROOT, 'PHASE260D_R3_DUPLICATE_BUSINESS_EVENT_PLAN.csv');

function text(value = '') { return String(value ?? '').trim(); }
function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
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
function classifyPlanItem(row = {}) {
  if (row.classification === 'PROJECTION_SHADOW') {
    return {
      autoApplicable: false,
      mutationAllowed: false,
      proposedAction: 'PROJECTION_EXCLUDE_ONLY',
      skipReason: 'projection_shadow_only_no_mutation',
      risk: 'none_runtime_projection_only'
    };
  }
  if (row.classification !== 'ACTUAL_DUPLICATE_FINANCIAL_EFFECT') {
    return {
      autoApplicable: false,
      mutationAllowed: false,
      proposedAction: 'NO_ACTION_REQUIRED',
      skipReason: 'not_duplicate_financial_effect',
      risk: 'none'
    };
  }
  const hasEvidence = text(row.businessEventIdentity) && Array.isArray(row.actualDuplicateLedgerIds) && row.actualDuplicateLedgerIds.length > 0;
  return {
    autoApplicable: false,
    mutationAllowed: hasEvidence,
    proposedAction: hasEvidence ? 'CONTROLLED_REVERSAL_MANUAL_REVIEW_REQUIRED' : 'MANUAL_REVIEW',
    skipReason: hasEvidence ? 'manual_review_required_before_apply' : 'business_evidence_incomplete',
    risk: hasEvidence ? 'high_controlled_append_only_reversal' : 'critical_identity_incomplete'
  };
}
function buildPlan(audit = {}) {
  const auditNotExecuted = audit.status === 'PRODUCTION_AUDIT_NOT_EXECUTED' || audit.status === 'AUDIT_NOT_EXECUTED';
  const items = (audit.rows || []).map((row, index) => {
    const decision = classifyPlanItem(row);
    const duplicateLedgerIds = Array.isArray(row.actualDuplicateLedgerIds) ? row.actualDuplicateLedgerIds.map(text).filter(Boolean) : [];
    return {
      repairItemId: `PHASE260D-R3-${String(index + 1).padStart(4, '0')}`,
      orderCode: text(row.orderCode),
      customerCode: text(row.customerCode),
      semanticRole: text(row.semanticRole),
      businessEventIdentity: text(row.businessEventIdentity),
      classification: text(row.classification),
      reasonCode: text(row.reasonCode),
      projectionSelectedLedgerIds: Array.isArray(row.projectionSelectedLedgerIds) ? row.projectionSelectedLedgerIds : [],
      projectionShadowedLedgerIds: Array.isArray(row.projectionShadowedLedgerIds) ? row.projectionShadowedLedgerIds : [],
      actualDuplicateLedgerIds: duplicateLedgerIds,
      currentNetEffect: money(row.currentNetEffect),
      expectedNetEffect: money(row.expectedNetEffect),
      duplicateNetEffect: money(row.currentNetEffect) - money(row.expectedNetEffect),
      reverseDuplicateLedgers: duplicateLedgerIds.map((ledgerId) => ({ ledgerId, action: 'APPEND_REVERSAL_ONLY' })),
      ...decision,
      apply: false
    };
  });
  const summary = items.reduce((acc, item) => {
    acc.total += 1;
    acc.projectionShadowOnly += item.classification === 'PROJECTION_SHADOW' ? 1 : 0;
    acc.actualDuplicateFinancialEffect += item.classification === 'ACTUAL_DUPLICATE_FINANCIAL_EFFECT' ? 1 : 0;
    acc.mutationAllowed += item.mutationAllowed ? 1 : 0;
    return acc;
  }, { total: 0, projectionShadowOnly: 0, actualDuplicateFinancialEffect: 0, mutationAllowed: 0 });
  return {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260D-R3',
    mode: 'controlled_duplicate_business_event_plan',
    status: auditNotExecuted ? 'PRODUCTION_AUDIT_NOT_EXECUTED' : 'PLAN_READY',
    apply: false,
    sourceAuditStatus: audit.status || '',
    sourceAuditGeneratedAt: audit.generatedAt || '',
    summary,
    items
  };
}
function writeCsv(plan = {}, file = CSV_OUT) {
  const headers = ['repairItemId', 'orderCode', 'customerCode', 'semanticRole', 'businessEventIdentity', 'classification', 'reasonCode', 'projectionShadowedLedgerIds', 'actualDuplicateLedgerIds', 'currentNetEffect', 'expectedNetEffect', 'duplicateNetEffect', 'mutationAllowed', 'autoApplicable', 'proposedAction', 'skipReason', 'risk'];
  const lines = [headers.join(',')];
  for (const item of plan.items || []) lines.push(headers.map((key) => csv(item[key])).join(','));
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}
function main() {
  const input = inputPath();
  const audit = fs.existsSync(input) ? JSON.parse(fs.readFileSync(input, 'utf8')) : { status: 'PRODUCTION_AUDIT_NOT_EXECUTED', rows: [], missingInput: input };
  const plan = buildPlan(audit);
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(plan, null, 2)}\n`);
  writeCsv(plan);
  console.log(JSON.stringify({ status: plan.status, total: plan.summary.total, mutationAllowed: plan.summary.mutationAllowed, json: path.basename(JSON_OUT), csv: path.basename(CSV_OUT) }, null, 2));
}
if (require.main === module) main();

module.exports = { buildPlan, classifyPlanItem, writeCsv };
