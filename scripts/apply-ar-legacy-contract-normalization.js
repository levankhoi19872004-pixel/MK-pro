#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const { applyNormalizationPlan, validatePlanForApply } = require('./lib/arLegacyNormalizationCore');

function parseArgs(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const valueOf = (name) => {
    const prefix = `${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const idx = argv.indexOf(name);
    return idx >= 0 ? argv[idx + 1] || '' : '';
  };
  return {
    dryRun: !args.has('--apply'),
    apply: args.has('--apply'),
    json: args.has('--json'),
    planPath: valueOf('--plan') || path.join(process.cwd(), 'reports', 'ar-legacy-normalization-plan.json'),
    actor: valueOf('--actor') || 'phase81-ar-legacy-normalization'
  };
}

function toMarkdown(result = {}, options = {}) {
  const lines = [];
  lines.push('# PHASE81 AR Legacy Contract Normalization Apply Report');
  lines.push('');
  lines.push(`- GeneratedAt: ${new Date().toISOString()}`);
  lines.push(`- Mode: ${result.dryRun ? 'dry-run' : 'apply'}`);
  lines.push(`- Plan: ${options.planPath}`);
  lines.push(`- RequestedActions: ${result.requestedActions}`);
  lines.push(`- AppliedActions: ${result.appliedActions}`);
  lines.push(`- SkippedActions: ${result.skippedActions}`);
  lines.push('');
  lines.push('## Details sample');
  for (const item of (result.details || []).slice(0, 120)) lines.push(`- ${item.actionType} | ${item.ledgerCode} | dryRun=${item.dryRun === true} | modified=${item.modifiedCount ?? ''}`);
  lines.push('');
  lines.push('Không xóa ledger. Chỉ action high-confidence, non-manual, có rollbackPatch mới được apply.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs();
  const plan = JSON.parse(fs.readFileSync(options.planPath, 'utf8'));
  validatePlanForApply(plan);
  await connectDB();
  const result = await applyNormalizationPlan(plan, { ArLedger }, { dryRun: options.dryRun, actor: options.actor });
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, 'ar-legacy-normalization-apply-report.json'), JSON.stringify({ options, result }, null, 2));
  fs.writeFileSync(path.join(reportsDir, 'ar-legacy-normalization-apply-report.md'), toMarkdown(result, options));
  if (options.json) console.log(JSON.stringify({ options, result }, null, 2));
  else console.log(toMarkdown(result, options));
  await mongoose.connection.close();
}

if (require.main === module) main().catch(async (err) => { console.error('[apply-ar-legacy-contract-normalization] failed:', err); try { await mongoose.connection.close(); } catch (_) {} process.exit(1); });
module.exports = { parseArgs, toMarkdown };
