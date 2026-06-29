#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { toNumber } = require('../src/utils/common.util');
const { isActiveLedgerDoc } = require('../src/utils/arLedgerStatus.util');
const { containsRevMarker } = require('../src/utils/arLedgerValidation.util');
const {
  clean,
  objectIdOf,
  ledgerObjectId,
  ledgerEffect,
  summarizeLedger,
  sourceKey,
  customerKey,
  arReturnBusinessKey,
  isArReturn
} = require('./audit-ar-ledger-integrity');

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function amountOf(row = {}) {
  return Math.round(Math.max(0, toNumber(row.credit || row.amount || row.debit || 0)));
}

function returnOrderKey(row = {}) {
  return clean(row.returnOrderId || row.returnOrderCode || row.sourceId || row.sourceCode || row.refId || row.refCode || row.id || row.code)
    .replace(/^AR-RETURN-(REV-)?/i, '')
    .replace(/^AR-RETURN-/i, '');
}

function returnOrderAmount(returnOrder = {}) {
  const candidates = [
    returnOrder.amount,
    returnOrder.debtReduction,
    returnOrder.returnAmount,
    returnOrder.totalReturnAmount,
    returnOrder.totalAmount,
    returnOrder.returnedAmount,
    returnOrder.totalValue
  ].map((value) => Math.round(Math.max(0, toNumber(value)))).filter((value) => value > 0);
  if (candidates.length) return candidates[0];
  if (Array.isArray(returnOrder.items)) {
    return Math.round(returnOrder.items.reduce((sum, item) => {
      const direct = [item.returnAmount, item.amount, item.totalAmount]
        .map((value) => Math.round(Math.max(0, toNumber(value))))
        .find((value) => value > 0);
      if (direct) return sum + direct;
      return sum + Math.round(toNumber(item.returnQty || item.qtyReturn || item.qty || item.quantity || 0) * toNumber(item.salePrice || item.price || item.unitPrice || 0));
    }, 0));
  }
  return 0;
}

function returnOrderKeys(returnOrder = {}) {
  return new Set([
    returnOrder.id,
    returnOrder._id && typeof returnOrder._id.toString === 'function' ? returnOrder._id.toString() : returnOrder._id,
    returnOrder.code,
    returnOrder.returnOrderId,
    returnOrder.returnOrderCode,
    returnOrder.sourceId,
    returnOrder.sourceCode
  ].map(clean).filter(Boolean));
}

function salesOrderKeys(returnOrder = {}) {
  return new Set([
    returnOrder.orderId,
    returnOrder.orderCode,
    returnOrder.salesOrderId,
    returnOrder.salesOrderCode,
    returnOrder.sourceOrderId,
    returnOrder.sourceOrderCode
  ].map(clean).filter(Boolean));
}

function findReturnOrderForLedger(row = {}, returnOrders = []) {
  const ledgerKeys = new Set([
    row.returnOrderId,
    row.returnOrderCode,
    row.sourceId,
    row.sourceCode,
    row.refId,
    row.refCode,
    returnOrderKey(row)
  ].map(clean).filter(Boolean));
  const orderKeys = new Set([row.orderId, row.orderCode, row.salesOrderId, row.salesOrderCode, row.sourceOrderId, row.sourceOrderCode].map(clean).filter(Boolean));
  return (returnOrders || []).find((returnOrder) => {
    const roKeys = returnOrderKeys(returnOrder);
    for (const key of ledgerKeys) if (roKeys.has(key)) return true;
    const soKeys = salesOrderKeys(returnOrder);
    for (const key of orderKeys) if (soKeys.has(key)) return true;
    return false;
  }) || null;
}

function sourcePoints(row = {}, returnOrder = null) {
  const sourceModel = clean(row.sourceModel).toLowerCase();
  const source = clean(row.source).toLowerCase();
  const sourceType = clean(row.sourceType || row.refType).toLowerCase();
  const pointsToReturnOrders = sourceModel === 'returnorders'
    || source === 'returnorders'
    || sourceType === 'returnorder'
    || sourceType === 'return_order';
  if (!pointsToReturnOrders) return false;
  if (!returnOrder) return true;
  const keys = returnOrderKeys(returnOrder);
  return [row.sourceId, row.sourceCode, row.returnOrderId, row.returnOrderCode, row.refId, row.refCode]
    .map(clean)
    .filter(Boolean)
    .some((key) => keys.has(key));
}

function hasDebitDirectionConflict(row = {}) {
  return toNumber(row.debit) > 0 && clean(row.direction).toLowerCase() === 'credit';
}

function scoreLedgerForCanonical(row = {}, returnOrder = null) {
  const evidence = [];
  let score = 0;
  const batch = clean(row.accountingBatchId);

  if (sourcePoints(row, returnOrder)) { score += 30; evidence.push('+30 source/sourceModel/sourceType trỏ đúng returnOrders'); }
  if (returnOrder && returnOrderAmount(returnOrder) > 0 && amountOf(row) === returnOrderAmount(returnOrder)) { score += 25; evidence.push('+25 amount khớp returnOrder'); }
  if (batch && /^ACC/i.test(batch)) { score += 20; evidence.push('+20 accountingBatchId bắt đầu bằng ACC'); }
  else if (!/REV/i.test(batch)) { score += 20; evidence.push('+20 accountingBatchId không chứa REV'); }
  if (row.accountingConfirmed === true && clean(row.accountingStatus).toLowerCase() === 'confirmed') { score += 15; evidence.push('+15 accountingConfirmed=true và accountingStatus=confirmed'); }
  if (clean(row.status).toLowerCase() === 'posted') { score += 10; evidence.push('+10 status=posted'); }
  if (clean(row.customerCode || row.customerId)) { score += 10; evidence.push('+10 có customerCode/customerId đầy đủ'); }
  if (clean(row.salesOrderId || row.orderId || row.salesOrderCode || row.orderCode)) { score += 10; evidence.push('+10 có salesOrderId/orderId đầy đủ'); }
  if (/REV/i.test(batch)) { score -= 50; evidence.push('-50 accountingBatchId chứa REV'); }
  if (containsRevMarker(row.id) || containsRevMarker(row.code)) { score -= 50; evidence.push('-50 code/id chứa REV'); }
  if (hasDebitDirectionConflict(row)) { score -= 100; evidence.push('-100 debit/direction conflict'); }

  return { score, evidence };
}

function groupDuplicateActiveArReturns(ledgers = []) {
  const activeArReturns = (ledgers || []).filter((row) => isArReturn(row) && isActiveLedgerDoc(row, { extraInactiveStatuses: ['duplicate_cancelled', 'draft'] }));
  const groups = new Map();
  for (const row of activeArReturns) {
    const key = clean(row.idempotencyKey) || arReturnBusinessKey(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({ key, rows }));
}

function buildLedgerFingerprint(row = {}) {
  return {
    objectId: ledgerObjectId(row),
    sha256: hash({
      _id: objectIdOf(row),
      id: clean(row.id),
      code: clean(row.code),
      idempotencyKey: clean(row.idempotencyKey),
      amount: amountOf(row),
      debit: toNumber(row.debit),
      credit: toNumber(row.credit),
      direction: clean(row.direction),
      accountingBatchId: clean(row.accountingBatchId),
      status: clean(row.status),
      accountingStatus: clean(row.accountingStatus)
    })
  };
}

function stableRepairItemId(group = {}) {
  return `ARLEDGER-REPAIR-${hash({ key: group.key, ledgers: group.rows.map(ledgerObjectId).sort() }).slice(0, 16)}`;
}

function chooseCanonical(rows = [], returnOrders = []) {
  const scored = rows.map((row) => {
    const returnOrder = findReturnOrderForLedger(row, returnOrders);
    const score = scoreLedgerForCanonical(row, returnOrder);
    return { row, returnOrder, ...score };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aAcc = /^ACC/i.test(clean(a.row.accountingBatchId)) ? 1 : 0;
    const bAcc = /^ACC/i.test(clean(b.row.accountingBatchId)) ? 1 : 0;
    if (bAcc !== aAcc) return bAcc - aAcc;
    const aRev = containsRevMarker(a.row.id) || containsRevMarker(a.row.code) || /REV/i.test(clean(a.row.accountingBatchId)) ? 1 : 0;
    const bRev = containsRevMarker(b.row.id) || containsRevMarker(b.row.code) || /REV/i.test(clean(b.row.accountingBatchId)) ? 1 : 0;
    if (aRev !== bRev) return aRev - bRev;
    return clean(ledgerObjectId(a.row)).localeCompare(clean(ledgerObjectId(b.row)));
  });
  return { selected: scored[0] || null, scored };
}

function expectedNet(rows = []) {
  return rows.reduce((sum, row) => sum + ledgerEffect(row), 0);
}

function summarizeScore(item = {}) {
  return {
    ledgerObjectId: ledgerObjectId(item.row),
    id: clean(item.row.id),
    code: clean(item.row.code),
    accountingBatchId: clean(item.row.accountingBatchId),
    score: item.score,
    evidence: item.evidence
  };
}

function buildPlanItem(group = {}, returnOrders = [], options = {}) {
  const now = options.createdAt || new Date().toISOString();
  const { selected, scored } = chooseCanonical(group.rows, returnOrders);
  const top = selected;
  const second = scored[1] || null;
  const hasSameAmount = new Set(group.rows.map(amountOf)).size === 1;
  const hasPositiveAmount = group.rows.every((row) => amountOf(row) > 0);
  const topSafe = top && top.score >= 60 && !(containsRevMarker(top.row.id) || containsRevMarker(top.row.code) || /REV/i.test(clean(top.row.accountingBatchId))) && !hasDebitDirectionConflict(top.row);
  const decisive = top && (!second || top.score - second.score >= 25 || /^ACC/i.test(clean(top.row.accountingBatchId)));
  const manualReviewRequired = !(hasSameAmount && hasPositiveAmount && topSafe && decisive);
  const manualReviewReason = manualReviewRequired
    ? [
      !hasSameAmount ? 'amounts_are_not_identical' : '',
      !hasPositiveAmount ? 'zero_or_negative_amount_present' : '',
      !topSafe ? 'canonical_score_or_safety_not_enough' : '',
      !decisive ? 'canonical_score_not_decisive' : ''
    ].filter(Boolean).join(';')
    : '';

  const canonical = top ? top.row : null;
  const ledgersToVoid = manualReviewRequired || !canonical ? [] : group.rows
    .filter((row) => ledgerObjectId(row) !== ledgerObjectId(canonical))
    .map(summarizeLedger);

  return {
    repairItemId: stableRepairItemId(group),
    repairType: 'VOID_DUPLICATE_ACTIVE_AR_RETURN',
    severity: 'P0',
    tenantId: clean(canonical?.tenantId || group.rows[0]?.tenantId),
    returnOrderId: clean(canonical?.returnOrderId || canonical?.returnOrderCode || sourceKey(canonical || group.rows[0])),
    customerCode: customerKey(canonical || group.rows[0]),
    idempotencyKey: clean(canonical?.idempotencyKey || group.key),
    canonicalLedgerObjectId: canonical ? ledgerObjectId(canonical) : '',
    canonicalReason: top ? {
      selected: summarizeScore(top),
      ranked: scored.map(summarizeScore)
    } : null,
    ledgersToVoid,
    ledgersToNormalize: [],
    ledgersToSkip: manualReviewRequired ? group.rows.map(summarizeLedger) : [],
    expectedBefore: {
      activeCount: group.rows.length,
      netImpact: expectedNet(group.rows),
      ledgers: group.rows.map(summarizeLedger)
    },
    expectedAfter: {
      activeCount: canonical ? 1 : 0,
      netImpact: canonical ? ledgerEffect(canonical) : 0,
      canonicalLedgerObjectId: canonical ? ledgerObjectId(canonical) : ''
    },
    manualReviewRequired,
    manualReviewReason,
    fingerprints: {
      groupSha256: hash(group.rows.map(buildLedgerFingerprint)),
      ledgers: group.rows.map(buildLedgerFingerprint)
    },
    safetyChecks: {
      sameAmount: hasSameAmount,
      positiveAmount: hasPositiveAmount,
      canonicalDoesNotContainRev: Boolean(canonical && !(containsRevMarker(canonical.id) || containsRevMarker(canonical.code))),
      canonicalBatchNotRev: Boolean(canonical && !/REV/i.test(clean(canonical.accountingBatchId))),
      noCanonicalDebitDirectionConflict: Boolean(canonical && !hasDebitDirectionConflict(canonical)),
      decisiveCanonicalScore: Boolean(decisive)
    },
    createdAt: now
  };
}

function buildRepairPlan(ledgers = [], returnOrders = [], options = {}) {
  const duplicateGroups = groupDuplicateActiveArReturns(ledgers);
  const items = duplicateGroups.map((group) => buildPlanItem(group, returnOrders, options));
  return {
    mode: 'plan',
    readOnly: true,
    generatedAt: options.createdAt || new Date().toISOString(),
    totals: {
      duplicateGroups: duplicateGroups.length,
      repairItems: items.length,
      autoRepairable: items.filter((item) => item.manualReviewRequired !== true).length,
      manualReviewRequired: items.filter((item) => item.manualReviewRequired === true).length
    },
    repairItems: items
  };
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function writePlan(plan, options = {}) {
  const reportsDir = path.resolve(options.reportsDir || path.join(__dirname, '..', 'reports'));
  fs.mkdirSync(reportsDir, { recursive: true });
  const filePath = path.join(reportsDir, `ar-ledger-repair-plan-${options.stamp || timestampForFile()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(plan, null, 2));
  return filePath;
}

async function loadDbRows(limit = 0) {
  const ArLedger = require('../src/models/ArLedger');
  const ReturnOrder = require('../src/models/ReturnOrder');
  let ledgerQuery = ArLedger.find({})
    .select('_id id code tenantId type ledgerType category status lifecycleStatus accountingStatus accountingConfirmed accountingBatchId reversed isDeleted deleted deletedAt voidedAt supersededAt entryType sourceAction refType amount debit credit direction idempotencyKey source sourceType sourceModel sourceId sourceCode refId refCode returnOrderId returnOrderCode customerId customerCode customerName orderId orderCode salesOrderId salesOrderCode sourceOrderId sourceOrderCode createdAt updatedAt auditTrail')
    .lean();
  let returnQuery = ReturnOrder.find({})
    .select('_id id code tenantId returnOrderId returnOrderCode sourceId sourceCode amount debtReduction returnAmount totalReturnAmount totalAmount returnedAmount totalValue items customerId customerCode orderId orderCode salesOrderId salesOrderCode sourceOrderId sourceOrderCode')
    .lean();
  if (limit) {
    ledgerQuery = ledgerQuery.limit(limit);
    returnQuery = returnQuery.limit(limit);
  }
  const [ledgers, returnOrders] = await Promise.all([ledgerQuery, returnQuery]);
  return { ledgers, returnOrders };
}

function printHuman(plan, filePath) {
  console.log('AR ledger repair plan (read-only, không sửa DB)');
  console.log('='.repeat(72));
  console.log(`Repair items: ${plan.totals.repairItems}`);
  console.log(`Auto repairable: ${plan.totals.autoRepairable}`);
  console.log(`Manual review: ${plan.totals.manualReviewRequired}`);
  console.log(`Plan JSON: ${filePath}`);
  for (const item of plan.repairItems.slice(0, 20)) {
    console.log(`- ${item.repairItemId} | manual=${item.manualReviewRequired} | canonical=${item.canonicalLedgerObjectId} | void=${item.ledgersToVoid.length}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Math.max(0, Number(limitArg.split('=')[1]) || 0) : 0;
  await require('../src/config/db')();
  const { ledgers, returnOrders } = await loadDbRows(limit);
  const plan = buildRepairPlan(ledgers, returnOrders);
  const filePath = writePlan(plan);
  if (json) console.log(JSON.stringify({ ...plan, filePath }, null, 2));
  else printHuman(plan, filePath);
  await require('mongoose').connection.close();
  if (plan.totals.manualReviewRequired > 0) process.exitCode = 2;
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[plan-ar-ledger-repair] failed:', err.message);
    try { await require('mongoose').connection.close(); } catch (_) {}
    process.exit(1);
  });
}

module.exports = {
  buildRepairPlan,
  buildPlanItem,
  chooseCanonical,
  scoreLedgerForCanonical,
  groupDuplicateActiveArReturns,
  amountOf,
  returnOrderAmount,
  findReturnOrderForLedger,
  writePlan,
  hasDebitDirectionConflict
};
