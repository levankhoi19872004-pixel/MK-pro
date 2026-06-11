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

async function findDuplicates(Model, field) {
  return Model.aggregate([
    { $match: { [field]: { $exists: true, $nin: ['', null] } } },
    {
      $group: {
        _id: `$${field}`,
        count: { $sum: 1 },
        ids: { $push: '$_id' },
        samples: { $push: { id: '$id', code: '$code', createdAt: '$createdAt' } }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 100 }
  ]);
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGODB_URI');

  await mongoose.connect(uri);

  let total = 0;

  for (const [collectionKey, field] of TARGETS) {
    const Model = MongoStore[collectionKey];
    if (!Model) continue;

    const duplicates = await findDuplicates(Model, field);
    total += duplicates.length;

    console.log(`\n[${collectionKey}.${field}] duplicates=${duplicates.length}`);

    for (const item of duplicates) {
      console.log(JSON.stringify({
        value: item._id,
        count: item.count,
        ids: item.ids,
        samples: item.samples.slice(0, 5)
      }, null, 2));
    }
  }

  console.log(`\nTOTAL_DUPLICATE_KEYS=${total}`);
  await mongoose.disconnect();

  if (total > 0) process.exitCode = 2;
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
