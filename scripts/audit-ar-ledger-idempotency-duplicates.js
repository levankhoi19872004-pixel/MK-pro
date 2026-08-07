#!/usr/bin/env node
'use strict';

require('dotenv').config();
const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const { auditCursor } = require('./lib/arLedgerIdempotencyAudit');

const args = new Set(process.argv.slice(2));
const json = args.has('--json');

async function runAudit() {
  const cursor = ArLedger.find({ idempotencyKey: { $exists: true } })
    .select('_id id code idempotencyKey account category ledgerType entryType type direction amount debit credit customerId customerCode orderId orderCode salesOrderId salesOrderCode sourceType sourceId sourceCode sourceModel refType refId refCode returnOrderId returnOrderCode correctionId correctionCode accountingStatus accountingConfirmed active reversed isDeleted deleted')
    .lean()
    .cursor();
  return auditCursor(cursor);
}

async function main() {
  await connectDB();
  const audit = await runAudit();
  const output = {
    mode: 'dry-run',
    collection: 'arLedgers',
    audit,
    actionTaken: 'NONE',
    note: 'Script chỉ audit; không xóa, merge, sửa ledger hoặc tạo/drop index.'
  };
  if (json) console.log(JSON.stringify(output, null, 2));
  else {
    console.log(JSON.stringify(output, null, 2));
    console.log(audit.clean ? 'AUDIT_CLEAN' : 'AUDIT_BLOCKED');
  }
  await require('mongoose').connection.close();
  process.exitCode = audit.clean ? 0 : 2;
}

main().catch(async (error) => {
  console.error('[audit-ar-ledger-idempotency-duplicates] failed:', error);
  try { await require('mongoose').connection.close(); } catch (_) {}
  process.exit(1);
});

module.exports = { runAudit };
