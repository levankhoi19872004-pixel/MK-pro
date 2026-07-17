#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function clean(value = '') { return String(value ?? '').trim(); }
function lower(value = '') { return clean(value).toLowerCase(); }
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function parsePhase(argv = process.argv.slice(2)) {
  const flag = argv.find((item) => /^--phase=/.test(item));
  return clean(flag ? flag.split('=')[1] : process.env.PHASE260B_REPAIR_PHASE) || 'Phase260B';
}
function artifactPrefix(phase = 'Phase260B') {
  return lower(phase) === 'phase260b-r1' ? 'PHASE260B_R1' : 'PHASE260B';
}
function parseInput(argv = process.argv.slice(2)) {
  const flag = argv.find((item) => /^--input=/.test(item));
  return flag
    ? path.resolve(ROOT, flag.split('=')[1])
    : path.join(ROOT, `${artifactPrefix(parsePhase(argv))}_POST_CLOSEOUT_RETURN_MUTATION_AUDIT.json`);
}
function outputPath(argv = process.argv.slice(2)) {
  return path.join(ROOT, `${artifactPrefix(parsePhase(argv))}_POST_CLOSEOUT_RETURN_REPAIR_PLAN.json`);
}
function classify(row = {}) {
  const issues = Array.isArray(row.issues) ? row.issues : [];
  if (row.stockPosted === true || row.inventoryPosted === true) {
    return {
      group: 'D',
      status: 'REVERSAL_REQUIRED',
      reason: 'Return order already posted to stock/inventory; create controlled reversal request before any rebuilt version.'
    };
  }
  if (issues.includes('RETURN_CLOSEOUT_SNAPSHOT_MISMATCH') && issues.includes('POST_CLOSEOUT_RETURN_UPDATED_AT_AFTER_LOCK')) {
    return {
      group: 'C',
      status: 'MANUAL_REVIEW_REQUIRED',
      reason: 'Closeout snapshot mismatch plus post-lock update marker; human accounting/warehouse review required.'
    };
  }
  if (issues.includes('RETURN_CLOSEOUT_SNAPSHOT_MISMATCH')) {
    return {
      group: 'B',
      status: 'SAFE_REBUILD_CANDIDATE',
      reason: 'Snapshot mismatch without stock posting marker; candidate for controlled rebuild plan after approval.'
    };
  }
  return {
    group: 'A',
    status: 'NO_AUTO_REPAIR',
    reason: 'Locked or warehouse-verified row found, but no repair-safe mismatch signal was detected.'
  };
}
function buildPlan(audit = {}) {
  const rows = Array.isArray(audit.rows) ? audit.rows : [];
  const auditNotExecuted = audit.status === 'AUDIT_NOT_EXECUTED' || audit.connection?.ok === false;
  const items = rows.map((row) => ({ ...row, ...classify(row), apply: false }));
  const summary = items.reduce((acc, item) => {
    acc.total += 1;
    acc.byGroup[item.group] = (acc.byGroup[item.group] || 0) + 1;
    acc.byStatus[item.status] = (acc.byStatus[item.status] || 0) + 1;
    return acc;
  }, { total: 0, byGroup: {}, byStatus: {} });
  return {
    phase: audit.phase || 'Phase260B',
    mode: 'read_only_plan',
    apply: false,
    status: auditNotExecuted ? 'AUDIT_NOT_EXECUTED' : 'PLAN_READY',
    generatedAt: new Date().toISOString(),
    sourceAuditGeneratedAt: audit.generatedAt || '',
    sourceAuditStatus: audit.status || '',
    statuses: ['AUDIT_NOT_EXECUTED', 'NO_AUTO_REPAIR', 'MANUAL_REVIEW_REQUIRED', 'SAFE_REBUILD_CANDIDATE', 'REVERSAL_REQUIRED'],
    summary,
    items
  };
}

function main() {
  const argv = process.argv.slice(2);
  const input = parseInput(argv);
  const out = outputPath(argv);
  const audit = fs.existsSync(input)
    ? readJson(input)
    : { generatedAt: '', rows: [], missingInput: input };
  const plan = buildPlan(audit);
  fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, output: path.basename(out), status: plan.status, total: plan.summary.total, byStatus: plan.summary.byStatus }, null, 2));
}

if (require.main === module) main();

module.exports = { buildPlan, classify, parseInput, outputPath };
