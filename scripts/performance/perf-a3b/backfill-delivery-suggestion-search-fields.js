'use strict';

const { buildNormalizedSearchFields, SEARCH_VERSION } = require('../../../src/services/delivery/deliverySuggestionSearchContract');

function parseArgs(argv = process.argv.slice(2)) {
  const apply = argv.includes('--apply');
  const confirm = argv.includes('--confirm-backfill');
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const limit = Math.max(0, Number.parseInt(limitArg ? limitArg.split('=')[1] : '0', 10) || 0);
  return { apply, confirm, limit };
}

async function run() {
  const args = parseArgs();
  if (args.apply && !args.confirm) {
    const error = new Error('Backfill apply requires --apply --confirm-backfill.');
    error.code = 'PERF_A3B_BACKFILL_CONFIRMATION_REQUIRED';
    throw error;
  }
  const mongoose = require('mongoose');
  const SalesOrder = require('../../../src/models/SalesOrder');
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI/MONGODB_URI is required.');
  await mongoose.connect(uri);
  const filter = { $or: [
    { suggestSearchVersion: { $ne: SEARCH_VERSION } },
    { suggestOrderCodeNorm: { $exists: false } },
    { suggestCustomerCodeNorm: { $exists: false } }
  ] };
  const cursor = SalesOrder.find(filter).select([
    '_id', 'id', 'code', 'orderCode', 'salesOrderCode', 'customerCode', 'customerName',
    'customerPhone', 'phone', 'phoneNumber', 'customerAddress', 'address', 'deliveryAddress',
    'salesStaffCode', 'salesmanCode', 'nvbhCode', 'maNVBH',
    'deliveryStaffCode', 'deliveryCode', 'nvghCode', 'maNVGH'
  ].join(' ')).lean().cursor();
  let scanned = 0;
  let changed = 0;
  const samples = [];
  for await (const row of cursor) {
    scanned += 1;
    const patch = buildNormalizedSearchFields(row);
    changed += 1;
    if (samples.length < 10) samples.push({ _id: String(row._id), orderCode: row.orderCode || row.code || row.id, patch });
    if (args.apply) await SalesOrder.updateOne({ _id: row._id }, { $set: patch });
    if (args.limit && scanned >= args.limit) break;
  }
  console.log(JSON.stringify({ mode: args.apply ? 'APPLY' : 'DRY_RUN', scanned, changed, searchVersion: SEARCH_VERSION, samples }, null, 2));
  await mongoose.disconnect();
}

if (require.main === module) run().catch((error) => {
  console.error(JSON.stringify({ ok: false, code: error.code || 'PERF_A3B_BACKFILL_FAILED', message: error.message }, null, 2));
  process.exitCode = 1;
});

module.exports = { parseArgs };
