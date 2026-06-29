#!/usr/bin/env node
'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const dateUtil = require('../src/utils/date.util');
const {
  arReturnLedgerQuery,
  clean,
  canonicalBusinessKey,
  isArReturnLedger,
  isInactiveArReturnLedger
} = require('./lib/arReturnIdempotencyAudit');

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (name) => {
  const prefix = `${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] || '' : '';
};

const apply = has('--apply');
const dryRun = !apply || has('--dry-run');
const json = has('--json');
const orderCode = clean(valueOf('--orderCode'));
const returnOrderId = clean(valueOf('--returnOrderId'));
const confirmedBy = clean(valueOf('--user')) || 'ar-return-duplicate-repair';
const now = dateUtil.nowIso();
const repairId = `AR-RETURN-DUP-REPAIR-${Date.now()}`;

function normalizedAmount(row = {}) {
  return Math.round(Math.max(0, Number(row.credit || row.amount || row.debit || 0) || 0));
}

function buildFilter() {
  const and = [arReturnLedgerQuery()];
  if (orderCode) {
    and.push({
      $or: [
        { orderCode }, { salesOrderCode: orderCode }, { sourceOrderCode: orderCode }, { refCode: orderCode },
        { masterOrderCode: orderCode }, { code: orderCode }
      ]
    });
  }
  if (returnOrderId) {
    and.push({
      $or: [
        { returnOrderId }, { returnOrderCode: returnOrderId }, { sourceId: returnOrderId }, { sourceCode: returnOrderId },
        { refId: returnOrderId }, { refCode: returnOrderId }, { id: returnOrderId }, { code: returnOrderId }
      ]
    });
  }
  return and.length === 1 ? and[0] : { $and: and };
}

function groupActiveDuplicates(rows = []) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!isArReturnLedger(row) || isInactiveArReturnLedger(row)) continue;
    const key = canonicalBusinessKey(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .filter(([, groupRows]) => groupRows.length > 1)
    .map(([key, groupRows]) => ({ key, rows: groupRows }));
}

function ledgerSortKey(row = {}) {
  return [
    row.createdAt ? String(row.createdAt) : '9999-12-31T23:59:59.999Z',
    row.updatedAt ? String(row.updatedAt) : '9999-12-31T23:59:59.999Z',
    clean(row.id || row.code || row._id)
  ].join('|');
}

function chooseCanonicalRow(rows = []) {
  const scored = [...rows].sort((a, b) => ledgerSortKey(a).localeCompare(ledgerSortKey(b)));
  return scored[0] || null;
}

function summarizeRow(row = {}) {
  return {
    _id: clean(row._id),
    id: clean(row.id),
    code: clean(row.code),
    amount: normalizedAmount(row),
    credit: Number(row.credit || 0),
    idempotencyKey: clean(row.idempotencyKey),
    status: clean(row.status),
    sourceType: clean(row.sourceType),
    sourceId: clean(row.sourceId),
    sourceCode: clean(row.sourceCode),
    returnOrderId: clean(row.returnOrderId),
    returnOrderCode: clean(row.returnOrderCode),
    orderCode: clean(row.orderCode || row.salesOrderCode || row.sourceOrderCode),
    customerCode: clean(row.customerCode || row.customerId),
    accountingBatchId: clean(row.accountingBatchId),
    createdAt: clean(row.createdAt)
  };
}

function planGroup(group = {}) {
  const rows = group.rows || [];
  const amounts = [...new Set(rows.map(normalizedAmount))];
  const keep = chooseCanonicalRow(rows);
  const duplicates = rows.filter((row) => row !== keep);
  const canAutoRepair = amounts.length === 1 && amounts[0] > 0 && keep && duplicates.length > 0;
  return {
    key: group.key,
    canAutoRepair,
    reason: canAutoRepair ? 'same_amount_same_business_dimension' : 'manual_review_required_amount_mismatch_or_zero',
    amounts,
    keep: summarizeRow(keep),
    reverseOrDeactivate: duplicates.map(summarizeRow),
    originalRows: rows,
    canonical: keep,
    duplicates
  };
}

function buildReversalRow(old = {}, index = 0) {
  const amount = normalizedAmount(old);
  const oldId = clean(old.id || old.code || old._id || `row-${index}`);
  return {
    ...old,
    _id: undefined,
    id: `AR-RETURN-DUP-REV-${oldId}-${repairId}`,
    code: `AR-RETURN-DUP-REV-${clean(old.code || old.id || old._id || index)}-${repairId}`,
    type: 'ar_return_reversal',
    ledgerType: 'AR-RETURN',
    category: 'AR-RETURN',
    direction: 'debit',
    debit: amount,
    credit: 0,
    amount,
    status: 'posted',
    reversed: false,
    isDeleted: false,
    source: 'ar_return_duplicate_repair',
    note: `Đảo dòng AR-RETURN trùng active ${old.code || old.id || ''}; giữ nguyên audit trail, không xóa ledger.`,
    reversedFromId: clean(old.id),
    reversedFromCode: clean(old.code),
    duplicateRepairId: repairId,
    accountingBatchId: repairId,
    createdBy: { name: confirmedBy },
    createdAt: now,
    updatedAt: now
  };
}

async function applyPlan(plan) {
  if (!plan.canAutoRepair) return { skipped: true, reason: plan.reason, updatedRows: 0, reversalRows: 0 };
  const reversalRows = plan.duplicates.map(buildReversalRow);
  for (const reversal of reversalRows) {
    await ArLedger.findOneAndUpdate(
      { $or: [{ id: reversal.id }, { code: reversal.code }] },
      { $set: reversal },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  let updatedRows = 0;
  for (const old of plan.duplicates) {
    const filter = old._id ? { _id: old._id } : { $or: [{ id: old.id }, { code: old.code }] };
    const result = await ArLedger.updateOne(filter, {
      $set: {
        reversed: true,
        status: 'reversed',
        reversedAt: now,
        reversedBy: confirmedBy,
        duplicateRepairId: repairId,
        updatedAt: now
      }
    });
    updatedRows += Number(result.modifiedCount || result.nModified || 0);
  }
  return { skipped: false, reason: plan.reason, updatedRows, reversalRows: reversalRows.length };
}

function printHuman(plans, results = []) {
  console.log(`AR-RETURN duplicate repair (${apply ? 'APPLY' : 'DRY RUN'}, không xóa ledger)`);
  console.log('='.repeat(72));
  console.log(`Filter orderCode=${orderCode || '*'} returnOrderId=${returnOrderId || '*'}`);
  console.log(`Duplicate groups: ${plans.length}`);
  for (const [idx, plan] of plans.entries()) {
    const result = results[idx] || {};
    console.log(`\n[${plan.canAutoRepair ? 'AUTO-REPAIRABLE' : 'MANUAL-REVIEW'}] ${plan.key}`);
    console.log(`- reason : ${plan.reason}`);
    console.log(`- keep   : ${plan.keep.code || plan.keep.id || plan.keep._id} amount=${plan.keep.amount} created=${plan.keep.createdAt || '(empty)'}`);
    for (const row of plan.reverseOrDeactivate) {
      console.log(`  reverse/deactivate: ${row.code || row.id || row._id} amount=${row.amount} created=${row.createdAt || '(empty)'}`);
    }
    if (apply) console.log(`- apply result: updatedRows=${result.updatedRows || 0} reversalRows=${result.reversalRows || 0} skipped=${result.skipped === true}`);
  }
  if (!apply) console.log('\nDry-run only. Apply with: node scripts/repair-ar-return-duplicates.js --apply --orderCode <ORDER_CODE>');
}

async function main() {
  if (apply && !orderCode && !returnOrderId) {
    throw new Error('Không cho phép --apply toàn bộ. Hãy truyền --orderCode hoặc --returnOrderId để khoanh vùng repair.');
  }
  await connectDB();
  const rows = await ArLedger.find(buildFilter())
    .select('_id id code type ledgerType category status lifecycleStatus accountingStatus reversed isDeleted deletedAt sourceType sourceId sourceCode refId refCode returnOrderId returnOrderCode idempotencyKey amount debit credit customerCode customerId orderId orderCode salesOrderId salesOrderCode sourceOrderId sourceOrderCode accountingBatchId createdAt updatedAt')
    .lean();
  const plans = groupActiveDuplicates(rows).map(planGroup);
  const results = [];
  if (apply) {
    for (const plan of plans) results.push(await applyPlan(plan));
  }
  const outputPlans = plans.map(({ originalRows, canonical, duplicates, ...safe }) => safe);
  if (json) {
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', repairId, filters: { orderCode, returnOrderId }, plans: outputPlans, results }, null, 2));
  } else {
    printHuman(outputPlans, results);
  }
  await mongoose.connection.close();
  const blockingManual = plans.some((plan) => !plan.canAutoRepair);
  process.exit(blockingManual ? 2 : 0);
}

main().catch(async (err) => {
  console.error('[repair-ar-return-duplicates] failed:', err.message);
  try { await mongoose.connection.close(); } catch (_) {}
  process.exit(1);
});
