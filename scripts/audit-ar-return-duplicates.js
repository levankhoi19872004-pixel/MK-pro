#!/usr/bin/env node
'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const {
  arReturnLedgerQuery,
  activeArReturnDuplicateGroups
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

const json = has('--json');
const orderCode = String(valueOf('--orderCode') || '').trim();
const returnOrderId = String(valueOf('--returnOrderId') || '').trim();
const limit = Math.max(0, Number(valueOf('--limit') || 0) || 0);

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

function printHuman(groups) {
  console.log('AR-RETURN duplicate active audit (read-only, không sửa dữ liệu)');
  console.log('='.repeat(72));
  console.log(`Filter orderCode=${orderCode || '*'} returnOrderId=${returnOrderId || '*'}`);
  console.log(`Duplicate active groups: ${groups.length}`);
  for (const group of groups) {
    console.log('\n[P0] duplicate_active_returnOrder_business_dimension');
    console.log(`- key          : ${group.key}`);
    console.log(`- returnOrder  : ${group.returnOrderKey || '(empty)'}`);
    console.log(`- orderCode    : ${group.orderCode || '(empty)'}`);
    console.log(`- customerCode : ${group.customerCode || '(empty)'}`);
    console.log(`- count        : ${group.count}`);
    for (const row of group.rows) {
      console.log(`  • ${row.code || row.id || row._id || '(no-code)'} | amount=${row.credit || row.amount || 0} | idem=${row.idempotencyKey || '(missing)'} | status=${row.status || '(empty)'} | batch=${row.accountingBatchId || '(empty)'} | created=${row.createdAt || '(empty)'}`);
    }
  }
  if (groups.length) {
    console.log('\nRepair dry-run: node scripts/repair-ar-return-duplicates.js --dry-run --orderCode <ORDER_CODE>');
    console.log('Repair apply  : node scripts/repair-ar-return-duplicates.js --apply --orderCode <ORDER_CODE>');
  }
}

async function main() {
  await connectDB();
  let query = ArLedger.find(buildFilter())
    .select('_id id code type ledgerType category status lifecycleStatus accountingStatus reversed isDeleted deletedAt sourceType sourceId sourceCode refId refCode returnOrderId returnOrderCode idempotencyKey amount debit credit customerCode customerId orderId orderCode salesOrderId salesOrderCode sourceOrderId sourceOrderCode accountingBatchId createdAt updatedAt')
    .lean();
  if (limit) query = query.limit(limit);
  const rows = await query;
  const groups = activeArReturnDuplicateGroups(rows);
  if (json) {
    console.log(JSON.stringify({ mode: 'audit', readOnly: true, generatedAt: new Date().toISOString(), filters: { orderCode, returnOrderId, limit }, duplicateGroups: groups }, null, 2));
  } else {
    printHuman(groups);
  }
  await mongoose.connection.close();
  process.exit(groups.length ? 2 : 0);
}

main().catch(async (err) => {
  console.error('[audit-ar-return-duplicates] failed:', err.message);
  try { await mongoose.connection.close(); } catch (_) {}
  process.exit(1);
});
