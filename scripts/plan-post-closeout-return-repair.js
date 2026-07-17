#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_AUDIT = path.join(ROOT, 'PHASE260B_POST_CLOSEOUT_RETURN_MUTATION_AUDIT.json');
const OUT = path.join(ROOT, 'PHASE260B_POST_CLOSEOUT_RETURN_REPAIR_PLAN.json');

function clean(value = '') { return String(value ?? '').trim(); }
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function parseInput(argv = process.argv.slice(2)) {
  const flag = argv.find((item) => /^--input=/.test(item));
  return flag ? path.resolve(ROOT, flag.split('=')[1]) : DEFAULT_AUDIT;
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
  const items = rows.map((row) => ({ ...row, ...classify(row), apply: false }));
  const summary = items.reduce((acc, item) => {
    acc.total += 1;
    acc.byGroup[item.group] = (acc.byGroup[item.group] || 0) + 1;
    acc.byStatus[item.status] = (acc.byStatus[item.status] || 0) + 1;
    return acc;
  }, { total: 0, byGroup: {}, byStatus: {} });
  return {
    phase: 'Phase260B',
    mode: 'read_only_plan',
    apply: false,
    generatedAt: new Date().toISOString(),
    sourceAuditGeneratedAt: audit.generatedAt || '',
    statuses: ['NO_AUTO_REPAIR', 'MANUAL_REVIEW_REQUIRED', 'SAFE_REBUILD_CANDIDATE', 'REVERSAL_REQUIRED'],
    summary,
    items
  };
}

function main() {
  const input = parseInput();
  const audit = fs.existsSync(input)
    ? readJson(input)
    : { generatedAt: '', rows: [], missingInput: input };
  const plan = buildPlan(audit);
  fs.writeFileSync(OUT, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, output: path.basename(OUT), total: plan.summary.total, byStatus: plan.summary.byStatus }, null, 2));
}

if (require.main === module) main();

module.exports = { buildPlan, classify };
