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

async function buildReferenceSummary(collectionKey, field, value) {
  const summary = {};
  if (collectionKey === 'products' && field === 'code') {
    summary.inventoryRows = await MongoStore.inventories.countDocuments({ productCode: value });
    summary.stockTransactions = await MongoStore.stockTransactions.countDocuments({ productCode: value });
    summary.salesOrders = await MongoStore.salesOrders.countDocuments({ 'items.productCode': value });
    summary.returnOrders = await MongoStore.returnOrders.countDocuments({ 'items.productCode': value });
  } else if (collectionKey === 'customers' && field === 'code') {
    summary.salesOrders = await MongoStore.salesOrders.countDocuments({ customerCode: value });
    summary.returnOrders = await MongoStore.returnOrders.countDocuments({ customerCode: value });
    summary.arLedgers = await MongoStore.arLedgers.countDocuments({ customerCode: value });
    summary.receipts = await MongoStore.receipts.countDocuments({ customerCode: value });
  } else if (collectionKey === 'users' && ['staffCode', 'username'].includes(field)) {
    const staffFilter = field === 'staffCode'
      ? { $or: [{ salesStaffCode: value }, { deliveryStaffCode: value }] }
      : { createdBy: value };
    summary.salesOrders = await MongoStore.salesOrders.countDocuments(staffFilter);
    summary.returnOrders = await MongoStore.returnOrders.countDocuments(staffFilter);
    summary.arLedgers = await MongoStore.arLedgers.countDocuments(staffFilter);
  }
  return summary;
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
      const protectedMasterData = ['products', 'customers', 'users'].includes(collectionKey);
      const references = protectedMasterData
        ? await buildReferenceSummary(collectionKey, field, item._id)
        : {};
      console.log(JSON.stringify({
        value: item._id,
        count: item.count,
        ids: item.ids,
        samples: item.samples.slice(0, 5),
        resolution: protectedMasterData
          ? 'MANUAL_CANONICAL_MERGE_REQUIRED'
          : 'TRANSACTIONAL_KEY_RENAME_SUPPORTED',
        references
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
