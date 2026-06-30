#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { audit } = require('./audit-new-delivery-debt-consistency');

function parseArgs(argv = process.argv.slice(2)) {
  const set = new Set(argv);
  return { json: set.has('--json'), strict: set.has('--strict'), allowApply: set.has('--apply') };
}

async function plan(options = {}) {
  const result = await audit(options);
  return {
    title: 'NEW_DELIVERY_DEBT_REPAIR_PLAN',
    mode: 'plan-only',
    applySupported: false,
    applyRequested: options.allowApply === true,
    reason: 'Phase97 chỉ lập kế hoạch repair có kiểm soát. Không rebuild mù, không xóa ledger cũ, không sửa trực tiếp salesOrders.remainingDebt.',
    recommendedActions: {
      missingArDebtOpen: result.missingArDebtOpen.map((row) => ({ ...row, action: 'review_closeout_and_post_AR_DEBT_OPEN_if_evidence_matches' })),
      missingArDebtAdjustment: result.missingArDebtAdjustment.map((row) => ({ ...row, action: 'replay_DeliveryCloseoutCorrectionService_idempotently' })),
      legacyLeakage: result.legacyLeakage.slice(0, 500).map((row) => ({ ...row, action: 'exclude_from_DebtNew_or_create_LEGACY_DEBT_REPAIR_AR_DEBT_ADJUSTMENT_after_manual_approval' }))
    },
    audit: result
  };
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const result = await plan(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('NEW_DELIVERY_DEBT_REPAIR_PLAN');
    console.log(`Mode: ${result.mode}`);
    console.log(`Apply supported: ${result.applySupported}`);
    console.log(`Missing AR-DEBT-OPEN actions: ${result.recommendedActions.missingArDebtOpen.length}`);
    console.log(`Missing AR-DEBT-ADJUSTMENT actions: ${result.recommendedActions.missingArDebtAdjustment.length}`);
    console.log(`Legacy leakage actions: ${result.recommendedActions.legacyLeakage.length}`);
    if (options.allowApply) console.log('Không apply tự động trong Phase97 để tránh repair mù. Hãy review plan trước.');
  }
  await mongoose.connection.close();
  if (options.strict && !result.audit.ok) process.exitCode = 2;
}

if (require.main === module) main().catch(async (err) => {
  console.error('[plan-new-delivery-debt-repair] failed:', err && err.stack ? err.stack : err);
  try { await mongoose.connection.close(); } catch (_) {}
  process.exit(1);
});

module.exports = { plan };
