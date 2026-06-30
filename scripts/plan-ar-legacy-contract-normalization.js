#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const { buildNormalizationPlan } = require('./lib/arLegacyNormalizationCore');
const { loadRelatedSources } = require('./audit-ar-legacy-contract-detail');

function parseArgs(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const valueOf = (name) => {
    const prefix = `${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const idx = argv.indexOf(name);
    return idx >= 0 ? argv[idx + 1] || '' : '';
  };
  return { dryRun: args.has('--dry-run') || !args.has('--apply'), json: args.has('--json'), markdown: args.has('--markdown'), sourceId: valueOf('--sourceId'), customerCode: valueOf('--customerCode') };
}

function buildLedgerFilter(options = {}) {
  const filter = { account: 'AR' };
  if (options.customerCode) filter.customerCode = options.customerCode;
  if (options.sourceId) {
    const pattern = new RegExp(options.sourceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    filter.$or = [{ sourceId: options.sourceId }, { orderId: options.sourceId }, { salesOrderId: options.sourceId }, { code: pattern }, { id: pattern }];
  }
  return filter;
}

function toMarkdown(plan = {}) {
  const lines = [];
  lines.push('# PHASE81 AR Legacy Contract Normalization Plan');
  lines.push('');
  lines.push(`- GeneratedAt: ${plan.generatedAt}`);
  lines.push(`- Mode: ${plan.mode}`);
  lines.push(`- ReadOnly: ${plan.readOnly}`);
  lines.push(`- RowsAudited: ${plan.summary?.rowsAudited || 0}`);
  lines.push(`- ActionCount: ${plan.summary?.actionCount || 0}`);
  lines.push(`- SafeToAutoApplyCount: ${plan.summary?.safeToAutoApplyCount || 0}`);
  lines.push(`- ManualReviewCount: ${plan.summary?.manualReviewCount || 0}`);
  lines.push('');
  lines.push('## Source counts');
  for (const [key, value] of Object.entries(plan.sourceCounts || {})) lines.push(`- ${key}: ${value}`);
  lines.push('');
  lines.push('## Actions by type');
  for (const [key, value] of Object.entries(plan.summary?.byType || {}).sort()) lines.push(`- ${key}: ${value}`);
  lines.push('');
  lines.push('## Actions by confidence');
  for (const [key, value] of Object.entries(plan.summary?.byConfidence || {}).sort()) lines.push(`- ${key}: ${value}`);
  lines.push('');
  lines.push('## Auto-apply candidates sample');
  const safe = (plan.actions || []).filter((action) => action.safeToAutoApply).slice(0, 80);
  if (!safe.length) lines.push('- Không có action high-confidence an toàn để apply tự động.');
  for (const action of safe) lines.push(`- ${action.actionType} | ${action.ledgerCode} | confidence=${action.confidence} | source=${action.relatedSourceSnapshot?.id || ''}`);
  lines.push('');
  lines.push('## Manual review sample');
  for (const action of (plan.actions || []).filter((item) => !item.safeToAutoApply).slice(0, 80)) lines.push(`- ${action.actionType} | ${action.ledgerCode} | confidence=${action.confidence} | reason=${action.reason}`);
  lines.push('');
  lines.push(plan.safetyNote || '');
  return `${lines.join('\n')}\n`;
}

async function buildPlanFromDb(options = {}) {
  const ledgers = await ArLedger.find(buildLedgerFilter(options)).lean();
  const sources = await loadRelatedSources(ledgers);
  return buildNormalizationPlan(ledgers, sources, options);
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const plan = await buildPlanFromDb(options);
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, 'ar-legacy-normalization-plan.json'), JSON.stringify(plan, null, 2));
  fs.writeFileSync(path.join(reportsDir, 'ar-legacy-normalization-plan.md'), toMarkdown(plan));
  if (options.json) console.log(JSON.stringify(plan, null, 2));
  else if (options.markdown) console.log(toMarkdown(plan));
  else console.log('Đã tạo Phase81 plan: reports/ar-legacy-normalization-plan.json và reports/ar-legacy-normalization-plan.md (không apply)');
  await mongoose.connection.close();
}

if (require.main === module) main().catch(async (err) => { console.error('[plan-ar-legacy-contract-normalization] failed:', err); try { await mongoose.connection.close(); } catch (_) {} process.exit(1); });
module.exports = { buildPlanFromDb, toMarkdown };
