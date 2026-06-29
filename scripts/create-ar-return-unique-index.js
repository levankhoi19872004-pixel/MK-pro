#!/usr/bin/env node
'use strict';

require('dotenv').config();

const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const {
  arReturnLedgerQuery,
  summarizeArReturnIdempotency,
  hasBlockingIssues
} = require('./lib/arReturnIdempotencyAudit');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply') || args.has('--write');
const json = args.has('--json');

const UNIQUE_INDEX_FIELDS = { idempotencyKey: 1 };
const UNIQUE_INDEX_OPTIONS = {
  unique: true,
  name: 'uniq_arledger_idempotencyKey',
  partialFilterExpression: {
    idempotencyKey: { $exists: true, $type: 'string' }
  }
};

async function runAudit() {
  const arReturnRows = await ArLedger.find(arReturnLedgerQuery())
    .select('_id id code type ledgerType category status reversed isDeleted deletedAt sourceType sourceId sourceCode refId refCode returnOrderId returnOrderCode idempotencyKey amount credit customerCode customerId createdAt updatedAt')
    .lean();
  const globalRows = await ArLedger.find({ idempotencyKey: { $exists: true, $type: 'string', $ne: '' } })
    .select('_id id code type ledgerType category status sourceType sourceId sourceCode returnOrderId returnOrderCode idempotencyKey')
    .lean();
  return summarizeArReturnIdempotency(arReturnRows, globalRows);
}

function sameKey(left = {}, right = {}) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = stable(value[key]);
    return acc;
  }, {});
}

function sameOptions(existing = {}, expected = {}) {
  return Boolean(existing.unique) === Boolean(expected.unique)
    && JSON.stringify(stable(existing.partialFilterExpression || null)) === JSON.stringify(stable(expected.partialFilterExpression || null));
}

async function main() {
  await connectDB();
  const audit = await runAudit();
  const response = {
    mode: apply ? 'apply' : 'dry-run',
    audit,
    index: { fields: UNIQUE_INDEX_FIELDS, options: UNIQUE_INDEX_OPTIONS },
    created: false,
    skipped: false,
    ok: false
  };

  if (hasBlockingIssues(audit)) {
    response.skipped = true;
    response.reason = 'AUDIT_NOT_CLEAN';
    response.message = 'Dừng tạo unique index vì audit còn duplicate/thiếu khóa P0. Không tự sửa/xóa dữ liệu.';
    if (json) console.log(JSON.stringify(response, null, 2));
    else {
      console.error(response.message);
      console.error(JSON.stringify(audit.totals, null, 2));
    }
    await require('mongoose').connection.close();
    process.exit(2);
  }

  const existingIndexes = await ArLedger.collection.indexes();
  const sameName = existingIndexes.find((idx) => idx.name === UNIQUE_INDEX_OPTIONS.name);
  if (sameName && (!sameKey(sameName.key, UNIQUE_INDEX_FIELDS) || !sameOptions(sameName, UNIQUE_INDEX_OPTIONS))) {
    response.skipped = true;
    response.reason = 'INDEX_NAME_CONFLICT';
    response.conflict = sameName;
    if (json) console.log(JSON.stringify(response, null, 2));
    else console.error(`Dừng vì index ${UNIQUE_INDEX_OPTIONS.name} đã tồn tại nhưng khác spec.`);
    await require('mongoose').connection.close();
    process.exit(3);
  }
  if (sameName && sameKey(sameName.key, UNIQUE_INDEX_FIELDS) && sameOptions(sameName, UNIQUE_INDEX_OPTIONS)) {
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
    response.message = 'Audit sạch. Chạy lại với --apply để tạo unique index.';
    if (json) console.log(JSON.stringify(response, null, 2));
    else console.log(response.message);
    await require('mongoose').connection.close();
    return;
  }

  const createdName = await ArLedger.collection.createIndex(UNIQUE_INDEX_FIELDS, { background: true, ...UNIQUE_INDEX_OPTIONS });
  response.ok = true;
  response.created = true;
  response.indexName = createdName;
  if (json) console.log(JSON.stringify(response, null, 2));
  else console.log(`Đã tạo unique index an toàn: ${createdName}`);
  await require('mongoose').connection.close();
}

main().catch(async (err) => {
  console.error('[create-ar-return-unique-index] failed:', err);
  try { await require('mongoose').connection.close(); } catch (_) {}
  process.exit(1);
});
