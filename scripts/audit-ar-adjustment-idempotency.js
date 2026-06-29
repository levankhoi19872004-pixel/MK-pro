#!/usr/bin/env node
'use strict';

require('dotenv').config();

const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const {
  arAdjustmentLedgerQuery,
  summarizeArAdjustmentIdempotency
} = require('./lib/arAdjustmentIdempotencyAudit');

const args = new Set(process.argv.slice(2));
const json = args.has('--json');

async function main() {
  await connectDB();
  const rows = await ArLedger.find(arAdjustmentLedgerQuery())
    .select('_id id code type ledgerType category status accountingStatus reversed isDeleted deletedAt customerCode amount sourceType sourceId sourceCode correctionId correctionCode idempotencyKey reasonCode reasonText note isRollback rollbackOf createdAt updatedAt')
    .lean();
  const summary = summarizeArAdjustmentIdempotency(rows);
  if (json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log('[audit-ar-adjustment-idempotency] DRY RUN - không sửa dữ liệu');
    console.log(JSON.stringify(summary.totals, null, 2));
    if (summary.p0Cases.length) console.log(JSON.stringify(summary.p0Cases.slice(0, 50), null, 2));
  }
  await require('mongoose').connection.close();
  if (summary.totals.p0Cases) process.exitCode = 2;
}

main().catch(async (err) => {
  console.error('[audit-ar-adjustment-idempotency] failed:', err);
  try { await require('mongoose').connection.close(); } catch (_) {}
  process.exit(1);
});
