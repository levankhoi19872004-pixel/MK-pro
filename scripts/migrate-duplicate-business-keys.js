'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const MongoStore = require('../src/models');

const TARGETS = [
  ['products', 'code'],
  ['customers', 'code'],
  ['users', 'username'],
  ['users', 'staffCode'],
  ['salesOrders', 'id'],
  ['salesOrders', 'code'],
  ['masterOrders', 'id'],
  ['masterOrders', 'code'],
  ['returnOrders', 'id'],
  ['returnOrders', 'code'],
  ['masterReturnOrders', 'id'],
  ['masterReturnOrders', 'code'],
  ['receipts', 'id'],
  ['receipts', 'code'],
  ['arLedgers', 'id'],
  ['arLedgers', 'code'],
  ['fundLedgers', 'id'],
  ['fundLedgers', 'code'],
  ['deliveryCashSubmissions', 'id'],
  ['deliveryCashSubmissions', 'code'],
  ['expenseVouchers', 'id'],
  ['expenseVouchers', 'code'],
  ['fundTransfers', 'id'],
  ['fundTransfers', 'code']
];

const MANUAL_MERGE_TARGETS = new Set([
  'products.code',
  'customers.code',
  'users.username',
  'users.staffCode'
]);

async function migrateField(Model, collectionKey, field, dryRun) {
  const duplicates = await Model.aggregate([
    { $match: { [field]: { $exists: true, $nin: ['', null] } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } }
  ]);

  let changed = 0;

  for (const dup of duplicates) {
    const idsToChange = dup.ids.slice(1);

    for (const _id of idsToChange) {
      const suffix = String(_id).slice(-6);
      const newValue = `${dup._id}-DUP-${suffix}`;

      console.log(`[${dryRun ? 'DRY' : 'FIX'}] ${collectionKey}.${field}: ${dup._id} -> ${newValue}`);

      if (!dryRun) {
        await Model.updateOne(
          { _id },
          {
            $set: {
              [field]: newValue,
              duplicateBusinessKeyMigratedAt: new Date(),
              duplicateBusinessKeyOriginalValue: dup._id
            }
          }
        );
      }

      changed += 1;
    }
  }

  return changed;
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGODB_URI');

  const dryRun = !process.argv.includes('--write');

  await mongoose.connect(uri);

  let totalChanged = 0;

  for (const [collectionKey, field] of TARGETS) {
    const Model = MongoStore[collectionKey];
    if (!Model) continue;
    const targetKey = `${collectionKey}.${field}`;
    if (MANUAL_MERGE_TARGETS.has(targetKey)) {
      console.log(`[SKIP] ${targetKey}: dữ liệu danh mục/nhân sự phải chọn bản ghi canonical và merge thủ công; không tự đổi business code.`);
      continue;
    }
    totalChanged += await migrateField(Model, collectionKey, field, dryRun);
  }

  console.log({ dryRun, totalChanged });

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
