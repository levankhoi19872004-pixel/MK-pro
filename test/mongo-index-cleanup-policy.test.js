'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const MongoStore = require('../src/models');
const {
  INDEX_DEFINITIONS,
  buildManagedIndexPlan,
  sameIndexKey,
  sameIndexOptions
} = require('../src/services/mongoIndexService');
const {
  analyzeIndexes,
  mergeIndexStats
} = require('../src/services/mongoIndexAuditService');

const ROOT = path.resolve(__dirname, '..');

function names(collectionKey) {
  return (INDEX_DEFINITIONS[collectionKey] || []).map(([, options]) => options.name);
}

test('managed index policy is reduced and grouped by physical collection', () => {
  const plan = new Map(buildManagedIndexPlan().map((item) => [item.collectionName, item]));

  assert.equal(plan.get('orders').definitions.length, 13);
  assert.equal(plan.get('returnOrders').definitions.length, 13);
  assert.equal(plan.get('master_orders').definitions.length, 9);
  assert.equal(plan.get('inventories').definitions.length, 1);
  assert.equal(plan.get('journals').definitions.length, 3);
  assert.deepEqual(plan.get('inventories').collectionKeys, ['inventories']);
  assert.deepEqual(plan.get('journals').collectionKeys, ['journals']);
  assert.equal(INDEX_DEFINITIONS.staffs, undefined);
  assert.equal(INDEX_DEFINITIONS.stock, undefined);
  assert.equal(INDEX_DEFINITIONS.inventoriesLegacy, undefined);
  assert.equal(INDEX_DEFINITIONS.payments, undefined);
  assert.equal(plan.get('import_session_rows').definitions.length, 3);
  assert.equal(
    plan.get('import_session_rows').definitions.some(([, options]) => options.name === 'ttl_importSessionRows_createdAt' && options.expireAfterSeconds === 86400),
    true
  );
});


test('disabling mongoose autoIndex does not lose active schema TTL or operational indexes', () => {
  const plans = new Map(buildManagedIndexPlan().map((item) => [item.collectionName, item.definitions]));
  const allowedRetiredSchemaIndexes = new Set([
    'staffs:{"id":1}',
    'staffs:{"role":1}',
    'staffs:{"code":1}',
    'staffs:{"username":1}',
    'permissions:{"roleCode":1}',
    'permissions:{"module":1}'
  ]);
  const missing = [];

  for (const Model of Object.values(MongoStore)) {
    if (!Model?.schema || !Model?.collection?.name) continue;
    const collectionName = Model.collection.name;
    const managedDefinitions = plans.get(collectionName) || [];

    for (const [fields, options] of Model.schema.indexes()) {
      const key = `${collectionName}:${JSON.stringify(fields)}`;
      if (allowedRetiredSchemaIndexes.has(key)) continue;
      const found = managedDefinitions.some(([managedFields, managedOptions]) => {
        return sameIndexKey(fields, managedFields) && sameIndexOptions(options, managedOptions);
      });
      if (!found) missing.push(key);
    }
  }

  assert.deepEqual(missing, []);
});

test('unused text and low-value alias indexes are no longer recreated', () => {
  assert.equal(names('products').includes('txt_products_search_text'), false);
  assert.equal(names('customers').includes('txt_customers_search_text'), false);
  assert.equal(names('salesOrders').includes('idx_orders_order_no'), false);
  assert.equal(names('salesOrders').includes('idx_orders_staff_order_date'), false);
  assert.equal(names('returnOrders').includes('idx_return_orders_status'), false);
  assert.equal(names('returnOrders').includes('idx_return_orders_sales_order_id'), false);
});

test('audit keeps managed/unique indexes and drops safe duplicates or prefixes', () => {
  const managed = [
    [{ code: 1 }, { name: 'uniq_code', unique: true }],
    [{ staffCode: 1, date: -1, status: 1 }, { name: 'idx_staff_date_status' }]
  ];
  const existing = [
    { name: '_id_', key: { _id: 1 }, unique: true },
    { name: 'uniq_code', key: { code: 1 }, unique: true },
    { name: 'staffCode_1', key: { staffCode: 1 } },
    { name: 'unused_legacy', key: { legacy: 1 } },
    { name: 'protected_unique', key: { externalCode: 1 }, unique: true }
  ];
  const stats = mergeIndexStats([
    { name: 'unused_legacy', accesses: { ops: 0, since: new Date('2026-06-01T00:00:00.000Z') } }
  ]);
  const rows = analyzeIndexes({
    collectionName: 'orders',
    existingIndexes: existing,
    managedDefinitions: managed,
    indexStats: stats,
    minObservationHours: 168,
    now: new Date('2026-06-17T00:00:00.000Z')
  });
  const byName = new Map(rows.map((row) => [row.name, row]));

  assert.equal(byName.get('_id_').reason, 'primary_key');
  assert.equal(byName.get('uniq_code').reason, 'managed');
  assert.equal(byName.get('staffCode_1').reason, 'covered_prefix');
  assert.equal(byName.get('staffCode_1').dropDefault, true);
  assert.equal(byName.get('unused_legacy').reason, 'unused_candidate');
  assert.equal(byName.get('unused_legacy').dropUnusedEligible, true);
  assert.equal(byName.get('protected_unique').dropDefault, false);
  assert.equal(byName.get('protected_unique').dropUnusedEligible, false);
});

test('empty retired collection may remove every non-primary index safely', () => {
  const rows = analyzeIndexes({
    collectionName: 'inventorySnapshots',
    existingIndexes: [
      { name: '_id_', key: { _id: 1 }, unique: true },
      { name: 'uniq_old', key: { code: 1 }, unique: true },
      { name: 'ttl_old', key: { expiresAt: 1 }, expireAfterSeconds: 0 }
    ],
    managedDefinitions: [],
    emptyRetiredCollection: true,
    documentCount: 0
  });
  const byName = new Map(rows.map((row) => [row.name, row]));
  assert.equal(byName.get('_id_').dropDefault, false);
  assert.equal(byName.get('uniq_old').reason, 'empty_retired_collection');
  assert.equal(byName.get('uniq_old').dropDefault, true);
  assert.equal(byName.get('ttl_old').dropDefault, true);
});


test('retired unique index is removable with replacement and protected otherwise', () => {
  const emptyRows = analyzeIndexes({
    collectionName: 'roles',
    existingIndexes: [
      { name: '_id_', key: { _id: 1 }, unique: true },
      { name: 'idx_roles_code', key: { code: 1 }, unique: true, sparse: true },
      { name: 'uniq_roles_code', key: { code: 1 }, unique: true }
    ],
    managedDefinitions: [[{ code: 1 }, { name: 'uniq_roles_code', unique: true }]],
    retiredNames: ['idx_roles_code'],
    documentCount: 0
  });
  assert.equal(emptyRows.find((row) => row.name === 'idx_roles_code').reason, 'retired_replaced');
  assert.equal(emptyRows.find((row) => row.name === 'idx_roles_code').dropDefault, true);

  const populatedRows = analyzeIndexes({
    collectionName: 'roles',
    existingIndexes: [
      { name: '_id_', key: { _id: 1 }, unique: true },
      { name: 'idx_roles_code', key: { code: 1 }, unique: true, sparse: true }
    ],
    managedDefinitions: [],
    retiredNames: ['idx_roles_code'],
    documentCount: 2
  });
  assert.equal(populatedRows.find((row) => row.name === 'idx_roles_code').reason, 'retired_but_protected');
  assert.equal(populatedRows.find((row) => row.name === 'idx_roles_code').dropDefault, false);
});


test('retired name alone is not dropped until it is proven unused', () => {
  const existing = [
    { name: '_id_', key: { _id: 1 }, unique: true },
    { name: 'idx_orders_customer_id', key: { customerId: 1 } }
  ];

  const used = analyzeIndexes({
    collectionName: 'orders',
    existingIndexes: existing,
    retiredNames: ['idx_orders_customer_id'],
    indexStats: [{
      name: 'idx_orders_customer_id',
      accesses: { ops: 12, since: new Date('2026-06-01T00:00:00.000Z') }
    }],
    documentCount: 1400,
    now: new Date('2026-06-17T00:00:00.000Z')
  }).find((row) => row.name === 'idx_orders_customer_id');
  assert.equal(used.reason, 'retired_but_used');
  assert.equal(used.dropDefault, false);
  assert.equal(used.dropUnusedEligible, false);

  const unused = analyzeIndexes({
    collectionName: 'orders',
    existingIndexes: existing,
    retiredNames: ['idx_orders_customer_id'],
    indexStats: [{
      name: 'idx_orders_customer_id',
      accesses: { ops: 0, since: new Date('2026-06-01T00:00:00.000Z') }
    }],
    documentCount: 1400,
    minObservationHours: 168,
    now: new Date('2026-06-17T00:00:00.000Z')
  }).find((row) => row.name === 'idx_orders_customer_id');
  assert.equal(unused.reason, 'retired_unused_candidate');
  assert.equal(unused.dropDefault, false);
  assert.equal(unused.dropUnusedEligible, true);
});

test('audit does not remove the only index on a key until managed unique replacement exists', () => {
  const rows = analyzeIndexes({
    collectionName: 'inventories',
    existingIndexes: [
      { name: '_id_', key: { _id: 1 }, unique: true },
      { name: 'idx_inventory_snapshot_product_warehouse', key: { productCode: 1, warehouseCode: 1 } }
    ],
    managedDefinitions: [[
      { productCode: 1, warehouseCode: 1 },
      { name: 'uniq_inventory_product_warehouse', unique: true }
    ]],
    retiredNames: ['idx_inventory_snapshot_product_warehouse'],
    documentCount: 465
  });
  const target = rows.find((row) => row.name === 'idx_inventory_snapshot_product_warehouse');
  assert.equal(target.reason, 'required_unique_replacement_missing');
  assert.equal(target.dropDefault, false);
});

test('mongoose automatic index creation is disabled by default', () => {
  const source = require('./helpers/sourceBundle.util').readSource(path.join(ROOT, 'src/config/db.js'));
  assert.match(source, /const autoIndex = process\.env\.MONGOOSE_AUTO_INDEX === 'true'/);
  assert.match(source, /mongoose\.set\('autoIndex', autoIndex\)/);
  assert.match(source, /await mongoose\.connect\(mongoUri, \{\s*autoIndex,/);
});

test('cleanup command is dry-run first and requires explicit unused mode', () => {
  const script = require('./helpers/sourceBundle.util').readSource(path.join(ROOT, 'scripts/audit-mongo-indexes.js'));
  const pkg = JSON.parse(require('./helpers/sourceBundle.util').readSource(path.join(ROOT, 'package.json')));
  assert.match(script, /write: argv\.includes\('--write'\)/);
  assert.match(script, /dropUnused: argv\.includes\('--drop-unused'\)/);
  assert.match(script, /minObservationHours/);
  assert.equal(pkg.scripts['mongo:index-audit'], 'node scripts/audit-mongo-indexes.js');
  assert.match(pkg.scripts['mongo:index-cleanup:unused'], /--drop-unused/);
});
