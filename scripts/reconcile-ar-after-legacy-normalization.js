#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');
const { buildReport: buildDetailAudit } = require('./audit-ar-legacy-contract-detail');
const { buildPlanFromDb } = require('./plan-ar-legacy-contract-normalization');

function parseArgs(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  return { dryRun: !args.has('--apply'), json: args.has('--json'), markdown: args.has('--markdown') };
}

function toMarkdown(report = {}) {
  const lines = [];
  lines.push('# PHASE81 AR Debt Rebuild Reconciliation After Legacy Normalization');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- ReadOnly: ${report.readOnly}`);
  lines.push(`- CanonicalLedgerCount: ${report.rebuild.canonicalLedgerCount}`);
  lines.push(`- RejectedLedgerCount: ${report.rebuild.rejectedLedgerCount}`);
  lines.push(`- DebtOrderCount: ${report.rebuild.debtOrderCount}`);
  lines.push(`- DebtCustomerCount: ${report.rebuild.debtCustomerCount}`);
  lines.push(`- RemainingPlanActions: ${report.plan.summary.actionCount}`);
  lines.push(`- RemainingSafeActions: ${report.plan.summary.safeToAutoApplyCount}`);
  lines.push('');
  lines.push('## Legacy audit summary');
  for (const [key, value] of Object.entries(report.detail.summary || {})) {
    if (typeof value !== 'object') lines.push(`- ${key}: ${value}`);
  }
  lines.push('');
  lines.push('Reconcile này mặc định read-only/dry-run. Chạy rebuild thật bằng scripts/rebuild-ar-debt-read-model.js --all sau khi apply normalization đã được kiểm chứng.');
  return `${lines.join('\n')}\n`;
}

async function buildReport(options = {}) {
  const detail = await buildDetailAudit(options);
  const plan = await buildPlanFromDb(options);
  const rebuild = await arDebtReadModel.rebuildAllDebtReadModels({ dryRun: true });
  return {
    mode: 'phase81-reconcile-after-legacy-normalization',
    readOnly: true,
    generatedAt: new Date().toISOString(),
    detail,
    plan: { summary: plan.summary },
    rebuild: {
      canonicalLedgerCount: rebuild.canonicalLedgers.length,
      rejectedLedgerCount: rebuild.rejectedLedgers.length,
      debtOrderCount: rebuild.debtOrders.length,
      debtCustomerCount: rebuild.debtCustomers.length,
      persist: rebuild.persist
    }
  };
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const report = await buildReport(options);
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, 'ar-after-legacy-normalization-reconcile.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(reportsDir, 'ar-after-legacy-normalization-reconcile.md'), toMarkdown(report));
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else if (options.markdown) console.log(toMarkdown(report));
  else console.log('Đã tạo reconcile report: reports/ar-after-legacy-normalization-reconcile.json và reports/ar-after-legacy-normalization-reconcile.md');
  await mongoose.connection.close();
  if (report.rebuild.rejectedLedgerCount > 0) process.exitCode = 2;
}

if (require.main === module) main().catch(async (err) => { console.error('[reconcile-ar-after-legacy-normalization] failed:', err); try { await mongoose.connection.close(); } catch (_) {} process.exit(1); });
module.exports = { buildReport, toMarkdown };
