#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Executor = require('../src/services/accounting/HistoricalCorrectionRepairExecutor');
const Planner = require('../src/services/accounting/HistoricalCorrectionRepairPlanner');

function text(value = '') { return String(value ?? '').trim(); }
function argValue(argv, name) {
  const direct = argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] || '' : '';
}
function parseArgs(argv = process.argv.slice(2)) {
  return {
    apply: argv.includes('--apply'),
    offlineVerify: argv.includes('--offline-verify'),
    help: argv.includes('--help') || argv.includes('-h'),
    planPath: text(argValue(argv, '--plan')),
    planHash: text(argValue(argv, '--plan-hash')),
    planItemHash: text(argValue(argv, '--plan-item-hash')),
    orderCode: text(argValue(argv, '--order-code')),
    actor: text(argValue(argv, '--actor')) || 'historical-correction-repair-operator'
  };
}
function loadPlan(planPath) {
  if (!planPath) throw Object.assign(new Error('--plan is required'), { code: 'HISTORICAL_REPAIR_PLAN_REQUIRED' });
  return JSON.parse(fs.readFileSync(path.resolve(planPath), 'utf8'));
}
function usage() {
  return [
    'READ-ONLY DB revalidation (default, no mutation):',
    '  node scripts/apply-historical-correction-repair.js --plan <plan.json> --order-code <ORDER>',
    '',
    'Offline hash-only verification (NOT safe-to-apply evidence):',
    '  node scripts/apply-historical-correction-repair.js --plan <plan.json> --offline-verify',
    '',
    'Guarded apply (manual operator decision only):',
    '  node scripts/apply-historical-correction-repair.js --plan <plan.json> --order-code <ORDER> --plan-hash <HASH> --actor <ACTOR> --apply'
  ].join('\n');
}
async function withDb(work) {
  try { require('dotenv').config(); } catch (_) {}
  const connectDB = require('../src/config/db');
  const mongoose = require('mongoose');
  const { loadEvidenceFromDb } = require('./lib/historical-correction-repair-db');
  await connectDB();
  try { return await work({ mongoose, loadEvidenceFromDb }); }
  finally { await mongoose.connection.close().catch(() => {}); }
}
async function main() {
  const args = parseArgs();
  if (args.help) { process.stdout.write(`${usage()}\n`); return; }
  const plan = loadPlan(args.planPath);
  if (args.offlineVerify) {
    if (args.apply) throw Object.assign(new Error('--offline-verify cannot be combined with --apply'), { code:'HISTORICAL_REPAIR_OFFLINE_APPLY_FORBIDDEN' });
    const hash = Planner.verifyPlanHash(plan);
    process.stdout.write(`${JSON.stringify({
      status:'OFFLINE_HASH_ONLY', mutation:false, apply:false, planHashValid:hash.ok,
      dbRevalidated:false, lineageRevalidated:false, eventMissingRevalidated:false,
      safeToApply:false, warning:'Hash validity alone is not DB revalidation and must not be used as apply approval.',
      planHash:plan.planHash, proposedRepairCount:plan.proposedRepairCount
    }, null, 2)}\n`);
    return;
  }

  const effectiveOrderCode = text(args.orderCode || plan.orderCode);
  if (!args.apply) {
    const result = await withDb(async ({ loadEvidenceFromDb }) => Executor.revalidateRepairPlan(
      { plan, orderCode:effectiveOrderCode },
      { reloadEvidence:({ orderCode, session }) => loadEvidenceFromDb({ orderCode, session }) }
    ));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  Executor.assertApplyGuard({ apply:true, plan, planHash:args.planHash, orderCode:args.orderCode });
  const result = await withDb(async ({ loadEvidenceFromDb }) => {
    const { withMongoTransaction } = require('../src/utils/transaction.util');
    return Executor.executePlan({ ...args, plan }, {
      withTransaction:(work) => withMongoTransaction(work),
      reloadEvidence:({ orderCode, session }) => loadEvidenceFromDb({ orderCode, session }),
      readCurrentAr:async ({ orderCode, session }) => {
        const evidence = await loadEvidenceFromDb({ orderCode, session });
        return evidence.currentArBeforeObserved;
      }
    });
  });
  process.stdout.write(`${JSON.stringify({
    status:result.idempotent ? 'IDEMPOTENT_ALREADY_APPLIED' : 'APPLIED_TRANSACTIONALLY',
    mutation:result.applied === true, result
  }, null, 2)}\n`);
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { parseArgs, loadPlan, usage };
