'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

const TARGETS = [
  ['orders', ['idx_sales_orders_id', 'idx_orders_id', 'idx_orders_code']],
  ['arLedgers', ['idx_ar_ledgers_id', 'idx_ar_ledgers_code']],
  ['master_orders', ['idx_master_orders_id', 'idx_master_orders_code']],
  ['returnOrders', ['idx_return_orders_id', 'idx_return_orders_code']],
  ['fundLedgers', ['idx_fund_ledgers_id', 'idx_fund_ledgers_code']]
];

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGODB_URI');

  const dryRun = !process.argv.includes('--write');

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  for (const [collectionName, indexNames] of TARGETS) {
    const collection = db.collection(collectionName);
    const indexes = await collection.indexes();

    for (const name of indexNames) {
      if (!indexes.some((idx) => idx.name === name)) continue;

      console.log(`[${dryRun ? 'DRY' : 'DROP'}] ${collectionName}.${name}`);

      if (!dryRun) {
        await collection.dropIndex(name);
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
