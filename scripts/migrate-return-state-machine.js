'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ReturnOrder = require('../src/models/ReturnOrder');
const ReturnStateMachine = require('../src/domain/lifecycle/ReturnStateMachine');

const WRITE = process.argv.includes('--write');
const BATCH_SIZE = 500;
const MIGRATION_AT = new Date().toISOString();

function valueChanged(current, next) {
  if (current instanceof Date) current = current.toISOString();
  if (next instanceof Date) next = next.toISOString();
  return JSON.stringify(current ?? null) !== JSON.stringify(next ?? null);
}

function buildCanonicalPatch(row = {}) {
  const state = ReturnStateMachine.getReturnState(row);
  const statePatch = ReturnStateMachine.patchForState(row, state);
  delete statePatch.updatedAt;
  delete statePatch.stateChangedAt;

  const patch = {
    ...statePatch,
    returnState: state,
    stateChangedAt: row.stateChangedAt || row.updatedAt || row.createdAt || MIGRATION_AT
  };

  const rawStatus = String(row.status || row.returnStatus || '').trim().toLowerCase();
  const isLegacyGrouped = ['grouped', 'merged'].includes(rawStatus);
  const hasMasterReturn = Boolean(row.masterReturnOrderId || row.masterReturnOrderCode);

  // grouped/merged chỉ là trạng thái gộp, không còn là lifecycle.
  if (isLegacyGrouped || hasMasterReturn) {
    patch.returnMergeStatus = 'merged';
  } else if (!row.returnMergeStatus) {
    patch.returnMergeStatus = 'unmerged';
  }

  return { state, patch };
}

async function flush(operations) {
  if (!operations.length) return;
  if (WRITE) await ReturnOrder.bulkWrite(operations, { ordered: false });
  operations.length = 0;
}

async function main() {
  await connectDB();

  const cursor = ReturnOrder.find({}).lean().cursor();
  const operations = [];
  const summary = {
    ok: true,
    mode: WRITE ? 'write' : 'dry-run',
    scanned: 0,
    changed: 0,
    unchanged: 0,
    legacyGrouped: 0,
    targetStates: {}
  };

  for await (const row of cursor) {
    summary.scanned += 1;
    const rawStatus = String(row.status || row.returnStatus || '').trim().toLowerCase();
    if (['grouped', 'merged'].includes(rawStatus)) summary.legacyGrouped += 1;

    const { state, patch } = buildCanonicalPatch(row);
    summary.targetStates[state] = (summary.targetStates[state] || 0) + 1;

    const changed = Object.entries(patch).some(([key, value]) => valueChanged(row[key], value));
    if (!changed) {
      summary.unchanged += 1;
      continue;
    }

    summary.changed += 1;
    patch.updatedAt = MIGRATION_AT;
    operations.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: patch }
      }
    });

    if (operations.length >= BATCH_SIZE) await flush(operations);
  }

  await flush(operations);
  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
