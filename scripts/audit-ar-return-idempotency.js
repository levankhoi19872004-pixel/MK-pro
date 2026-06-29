#!/usr/bin/env node
'use strict';

require('dotenv').config();

const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const {
  arReturnLedgerQuery,
  summarizeArReturnIdempotency
} = require('./lib/arReturnIdempotencyAudit');

const args = new Set(process.argv.slice(2));
const json = args.has('--json');
const strict = args.has('--strict');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 0) : 0;

async function loadRows() {
  const arQuery = ArLedger.find(arReturnLedgerQuery())
    .select('_id id code type ledgerType category status reversed isDeleted deletedAt sourceType sourceId sourceCode refId refCode returnOrderId returnOrderCode idempotencyKey amount credit customerCode customerId createdAt updatedAt')
    .lean();
  if (limit) arQuery.limit(limit);
  const arReturnRows = await arQuery;

  const globalQuery = ArLedger.find({ idempotencyKey: { $exists: true, $type: 'string', $ne: '' } })
    .select('_id id code type ledgerType category status sourceType sourceId sourceCode returnOrderId returnOrderCode idempotencyKey')
    .lean();
  if (limit) globalQuery.limit(limit * 5);
  const globalRows = await globalQuery;

  return { arReturnRows, globalRows };
}

function printHuman(summary) {
  const totals = summary.totals || {};
  console.log('AR-RETURN idempotency audit (dry-run, không sửa dữ liệu)');
  console.log('='.repeat(64));
  console.log(`Tổng AR-RETURN                         : ${totals.arReturn}`);
  console.log(`Tổng AR-RETURN active                  : ${totals.activeArReturn}`);
  console.log(`Thiếu idempotencyKey                   : ${totals.missingIdempotencyKey}`);
  console.log(`Thiếu sourceId/sourceCode              : ${totals.missingSourceIdOrSourceCode}`);
  console.log(`sourceType không canonical             : ${totals.nonCanonicalSourceType}`);
  console.log(`Duplicate idempotencyKey groups        : ${totals.duplicateIdempotencyKeyGroups}`);
  console.log(`Duplicate sourceType+sourceId groups   : ${totals.duplicateSourceGroups}`);
  console.log(`Duplicate returnOrderCode groups       : ${totals.duplicateReturnOrderCodeGroups}`);
  console.log(`Duplicate global idempotencyKey groups : ${totals.duplicateGlobalIdempotencyKeyGroups}`);
  console.log(`P0 cases                               : ${totals.p0Cases}`);
  if (summary.p0Cases && summary.p0Cases.length) {
    console.log('\nDanh sách case P0/P1 mẫu:');
    for (const item of summary.p0Cases.slice(0, 50)) {
      console.log(`- [${item.severity}] ${item.issue} | key=${item.key} | count=${item.count}`);
      for (const ex of (item.examples || []).slice(0, 3)) {
        console.log(`  • ${ex.code || ex.id || ex._id || '(no-code)'} | source=${ex.sourceType}:${ex.sourceId}/${ex.sourceCode} | idem=${ex.idempotencyKey || '(missing)'} | status=${ex.status || '(empty)'}`);
      }
    }
  }
}

async function main() {
  await connectDB();
  const { arReturnRows, globalRows } = await loadRows();
  const summary = summarizeArReturnIdempotency(arReturnRows, globalRows);
  summary.mode = 'dry-run';
  summary.commands = {
    audit: 'node scripts/audit-ar-return-idempotency.js --dry-run',
    auditJson: 'node scripts/audit-ar-return-idempotency.js --json',
    createUniqueDryRun: 'node scripts/create-ar-return-unique-index.js --dry-run',
    createUniqueApply: 'node scripts/create-ar-return-unique-index.js --apply --confirm-create-index'
  };

  if (json) console.log(JSON.stringify(summary, null, 2));
  else printHuman(summary);

  await require('mongoose').connection.close();
  if (strict && (summary.totals?.p0Cases || summary.totals?.duplicateGlobalIdempotencyKeyGroups)) process.exit(2);
}

main().catch(async (err) => {
  console.error('[audit-ar-return-idempotency] failed:', err);
  try { await require('mongoose').connection.close(); } catch (_) {}
  process.exit(1);
});
