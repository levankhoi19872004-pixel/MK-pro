#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_AUDIT = path.join(ROOT, 'PHASE260C_R2_DEBT_CORRECTION_AUDIT.json');
const JSON_OUT = path.join(ROOT, 'PHASE260C_R2_REPAIR_PLAN.json');
const CSV_OUT = path.join(ROOT, 'PHASE260C_R2_REPAIR_PLAN.csv');

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
  if (row.classification === 'CORRECT_DELTA' || row.classification === 'NO_ACTION_REQUIRED') {
    return { autoApplicable: false, risk: 'none', proposedAction: 'NO_ACTION_REQUIRED', skipReason: 'correct_delta' };
  }
  if (row.alreadyReversed) return { autoApplicable: false, risk: 'low', proposedAction: 'NO_ACTION_REQUIRED', skipReason: 'already_reversed' };
  if (row.alreadyRepaired) return { autoApplicable: false, risk: 'low', proposedAction: 'NO_ACTION_REQUIRED', skipReason: 'already_repaired' };
  if (!text(row.correctionId) || !text(row.ledgerId)) {
    return { autoApplicable: false, risk: 'high', proposedAction: 'MANUAL_REVIEW', skipReason: 'business_evidence_incomplete' };
  }
  const auto = row.autoApplicable === true && money(row.actualDebtEffect) !== money(row.expectedDebtDelta);
  return {
    autoApplicable: auto,
    risk: auto ? 'medium_controlled_reversal' : 'high_manual_review',
    proposedAction: auto ? 'REVERSE_WRONG_ADJUSTMENT_AND_POST_CORRECT_DELTA' : 'MANUAL_REVIEW',
    skipReason: auto ? '' : 'source_identity_ambiguous_or_no_difference'
  };
}
function buildPlan(audit = {}) {
  const auditNotExecuted = audit.status === 'AUDIT_NOT_EXECUTED';
  const items = (audit.rows || []).map((row, index) => {
    const decision = classifyPlanItem(row);
    const reversalAmount = Math.max(money(row.currentDebit), money(row.currentCredit), Math.abs(money(row.actualDebtEffect)));
    const correctAmount = Math.abs(money(row.expectedDebtDelta));
    return {
      repairItemId: `PHASE260C-R2-${String(index + 1).padStart(4, '0')}`,
      orderId: text(row.orderId),
      orderCode: text(row.orderCode),
      customerCode: text(row.customerCode),
      correctionId: text(row.correctionId),
      correctionVersion: text(row.correctionVersion),
      ledgerId: text(row.ledgerId),
      ledgerCode: text(row.ledgerCode),
      classification: text(row.classification),
      reasonCode: text(row.reasonCode),
      currentDebit: money(row.currentDebit),
      currentCredit: money(row.currentCredit),
      actualDebtEffect: money(row.actualDebtEffect),
      expectedDebtDelta: money(row.expectedDebtDelta),
      difference: money(row.difference),
      returnDelta: money(row.returnDelta),
      cashDelta: money(row.cashDelta),
      bankDelta: money(row.bankDelta),
      rewardDelta: money(row.rewardDelta),
      receivableDelta: money(row.receivableDelta),
      reverseOriginal: {
        debit: money(row.currentCredit),
        credit: money(row.currentDebit),
        amount: reversalAmount
      },
      correctDeltaEntry: {
        debit: money(row.expectedDebtDelta) > 0 ? correctAmount : 0,
        credit: money(row.expectedDebtDelta) < 0 ? correctAmount : 0,
        amount: correctAmount
      },
      ...decision,
      apply: false
    };
  });
  const summary = items.reduce((acc, item) => {
    acc.total += 1;
    acc.autoApplicable += item.autoApplicable ? 1 : 0;
    acc.byClassification[item.classification] = (acc.byClassification[item.classification] || 0) + 1;
    return acc;
  }, { total: 0, autoApplicable: 0, byClassification: {} });
  return {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260C-R2',
    mode: 'controlled_repair_plan',
    status: auditNotExecuted ? 'AUDIT_NOT_EXECUTED' : 'PLAN_READY',
    apply: false,
    sourceAuditStatus: audit.status || '',
    sourceAuditGeneratedAt: audit.generatedAt || '',
    summary,
    items
  };
}
function writeCsv(plan = {}, file = CSV_OUT) {
  const headers = ['repairItemId', 'orderCode', 'customerCode', 'correctionId', 'ledgerId', 'classification', 'reasonCode', 'currentDebit', 'currentCredit', 'actualDebtEffect', 'expectedDebtDelta', 'difference', 'reverseOriginal.credit', 'correctDeltaEntry.credit', 'autoApplicable', 'risk', 'proposedAction', 'skipReason'];
  const value = (row, key) => key.split('.').reduce((obj, part) => (obj ? obj[part] : undefined), row);
  const lines = [headers.join(',')];
  for (const item of plan.items || []) lines.push(headers.map((key) => csv(value(item, key))).join(','));
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}
function main() {
  const input = inputPath();
  const audit = fs.existsSync(input) ? JSON.parse(fs.readFileSync(input, 'utf8')) : { status: 'AUDIT_NOT_EXECUTED', rows: [], missingInput: input };
  const plan = buildPlan(audit);
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(plan, null, 2)}\n`);
  writeCsv(plan);
  console.log(JSON.stringify({ status: plan.status, total: plan.summary.total, autoApplicable: plan.summary.autoApplicable, json: path.basename(JSON_OUT), csv: path.basename(CSV_OUT) }, null, 2));
}
if (require.main === module) main();

module.exports = { buildPlan, classifyPlanItem, writeCsv };
