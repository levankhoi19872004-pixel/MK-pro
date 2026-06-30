#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const { auditArLedgerContractRows, buildMongoFilter } = require('./audit-ar-ledger-contract');

function clean(value = '') { return String(value ?? '').trim(); }
function parseArgs(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const valueOf = (name) => {
    const prefix = `${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const idx = argv.indexOf(name);
    return idx >= 0 ? argv[idx + 1] || '' : '';
  };
  return { dryRun: args.has('--dry-run') || !args.has('--apply'), sourceId: valueOf('--sourceId'), customerCode: valueOf('--customerCode'), json: args.has('--json') };
}

function classifyIssue(issue = {}) {
  const code = issue.code;
  if (['DIRTY_LEDGER_MISSING_CATEGORY', 'DIRTY_LEDGER_MISSING_LEDGER_TYPE', 'DIRTY_LEDGER_MISSING_ENTRY_TYPE'].includes(code)) return 'normalize candidate';
  if (['DIRTY_LEDGER_DUPLICATE_AR_SALE', 'DIRTY_LEDGER_DUPLICATE_REVERSAL', 'DIRTY_LEDGER_DUPLICATE_IDEMPOTENCY_KEY'].includes(code)) return 'duplicate candidate';
  if (code === 'DIRTY_LEDGER_REVERSED_BUT_ACTIVE') return 'reversal candidate';
  if (code === 'DIRTY_LEDGER_ACC_ID_REV_BATCH_MISMATCH') return 'unsafe to auto repair';
  return 'manual review required';
}

function buildPlan(audit = {}, options = {}) {
  const groups = {
    'normalize candidate': [],
    'duplicate candidate': [],
    'reversal candidate': [],
    'manual review required': [],
    'unsafe to auto repair': []
  };
  for (const issue of audit.issues || []) {
    groups[classifyIssue(issue)].push({
      code: issue.code,
      severity: issue.severity,
      ledger: issue.ledger,
      action: issue.code.includes('DUPLICATE') ? 'review canonical; do not auto-delete production ledger' : 'manual/accounting review before any data repair',
      safeToAutoApply: false
    });
  }
  return {
    mode: 'plan-only',
    readOnly: true,
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      rowsAudited: audit.totals?.rows || 0,
      issueCount: audit.totals?.issueCount || 0,
      normalizeCandidateCount: groups['normalize candidate'].length,
      duplicateCandidateCount: groups['duplicate candidate'].length,
      reversalCandidateCount: groups['reversal candidate'].length,
      manualReviewRequiredCount: groups['manual review required'].length,
      unsafeToAutoRepairCount: groups['unsafe to auto repair'].length
    },
    groups,
    indexRecommendations: [
      'db.arLedgers.createIndex({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string", $gt: "" } } })',
      'db.arLedgers.createIndex({ sourceType: 1, sourceId: 1, category: 1, active: 1 })',
      'db.arLedgers.createIndex({ customerCode: 1, accountingConfirmed: 1, accountingStatus: 1, active: 1, category: 1 })',
      'db.arLedgers.createIndex({ reversedLedgerId: 1, category: 1 }, { unique: true, partialFilterExpression: { category: "AR-SALE-REVERSAL", reversedLedgerId: { $type: "string", $gt: "" } } })'
    ],
    safetyNote: 'Plan không apply, không xoá ledger production. Unique index chỉ tạo sau khi audit hết duplicate.'
  };
}

function toMarkdown(plan = {}) {
  const lines = [];
  lines.push('# PHASE79 AR Clean Rebuild Plan');
  lines.push('');
  lines.push(`- GeneratedAt: ${plan.generatedAt}`);
  lines.push(`- Mode: ${plan.mode}`);
  lines.push(`- ReadOnly: ${plan.readOnly}`);
  lines.push('');
  lines.push('## Summary');
  for (const [key, value] of Object.entries(plan.summary || {})) lines.push(`- ${key}: ${value}`);
  lines.push('');
  for (const [group, items] of Object.entries(plan.groups || {})) {
    lines.push(`## ${group}`);
    if (!items.length) lines.push('- Không có.');
    for (const item of items.slice(0, 100)) lines.push(`- ${item.code} | ${item.ledger?.ledgerId || '(missing)'} | safeToAutoApply=${item.safeToAutoApply}`);
    lines.push('');
  }
  lines.push('## Index recommendations');
  for (const item of plan.indexRecommendations || []) lines.push(`- \`${item}\``);
  lines.push('');
  lines.push(plan.safetyNote || '');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const rows = await ArLedger.find(buildMongoFilter(options)).lean();
  const audit = auditArLedgerContractRows(rows);
  const plan = buildPlan(audit, options);
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, 'ar-clean-rebuild-plan.json'), JSON.stringify(plan, null, 2));
  fs.writeFileSync(path.join(reportsDir, 'ar-clean-rebuild-plan.md'), toMarkdown(plan));
  if (options.json) console.log(JSON.stringify(plan, null, 2));
  else console.log(`Đã tạo plan: reports/ar-clean-rebuild-plan.json và reports/ar-clean-rebuild-plan.md (không apply)`);
  await mongoose.connection.close();
}

if (require.main === module) main().catch(async (err) => { console.error('[plan-ar-clean-rebuild] failed:', err); try { await mongoose.connection.close(); } catch (_) {} process.exit(1); });
module.exports = { buildPlan, toMarkdown };
