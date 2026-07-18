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
const DEFAULT_PLAN = path.join(ROOT, 'PHASE260D_R3_DUPLICATE_BUSINESS_EVENT_PLAN.json');
const OUT = path.join(ROOT, 'PHASE260D_R3_APPLY_EVIDENCE.json');
const REQUIRED_ENV = 'AR_DEBT_DUPLICATE_REPAIR_ENABLED';
const REQUIRED_ENV_VALUE = 'true';
const REQUIRED_TOKEN = 'PHASE260D_APPLY';

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
  const token = text(argValue(argv, '--confirmation-token'));
  if (!apply) return { apply: false, dryRun: true };
  if (env[REQUIRED_ENV] !== REQUIRED_ENV_VALUE) {
    const err = new Error(`${REQUIRED_ENV}=${REQUIRED_ENV_VALUE} is required for Phase260D duplicate repair apply.`);
    err.code = 'PHASE260D_REPAIR_ENV_NOT_ENABLED';
    throw err;
  }
  if (token !== REQUIRED_TOKEN) {
    const err = new Error(`--confirmation-token=${REQUIRED_TOKEN} is required for Phase260D duplicate repair apply.`);
    err.code = 'PHASE260D_REPAIR_CONFIRMATION_REQUIRED';
    throw err;
  }
  return { apply: true, dryRun: false };
}
function validateItem(item = {}) {
  if (item.classification === 'PROJECTION_SHADOW') return { ok: false, reason: 'projection_shadow_only_no_mutation' };
  if (item.classification !== 'ACTUAL_DUPLICATE_FINANCIAL_EFFECT') return { ok: false, reason: 'not_duplicate_financial_effect' };
  if (item.mutationAllowed !== true) return { ok: false, reason: item.skipReason || 'mutation_not_allowed' };
  if (!text(item.businessEventIdentity) || !Array.isArray(item.actualDuplicateLedgerIds) || !item.actualDuplicateLedgerIds.length) {
    return { ok: false, reason: 'business_evidence_incomplete' };
  }
  return { ok: true, reason: 'ok' };
}
function reversalLedgerFromOriginal(original = {}, item = {}, options = {}) {
  const now = options.now || dateUtil.nowIso();
  const repairRunId = text(options.repairRunId || `PHASE260D-R3-${Date.now()}`);
  const originalLedgerId = text(original.id || original.code || original._id);
  const debit = money(original.credit);
  const credit = money(original.debit);
  const amount = Math.max(debit, credit, Math.abs(money(original.debit) - money(original.credit)));
  return {
    account: 'AR',
    category: 'AR-DEBT-DUPLICATE-REVERSAL',
    ledgerType: 'AR-DEBT-DUPLICATE-REVERSAL',
    type: 'ar_debt_duplicate_reversal',
    active: true,
    reversed: false,
    status: 'posted',
    accountingStatus: 'confirmed',
    accountingConfirmed: true,
    orderId: text(original.orderId || original.salesOrderId),
    orderCode: text(original.orderCode || original.salesOrderCode || item.orderCode),
    salesOrderId: text(original.salesOrderId || original.orderId),
    salesOrderCode: text(original.salesOrderCode || original.orderCode || item.orderCode),
    customerCode: text(original.customerCode || item.customerCode),
    sourceType: 'PHASE260D_DUPLICATE_BUSINESS_EVENT_REPAIR',
    sourceModel: 'arLedgers',
    sourceId: originalLedgerId,
    sourceCode: originalLedgerId,
    refType: 'AR_LEDGER_DUPLICATE_REVERSAL',
    refId: originalLedgerId,
    refCode: text(original.code || originalLedgerId),
    originalLedgerId,
    originalIdempotencyKey: text(original.idempotencyKey),
    debit,
    credit,
    amount,
    direction: debit > 0 ? 'debit' : 'credit',
    amountField: debit > 0 ? 'debit' : 'credit',
    idempotencyKey: `PHASE260D:DUPLICATE-REVERSAL:${text(item.businessEventIdentity)}:${originalLedgerId}:${repairRunId}`,
    accountingBatchId: repairRunId,
    note: `Phase260D append-only reversal for duplicate AR business event ${text(item.businessEventIdentity)}`,
    reasonCode: text(item.reasonCode),
    metadata: {
      phase: 'Phase260D-R3',
      controlledDuplicateBusinessEventRepair: true,
      repairRunId,
      businessEventIdentity: text(item.businessEventIdentity),
      originalLedgerId,
      originalCategory: text(original.category || original.ledgerType),
      originalDebit: money(original.debit),
      originalCredit: money(original.credit)
    },
    createdAt: now,
    updatedAt: now
  };
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
  const results = [];
  for (const duplicateId of item.actualDuplicateLedgerIds || []) {
    const original = await ArLedger.findOne({ $or: [{ id: duplicateId }, { code: duplicateId }, { _id: mongoose.Types.ObjectId.isValid(duplicateId) ? duplicateId : undefined }].filter((clause) => Object.values(clause)[0] !== undefined) }).session(options.session).lean();
    if (!original) {
      results.push({ duplicateId, skipped: true, reason: 'original_ledger_not_found' });
      continue;
    }
    if (String(original.account || '').toUpperCase() !== 'AR') throw Object.assign(new Error('Only AR ledgers can be repaired by Phase260D.'), { code: 'PHASE260D_NON_AR_LEDGER_BLOCKED' });
    if (original.accountingStatus && !['confirmed', 'posted'].includes(String(original.accountingStatus).toLowerCase())) {
      results.push({ duplicateId, skipped: true, reason: 'original_not_confirmed' });
      continue;
    }
    const reversal = reversalLedgerFromOriginal(original, item, options);
    const saved = await upsertLedger(reversal, options);
    results.push({ duplicateId, skipped: false, reversalLedgerId: text(saved.id || saved.code) });
  }
  return { repairItemId: item.repairItemId, skipped: false, results };
}
function dryRunItem(item = {}, options = {}) {
  const validation = validateItem(item);
  return {
    repairItemId: item.repairItemId,
    dryRun: true,
    skipped: !validation.ok,
    reason: validation.reason,
    classification: text(item.classification),
    businessEventIdentity: text(item.businessEventIdentity),
    actualDuplicateLedgerIds: item.actualDuplicateLedgerIds || [],
    repairRunId: options.repairRunId
  };
}
async function applyPlan(plan = {}, options = {}) {
  const repairRunId = text(options.repairRunId || `PHASE260D-R3-${Date.now()}`);
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
  const repairRunId = text(argValue(argv, '--repair-run-id')) || `PHASE260D-R3-${Date.now()}`;
  const evidence = {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260D-R3',
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
    evidence.results = await applyPlan(plan, { apply: guard.apply, repairRunId, actor: text(argValue(argv, '--actor')) || 'phase260d-repair' });
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
  reversalLedgerFromOriginal,
  applyPlan,
  dryRunItem,
  constants: { REQUIRED_ENV, REQUIRED_ENV_VALUE, REQUIRED_TOKEN }
};
