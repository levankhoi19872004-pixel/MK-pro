#!/usr/bin/env node
'use strict';

require('dotenv').config();
const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const { auditCursor } = require('./lib/arLedgerIdempotencyAudit');
const { requireApplyConfirmation } = require('./lib/scriptSafety');
const { AR_LEDGER_IDEMPOTENCY_UNIQUE_INDEX } = require('../src/domain/ar/arLedgerIdempotencyIndexContract');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply') || args.has('--write');
const json = args.has('--json');
if (apply) {
  requireApplyConfirmation({
    args: process.argv.slice(2),
    scriptName: 'create-ar-ledger-idempotency-unique-index.js',
    requiredFlags: ['--confirm-create-index'],
    danger: 'Creates the global unique partial arLedgers idempotency index. Run only after a clean duplicate audit and an approved maintenance window.'
  });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = stable(value[key]);
    return acc;
  }, {});
}
function same(left, right) {
  return JSON.stringify(stable(left || null)) === JSON.stringify(stable(right || null));
}

async function runAudit() {
  const cursor = ArLedger.find({ idempotencyKey: { $exists: true } })
    .select('_id id code idempotencyKey account category ledgerType entryType type direction amount debit credit customerId customerCode orderId orderCode salesOrderId salesOrderCode sourceType sourceId sourceCode sourceModel refType refId refCode returnOrderId returnOrderCode correctionId correctionCode accountingStatus accountingConfirmed active reversed isDeleted deleted')
    .lean()
    .cursor();
  return auditCursor(cursor);
}

async function main() {
  await connectDB();
  const spec = AR_LEDGER_IDEMPOTENCY_UNIQUE_INDEX;
  const audit = await runAudit();
  const output = {
    mode: apply ? 'apply' : 'dry-run',
    deploymentStateBefore: 'PENDING_PRODUCTION_APPLY',
    index: { fields: spec.fields, options: spec.options },
    audit,
    created: false,
    verified: false,
    droppedIndexes: [],
    ok: false
  };

  if (!audit.clean) {
    output.reason = 'AUDIT_NOT_CLEAN';
    output.message = 'Dừng: duplicate/malformed idempotency data chưa sạch. Script không tự xóa hoặc merge ledger.';
    console.log(JSON.stringify(output, null, 2));
    await require('mongoose').connection.close();
    process.exit(2);
  }

  const indexes = await ArLedger.collection.indexes();
  const sameName = indexes.find((index) => index.name === spec.options.name);
  if (sameName && (!same(sameName.key, spec.fields)
    || sameName.unique !== true
    || !same(sameName.partialFilterExpression, spec.options.partialFilterExpression))) {
    output.reason = 'INDEX_NAME_CONFLICT';
    output.conflict = sameName;
    console.log(JSON.stringify(output, null, 2));
    await require('mongoose').connection.close();
    process.exit(3);
  }

  if (sameName) {
    output.ok = true;
    output.verified = true;
    output.reason = 'UNIQUE_INDEX_ALREADY_EXISTS';
    output.deploymentStateAfter = 'VERIFIED_APPLIED';
    console.log(JSON.stringify(output, null, 2));
    await require('mongoose').connection.close();
    return;
  }

  if (!apply) {
    output.ok = true;
    output.reason = 'DRY_RUN_CLEAN';
    output.message = 'Audit sạch. Chưa tạo index. Dùng --apply --confirm-create-index trong maintenance window đã phê duyệt.';
    output.deploymentStateAfter = 'PENDING_PRODUCTION_APPLY';
    console.log(JSON.stringify(output, null, 2));
    await require('mongoose').connection.close();
    return;
  }

  const createdName = await ArLedger.collection.createIndex(spec.fields, { background: true, ...spec.options });
  const afterIndexes = await ArLedger.collection.indexes();
  const verified = afterIndexes.find((index) => index.name === createdName);
  if (!verified || verified.unique !== true || !same(verified.key, spec.fields)
    || !same(verified.partialFilterExpression, spec.options.partialFilterExpression)) {
    const error = new Error(`Index ${createdName} được tạo nhưng verify spec thất bại.`);
    error.code = 'INDEX_VERIFY_FAILED';
    throw error;
  }

  output.ok = true;
  output.created = true;
  output.verified = true;
  output.indexName = createdName;
  output.deploymentStateAfter = 'VERIFIED_APPLIED';
  console.log(JSON.stringify(output, null, 2));
  await require('mongoose').connection.close();
}

main().catch(async (error) => {
  console.error('[create-ar-ledger-idempotency-unique-index] failed:', error);
  try { await require('mongoose').connection.close(); } catch (_) {}
  process.exit(1);
});

module.exports = { runAudit };
