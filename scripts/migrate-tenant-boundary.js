'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const models = require('../src/models');
const { DEFAULT_TENANT_ID, normalizeTenantId } = require('../src/utils/tenant.util');

const WRITE = process.argv.includes('--write');
const tenantId = normalizeTenantId(process.env.MIGRATION_TENANT_ID || DEFAULT_TENANT_ID);

const COLLECTION_KEYS = [
  'users',
  'salesOrders',
  'returnOrders',
  'masterOrders',
  'stockTransactions',
  'inventories',
  'arLedgers',
  'fundLedgers',
  'customers',
  'products',
  'suppliers',
  'auditLogs',
  'idempotencyRequests'
];

async function main() {
  await connectDB();
  const results = [];
  for (const key of COLLECTION_KEYS) {
    const Model = models[key];
    if (!Model) continue;
    const filter = { $or: [{ tenantId: { $exists: false } }, { tenantId: '' }, { tenantId: null }] };
    const count = await Model.countDocuments(filter);
    let modifiedCount = 0;
    if (WRITE && count) {
      const result = await Model.updateMany(filter, { $set: { tenantId } });
      modifiedCount = result.modifiedCount || 0;
    }
    results.push({ key, collection: Model.collection.name, count, modifiedCount });
  }
  console.log(JSON.stringify({ write: WRITE, tenantId, results }, null, 2));
  if (!WRITE) console.log('DRY_RUN_ONLY: chạy lại với --write sau khi backup và kiểm tra duplicate business key.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});
