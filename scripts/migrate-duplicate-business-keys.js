'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const MongoStore = require('../src/models');

const TARGETS = [
  ['salesOrders', 'id'],
  ['salesOrders', 'code'],
  ['arLedgers', 'id'],
  ['arLedgers', 'code'],
  ['masterOrders', 'id'],
  ['masterOrders', 'code'],
  ['returnOrders', 'id'],
  ['returnOrders', 'code'],
  ['fundLedgers', 'id'],
  ['fundLedgers', 'code']
];

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
