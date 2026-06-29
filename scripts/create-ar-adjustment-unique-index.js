#!/usr/bin/env node
'use strict';

require('dotenv').config();

const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const {
  arAdjustmentLedgerQuery,
  summarizeArAdjustmentIdempotency,
  hasBlockingIssues
} = require('./lib/arAdjustmentIdempotencyAudit');
const { requireApplyConfirmation } = require('./lib/scriptSafety');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply') || args.has('--write');
if (apply) {
  requireApplyConfirmation({
    args: process.argv.slice(2),
    scriptName: 'create-ar-adjustment-unique-index.js',
    requiredFlags: ['--confirm-create-index'],
    danger: 'This script creates a unique AR-ADJUSTMENT idempotency index. It must only run after audit blockers are clean.'
  });
}
const json = args.has('--json');

const UNIQUE_INDEX_FIELDS = { idempotencyKey: 1 };
const UNIQUE_INDEX_OPTIONS = {
  unique: true,
  name: 'uniq_ar_adjustment_idempotencyKey',
  partialFilterExpression: {
    type: 'AR-ADJUSTMENT',
    idempotencyKey: { $exists: true, $type: 'string' }
  }
};

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = stable(value[key]);
    return acc;
  }, {});
}

function same(left = {}, right = {}) {
  return JSON.stringify(stable(left || {})) === JSON.stringify(stable(right || {}));
}

async function main() {
  await connectDB();
  const rows = await ArLedger.find(arAdjustmentLedgerQuery())
    .select('_id id code type ledgerType category status accountingStatus reversed isDeleted deletedAt customerCode amount sourceType sourceId sourceCode correctionId correctionCode idempotencyKey reasonCode reasonText note isRollback rollbackOf createdAt updatedAt')
    .lean();
  const audit = summarizeArAdjustmentIdempotency(rows);
  const response = { mode: apply ? 'apply' : 'dry-run', audit, index: { fields: UNIQUE_INDEX_FIELDS, options: UNIQUE_INDEX_OPTIONS }, ok: false, created: false, skipped: false };

  if (hasBlockingIssues(audit)) {
    response.skipped = true;
    response.reason = 'AUDIT_NOT_CLEAN';
    response.message = 'Dừng tạo unique index AR-ADJUSTMENT vì audit còn duplicate/thiếu khóa P0. Không tự sửa/xóa dữ liệu.';
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.error(response.message);
      console.error(JSON.stringify(audit.totals, null, 2));
    }
    await require('mongoose').connection.close();
    process.exit(2);
  }

  const indexes = await ArLedger.collection.indexes();
  const existing = indexes.find((idx) => idx.name === UNIQUE_INDEX_OPTIONS.name);
  if (existing && (!same(existing.key, UNIQUE_INDEX_FIELDS) || !same(existing.partialFilterExpression || null, UNIQUE_INDEX_OPTIONS.partialFilterExpression || null) || !existing.unique)) {
    response.skipped = true;
    response.reason = 'INDEX_NAME_CONFLICT';
    response.conflict = existing;
    if (json) console.log(JSON.stringify(response, null, 2));
    else console.error(`Dừng vì index ${UNIQUE_INDEX_OPTIONS.name} đã tồn tại nhưng khác spec.`);
    await require('mongoose').connection.close();
    process.exit(3);
  }
  if (existing) {
    response.ok = true;
    response.skipped = true;
    response.reason = 'UNIQUE_INDEX_ALREADY_EXISTS';
    if (json) console.log(JSON.stringify(response, null, 2));
    else console.log(`Unique index đã tồn tại: ${UNIQUE_INDEX_OPTIONS.name}`);
    await require('mongoose').connection.close();
    return;
  }
  if (!apply) {
    response.ok = true;
    response.skipped = true;
    response.reason = 'DRY_RUN_CLEAN';
    response.message = 'Audit sạch. Chạy lại với --apply --confirm-create-index để tạo unique index AR-ADJUSTMENT.';
    if (json) console.log(JSON.stringify(response, null, 2));
    else console.log(response.message);
    await require('mongoose').connection.close();
    return;
  }

  const name = await ArLedger.collection.createIndex(UNIQUE_INDEX_FIELDS, { background: true, ...UNIQUE_INDEX_OPTIONS });
  response.ok = true;
  response.created = true;
  response.indexName = name;
  if (json) console.log(JSON.stringify(response, null, 2));
  else console.log(`Đã tạo unique index AR-ADJUSTMENT an toàn: ${name}`);
  await require('mongoose').connection.close();
}

main().catch(async (err) => {
  console.error('[create-ar-adjustment-unique-index] failed:', err);
  try { await require('mongoose').connection.close(); } catch (_) {}
  process.exit(1);
});
