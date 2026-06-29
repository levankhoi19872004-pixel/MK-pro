#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const dateUtil = require('../src/utils/date.util');
const { clean, ledgerObjectId, objectIdOf } = require('./audit-ar-ledger-integrity');

function valueOf(args, name) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] || '' : '';
}

function latestPlanPath() {
  const reportsDir = path.resolve(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) return '';
  return fs.readdirSync(reportsDir)
    .filter((name) => /^ar-ledger-repair-plan-.*\.json$/.test(name))
    .map((name) => path.join(reportsDir, name))
    .sort()
    .pop() || '';
}

function loadPlan(filePath = '') {
  const resolved = filePath ? path.resolve(filePath) : latestPlanPath();
  if (!resolved || !fs.existsSync(resolved)) throw new Error('Không tìm thấy repair plan JSON. Hãy truyền --plan <file> hoặc chạy plan trước.');
  return { filePath: resolved, plan: JSON.parse(fs.readFileSync(resolved, 'utf8')) };
}

function ledgerFilterFor(target = {}) {
  const objectId = clean(target._id || target.ledgerObjectId || target.objectId);
  if (objectId && /^[a-f0-9]{24}$/i.test(objectId)) return { _id: objectId };
  const ors = [];
  if (target.id) ors.push({ id: target.id });
  if (target.code) ors.push({ code: target.code });
  if (objectId) ors.push({ id: objectId }, { code: objectId });
  if (!ors.length) throw new Error(`Không có khóa ledger để void: ${JSON.stringify(target)}`);
  return ors.length === 1 ? ors[0] : { $or: ors };
}

function buildVoidPatch(item = {}, target = {}, options = {}) {
  const now = options.now || dateUtil.nowIso();
  const repairBatchId = clean(options.repairBatchId);
  const repairTag = clean(options.repairTag || 'phase65-ar-ledger-hygiene');
  const canonicalLedgerObjectId = clean(item.canonicalLedgerObjectId);
  const voidReason = clean(options.voidReason || `Void duplicate AR ledger ${target.code || target.id || target.ledgerObjectId}; superseded by ${canonicalLedgerObjectId}`);
  return {
    $set: {
      status: 'voided',
      accountingStatus: 'voided',
      accountingConfirmed: false,
      voidedAt: now,
      voidedBy: 'ledger-repair-script',
      voidReason,
      supersededBy: canonicalLedgerObjectId,
      repairBatchId,
      repairTag,
      updatedAt: now
    },
    $push: {
      auditTrail: {
        action: 'ledger_repair_void_duplicate',
        at: now,
        by: 'ledger-repair-script',
        repairBatchId,
        repairTag,
        repairItemId: clean(item.repairItemId),
        canonicalLedgerObjectId,
        voidReason
      }
    }
  };
}

function applyRepairPlanToRows(plan = {}, rows = [], options = {}) {
  const apply = options.apply === true;
  const repairBatchId = clean(options.repairBatchId || 'DRY-RUN');
  const now = options.now || '2026-06-29T00:00:00.000Z';
  const outputRows = (rows || []).map((row) => ({ ...row, auditTrail: Array.isArray(row.auditTrail) ? [...row.auditTrail] : [] }));
  const results = [];

  for (const item of plan.repairItems || []) {
    if (item.manualReviewRequired === true) {
      results.push({ repairItemId: item.repairItemId, skipped: true, reason: 'manualReviewRequired' });
      continue;
    }
    const itemResult = { repairItemId: item.repairItemId, skipped: !apply, dryRun: !apply, voided: [] };
    for (const target of item.ledgersToVoid || []) {
      const targetKey = clean(target.ledgerObjectId || target._id || target.id || target.code);
      const idx = outputRows.findIndex((row) => [ledgerObjectId(row), objectIdOf(row), clean(row.id), clean(row.code)].includes(targetKey));
      if (idx < 0) {
        itemResult.voided.push({ target: targetKey, matched: false });
        continue;
      }
      itemResult.voided.push({ target: targetKey, matched: true });
      if (apply) {
        const patch = buildVoidPatch(item, target, { ...options, repairBatchId, now });
        outputRows[idx] = {
          ...outputRows[idx],
          ...patch.$set,
          auditTrail: [...(Array.isArray(outputRows[idx].auditTrail) ? outputRows[idx].auditTrail : []), patch.$push.auditTrail]
        };
      }
    }
    results.push(itemResult);
  }
  return { rows: outputRows, results };
}

async function applyRepairPlanToDb(plan = {}, options = {}) {
  const ArLedger = require('../src/models/ArLedger');
  const repairBatchId = clean(options.repairBatchId);
  if (!repairBatchId) throw new Error('Thiếu --confirm-repair-batch; không apply.');
  const results = [];
  for (const item of plan.repairItems || []) {
    if (item.manualReviewRequired === true) {
      results.push({ repairItemId: item.repairItemId, skipped: true, reason: 'manualReviewRequired' });
      continue;
    }
    const itemResult = { repairItemId: item.repairItemId, skipped: false, matched: 0, modified: 0, ledgersToVoid: [] };
    for (const target of item.ledgersToVoid || []) {
      const filter = ledgerFilterFor(target);
      const patch = buildVoidPatch(item, target, options);
      const result = await ArLedger.updateOne(filter, patch, { session: options.session });
      itemResult.matched += Number(result.matchedCount || result.n || 0);
      itemResult.modified += Number(result.modifiedCount || result.nModified || 0);
      itemResult.ledgersToVoid.push({ target: target.ledgerObjectId || target.id || target.code, matched: Number(result.matchedCount || result.n || 0), modified: Number(result.modifiedCount || result.nModified || 0) });
    }
    results.push(itemResult);
  }
  return results;
}

function printSummary(summary) {
  console.log(`AR ledger repair apply (${summary.apply ? 'APPLY' : 'DRY-RUN'}, không hard delete)`);
  console.log('='.repeat(72));
  console.log(`Plan: ${summary.planPath}`);
  console.log(`Repair batch: ${summary.repairBatchId || '(none)'}`);
  console.log(`Items: ${summary.items}`);
  console.log(`Skipped manual review: ${summary.skippedManual}`);
  console.log(`Would/apply void rows: ${summary.voidRows}`);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const json = args.includes('--json');
  const repairBatchId = clean(valueOf(args, '--confirm-repair-batch'));
  const repairTag = clean(valueOf(args, '--repair-tag')) || 'phase65-ar-ledger-hygiene';
  const planPathArg = valueOf(args, '--plan');

  if (apply && !repairBatchId) {
    throw new Error('Có --apply nhưng thiếu --confirm-repair-batch. Dừng để tránh sửa dữ liệu thật ngoài ý muốn.');
  }

  const { filePath: planPath, plan } = loadPlan(planPathArg);
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    apply,
    dryRun: !apply,
    hardDelete: false,
    planPath,
    repairBatchId,
    repairTag,
    items: (plan.repairItems || []).length,
    skippedManual: (plan.repairItems || []).filter((item) => item.manualReviewRequired === true).length,
    voidRows: (plan.repairItems || []).filter((item) => item.manualReviewRequired !== true).reduce((sum, item) => sum + (item.ledgersToVoid || []).length, 0),
    results: []
  };

  if (apply) {
    await require('../src/config/db')();
    summary.results = await applyRepairPlanToDb(plan, { repairBatchId, repairTag, now: dateUtil.nowIso() });
    await require('mongoose').connection.close();
  } else {
    summary.results = (plan.repairItems || []).map((item) => ({
      repairItemId: item.repairItemId,
      dryRun: true,
      skipped: item.manualReviewRequired === true,
      reason: item.manualReviewRequired === true ? 'manualReviewRequired' : 'dryRunOnly',
      ledgersToVoid: item.manualReviewRequired === true ? [] : item.ledgersToVoid
    }));
  }

  if (json) console.log(JSON.stringify(summary, null, 2));
  else printSummary(summary);
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[apply-ar-ledger-repair-plan] failed:', err.message);
    try { await require('mongoose').connection.close(); } catch (_) {}
    process.exit(1);
  });
}

module.exports = {
  loadPlan,
  buildVoidPatch,
  applyRepairPlanToRows,
  applyRepairPlanToDb,
  ledgerFilterFor
};
