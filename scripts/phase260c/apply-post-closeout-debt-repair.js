#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const dateUtil = require('../../src/utils/date.util');
const connectDB = require('../../src/config/db');
const ArLedger = require('../../src/models/ArLedger');
const { withMongoTransaction } = require('../../src/utils/transaction.util');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_PLAN = path.join(ROOT, 'PHASE260C_R2_REPAIR_PLAN.json');
const OUT = path.join(ROOT, 'PHASE260C_R2_APPLY_EVIDENCE.json');
const REQUIRED_ENV = 'PHASE260C_REPAIR_ENABLE';
const REQUIRED_ENV_VALUE = 'YES';
const REQUIRED_TOKEN = 'PHASE260C_APPLY';

function text(value = '') { return String(value ?? '').trim(); }
function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function argValue(argv = process.argv.slice(2), name = '') {
  const inline = argv.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] || '' : '';
}
function loadPlan(filePath = '') {
  const resolved = path.resolve(ROOT, filePath || DEFAULT_PLAN);
  return { path: resolved, plan: JSON.parse(fs.readFileSync(resolved, 'utf8')) };
}
function assertApplyAllowed(argv = process.argv.slice(2), env = process.env) {
  const apply = argv.includes('--apply');
  const token = text(argValue(argv, '--confirm-token'));
  if (!apply) return { apply: false, dryRun: true };
  if (env[REQUIRED_ENV] !== REQUIRED_ENV_VALUE) {
    const err = new Error(`${REQUIRED_ENV}=${REQUIRED_ENV_VALUE} is required for production repair apply.`);
    err.code = 'PHASE260C_REPAIR_ENV_NOT_ENABLED';
    throw err;
  }
  if (token !== REQUIRED_TOKEN) {
    const err = new Error(`--confirm-token=${REQUIRED_TOKEN} is required for production repair apply.`);
    err.code = 'PHASE260C_REPAIR_CONFIRMATION_REQUIRED';
    throw err;
  }
  return { apply: true, dryRun: false };
}
function baseLedgerFields(item = {}, now = dateUtil.nowIso()) {
  return {
    account: 'AR',
    category: 'AR-DEBT-ADJUSTMENT',
    ledgerType: 'AR-DEBT-ADJUSTMENT',
    active: true,
    reversed: false,
    status: 'posted',
    accountingStatus: 'confirmed',
    accountingConfirmed: true,
    orderId: text(item.orderId),
    orderCode: text(item.orderCode),
    salesOrderId: text(item.orderId),
    salesOrderCode: text(item.orderCode),
    customerCode: text(item.customerCode),
    sourceType: 'PHASE260C_CONTROLLED_REPAIR',
    sourceModel: 'arLedgers',
    sourceId: text(item.correctionId),
    sourceCode: text(item.correctionId),
    correctionId: text(item.correctionId),
    deliveryCloseoutVersion: text(item.correctionVersion),
    reasonCode: text(item.reasonCode),
    createdAt: now,
    updatedAt: now
  };
}
function buildReversalLedger(item = {}, options = {}) {
  const now = options.now || dateUtil.nowIso();
  const repairRunId = text(options.repairRunId || `PHASE260C-R2-${Date.now()}`);
  const amount = money(item.reverseOriginal && item.reverseOriginal.amount);
  const originalLedgerId = text(item.ledgerId || item.ledgerCode);
  return {
    ...baseLedgerFields(item, now),
    id: `AR-DEBT-ADJUSTMENT-REVERSAL-${originalLedgerId}-${repairRunId}`,
    code: `AR-DEBT-ADJUSTMENT-REVERSAL-${text(item.orderCode || item.orderId)}-${repairRunId}`,
    type: 'ar_debt_adjustment_reversal',
    debit: money(item.reverseOriginal && item.reverseOriginal.debit),
    credit: money(item.reverseOriginal && item.reverseOriginal.credit),
    amount,
    direction: money(item.reverseOriginal && item.reverseOriginal.debit) > 0 ? 'debit' : 'credit',
    amountField: money(item.reverseOriginal && item.reverseOriginal.debit) > 0 ? 'debit' : 'credit',
    refType: 'AR_LEDGER_CONTROLLED_REVERSAL',
    refId: originalLedgerId,
    refCode: text(item.ledgerCode || originalLedgerId),
    originalLedgerId,
    originalIdempotencyKey: text(item.originalIdempotencyKey),
    originalSourceId: text(item.correctionId),
    idempotencyKey: `PHASE260C:REVERSAL:${originalLedgerId}:${repairRunId}`,
    accountingBatchId: repairRunId,
    note: `Phase260C controlled reversal for wrong debt correction ${originalLedgerId}`,
    metadata: {
      phase: 'Phase260C-R2',
      controlledReversal: true,
      repairRunId,
      originalLedgerId,
      reasonCode: text(item.reasonCode),
      actualDebtEffect: money(item.actualDebtEffect),
      expectedDebtDelta: money(item.expectedDebtDelta)
    }
  };
}
function buildCorrectDeltaLedger(item = {}, options = {}) {
  const now = options.now || dateUtil.nowIso();
  const repairRunId = text(options.repairRunId || `PHASE260C-R2-${Date.now()}`);
  const amount = money(item.correctDeltaEntry && item.correctDeltaEntry.amount);
  return {
    ...baseLedgerFields(item, now),
    id: `AR-DEBT-ADJUSTMENT-CORRECT-${text(item.correctionId)}-${repairRunId}`,
    code: `AR-DEBT-ADJUSTMENT-CORRECT-${text(item.orderCode || item.orderId)}-${repairRunId}`,
    type: 'ar_debt_adjustment_correct_delta',
    debit: money(item.correctDeltaEntry && item.correctDeltaEntry.debit),
    credit: money(item.correctDeltaEntry && item.correctDeltaEntry.credit),
    amount,
    direction: money(item.correctDeltaEntry && item.correctDeltaEntry.debit) > 0 ? 'debit' : 'credit',
    amountField: money(item.correctDeltaEntry && item.correctDeltaEntry.debit) > 0 ? 'debit' : 'credit',
    refType: 'DELIVERY_CLOSEOUT_CORRECTION',
    refId: text(item.correctionId),
    refCode: text(item.correctionId),
    idempotencyKey: `PHASE260C:CORRECT:${text(item.correctionId)}:${money(item.expectedDebtDelta)}:${repairRunId}`,
    accountingBatchId: repairRunId,
    note: `Phase260C correct event delta for debt correction ${text(item.correctionId)}`,
    metadata: {
      phase: 'Phase260C-R2',
      adjustmentPolicy: 'EVENT_DELTA_ONLY',
      repairRunId,
      repairedOriginalLedgerId: text(item.ledgerId),
      receivableDelta: money(item.receivableDelta),
      cashDelta: money(item.cashDelta),
      bankDelta: money(item.bankDelta),
      rewardDelta: money(item.rewardDelta),
      returnDelta: money(item.returnDelta),
      debtDelta: money(item.expectedDebtDelta),
      excludesConfirmedDebtReceipts: true,
      excludesCurrentDebtBalanceRecalculation: true
    }
  };
}
function validateItem(item = {}) {
  if (item.autoApplicable !== true) return { ok: false, reason: item.skipReason || 'not_auto_applicable' };
  if (!text(item.ledgerId) || !text(item.correctionId) || !text(item.orderCode || item.orderId)) return { ok: false, reason: 'business_evidence_incomplete' };
  if (money(item.actualDebtEffect) === money(item.expectedDebtDelta)) return { ok: false, reason: 'no_difference' };
  return { ok: true, reason: 'ok' };
}
async function upsertLedger(row = {}, options = {}) {
  return ArLedger.findOneAndUpdate(
    { idempotencyKey: row.idempotencyKey },
    { $setOnInsert: row },
    { upsert: true, new: true, setDefaultsOnInsert: true, session: options.session }
  ).lean();
}
async function applyItemToDb(item = {}, options = {}) {
  const validation = validateItem(item);
  if (!validation.ok) return { repairItemId: item.repairItemId, skipped: true, reason: validation.reason };
  const original = await ArLedger.findOne({
    $or: [{ id: item.ledgerId }, { code: item.ledgerId }, { code: item.ledgerCode }]
  }).session(options.session).lean();
  if (!original) return { repairItemId: item.repairItemId, skipped: true, reason: 'original_ledger_not_found' };
  if (money(original.debit) !== money(item.currentDebit) || money(original.credit) !== money(item.currentCredit)) {
    throw Object.assign(new Error('Current ledger differs from repair plan evidence.'), { code: 'PHASE260C_CURRENT_DATA_CHANGED' });
  }
  const reversal = buildReversalLedger({ ...item, originalIdempotencyKey: original.idempotencyKey }, options);
  const correct = buildCorrectDeltaLedger(item, options);
  const reversalSaved = await upsertLedger(reversal, options);
  const correctSaved = await upsertLedger(correct, options);
  return { repairItemId: item.repairItemId, skipped: false, reversalLedgerId: text(reversalSaved.id || reversalSaved.code), correctLedgerId: text(correctSaved.id || correctSaved.code) };
}
function dryRunItem(item = {}, options = {}) {
  const validation = validateItem(item);
  return {
    repairItemId: item.repairItemId,
    dryRun: true,
    skipped: !validation.ok,
    reason: validation.reason,
    reversal: validation.ok ? buildReversalLedger(item, options) : null,
    correct: validation.ok ? buildCorrectDeltaLedger(item, options) : null
  };
}
async function applyPlan(plan = {}, options = {}) {
  const repairRunId = text(options.repairRunId || `PHASE260C-R2-${Date.now()}`);
  const items = Array.isArray(plan.items) ? plan.items : [];
  if (options.apply !== true) return items.map((item) => dryRunItem(item, { ...options, repairRunId }));
  return withMongoTransaction(async (session) => {
    const results = [];
    for (const item of items) results.push(await applyItemToDb(item, { ...options, session, repairRunId }));
    return results;
  });
}
async function main() {
  const argv = process.argv.slice(2);
  const guard = assertApplyAllowed(argv);
  const { path: planPath, plan } = loadPlan(argValue(argv, '--plan'));
  const repairRunId = text(argValue(argv, '--repair-run-id')) || `PHASE260C-R2-${Date.now()}`;
  const evidence = {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260C-R2',
    mode: guard.apply ? 'apply' : 'dry_run',
    apply: guard.apply,
    dryRun: guard.dryRun,
    mutation: guard.apply,
    planPath,
    repairRunId,
    results: []
  };
  try {
    if (guard.apply) await connectDB();
    evidence.results = await applyPlan(plan, { apply: guard.apply, repairRunId, actor: text(argValue(argv, '--actor')) || 'phase260c-repair' });
    evidence.status = guard.apply ? 'APPLY_EXECUTED' : 'DRY_RUN_ONLY';
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
  fs.writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ status: evidence.status, apply: evidence.apply, results: evidence.results.length, output: path.basename(OUT) }, null, 2));
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });

module.exports = {
  assertApplyAllowed,
  loadPlan,
  validateItem,
  buildReversalLedger,
  buildCorrectDeltaLedger,
  applyPlan,
  dryRunItem,
  constants: { REQUIRED_ENV, REQUIRED_ENV_VALUE, REQUIRED_TOKEN }
};
