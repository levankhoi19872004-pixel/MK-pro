'use strict';

const mongoose = require('mongoose');

const uri = String(process.env.RESTORE_DRILL_MONGODB_URI || '').trim();
if (!uri) {
  console.error('Thiếu RESTORE_DRILL_MONGODB_URI. Chỉ chạy script trên database restore/staging, không dùng database production.');
  process.exit(2);
}

const REQUIRED_COLLECTIONS = [
  'products',
  'customers',
  'users',
  'orders',
  'inventories',
  'stockTransactions',
  'arLedgers',
  'fundLedgers'
];

const OPTIONAL_MODULE_COLLECTIONS = {
  ENABLE_ENTERPRISE_CORE: ['outbox_events'],
  ENABLE_PURCHASING: [
    'purchase_orders',
    'goods_receipts',
    'supplier_payable_ledgers',
    'supplier_payable_accounts',
    'supplier_payments',
    'purchase_returns'
  ],
  ENABLE_WAREHOUSE_ADVANCED: ['inventory_reservations', 'stock_counts'],
  ENABLE_ANALYTICS_PROJECTIONS: ['reporting_snapshots'],
  ENABLE_MOBILE_OFFLINE_SYNC: ['mobile_sync_operations'],
  ENABLE_FIELD_OPERATIONS: ['visit_plans', 'visit_executions'],
  ENABLE_DELIVERY_PLANNING: ['delivery_route_plans'],
  ENABLE_INTEGRATIONS: ['integration_jobs']
};

for (const [flag, collections] of Object.entries(OPTIONAL_MODULE_COLLECTIONS)) {
  if (String(process.env[flag] || '').toLowerCase() === 'true') REQUIRED_COLLECTIONS.push(...collections);
}
if (String(process.env.TENANT_MODE || 'single').toLowerCase() === 'multi') {
  REQUIRED_COLLECTIONS.push('tenants', 'tenant_subscriptions');
}

async function main() {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000)
  });
  const db = mongoose.connection.db;
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = new Set(collections.map((row) => row.name));
  const missing = REQUIRED_COLLECTIONS.filter((name) => !names.has(name));
  const counts = {};
  for (const name of REQUIRED_COLLECTIONS.filter((item) => names.has(item))) {
    counts[name] = await db.collection(name).estimatedDocumentCount();
  }
  const report = {
    ok: missing.length === 0,
    database: db.databaseName,
    checkedAt: new Date().toISOString(),
    requiredCollections: REQUIRED_COLLECTIONS,
    missing,
    counts
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});
