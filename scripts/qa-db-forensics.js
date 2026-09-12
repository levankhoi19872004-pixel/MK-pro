#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const INACTIVE = ['void', 'voided', 'cancelled', 'canceled', 'deleted', 'reversed'];
const CORE_COLLECTIONS = ['inventories', 'stockTransactions', 'arLedgers', 'fundLedgers', 'idempotency_requests'];

function getUri(env = process.env) {
  return String(env.QA_MONGO_URI || env.MONGO_URI || env.MONGODB_URI || '').trim();
}

function asText(value) {
  return { $trim: { input: { $convert: { input: value, to: 'string', onError: '', onNull: '' } } } };
}

function nonEmpty(field) {
  return { $ne: [asText(`$${field}`), ''] };
}

function activeMatch() {
  return {
    status: { $nin: INACTIVE },
    reversed: { $ne: true },
    isDeleted: { $ne: true }
  };
}

function qtyExpr() {
  return {
    $convert: {
      input: { $ifNull: ['$availableQty', { $ifNull: ['$onHand', { $ifNull: ['$quantity', '$qty'] }] }] },
      to: 'double', onError: 0, onNull: 0
    }
  };
}

async function duplicateKeyCheck(db, collection, keyField, options = {}) {
  const rows = await db.collection(collection).aggregate([
    { $match: { ...(options.match || {}), [keyField]: { $exists: true, $nin: [null, ''] } } },
    {
      $group: {
        _id: { tenantId: { $ifNull: ['$tenantId', ''] }, key: `$${keyField}` },
        count: { $sum: 1 },
        ids: { $push: { $convert: { input: '$_id', to: 'string', onError: '', onNull: '' } } }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: options.limit || 50 }
  ], { allowDiskUse: true, maxTimeMS: 120000 }).toArray();

  return {
    id: options.id || `${collection}.${keyField}.duplicate`,
    title: options.title || `${collection}: duplicate ${keyField}`,
    severity: options.severity || 'P0',
    blocking: options.blocking !== false,
    ok: rows.length === 0,
    count: rows.length,
    sample: rows.map((row) => ({ tenantId: row._id.tenantId, key: row._id.key, count: row.count, ids: row.ids.slice(0, 10) }))
  };
}

async function inventoryChecks(db) {
  const c = db.collection('inventories');
  const [negativeRows, duplicateRows, missingIdentity] = await Promise.all([
    c.aggregate([
      { $project: { productCode: 1, warehouseCode: 1, tenantId: 1, qty: qtyExpr() } },
      { $match: { qty: { $lt: -0.000001 } } },
      { $sort: { qty: 1 } },
      { $limit: 50 }
    ], { maxTimeMS: 120000 }).toArray(),
    c.aggregate([
      {
        $project: {
          tenantId: { $ifNull: ['$tenantId', ''] },
          productCode: { $toUpper: asText({ $ifNull: ['$productCode', '$productId'] }) },
          warehouseCode: { $toUpper: asText({ $ifNull: ['$warehouseCode', '$warehouseId'] }) }
        }
      },
      { $match: { productCode: { $ne: '' }, warehouseCode: { $ne: '' } } },
      { $group: { _id: { tenantId: '$tenantId', productCode: '$productCode', warehouseCode: '$warehouseCode' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ], { allowDiskUse: true, maxTimeMS: 120000 }).toArray(),
    c.aggregate([
      {
        $project: {
          productCode: asText({ $ifNull: ['$productCode', '$productId'] }),
          warehouseCode: asText({ $ifNull: ['$warehouseCode', '$warehouseId'] })
        }
      },
      { $match: { $or: [{ productCode: '' }, { warehouseCode: '' }] } },
      { $count: 'count' }
    ], { maxTimeMS: 120000 }).toArray()
  ]);

  return [
    {
      id: 'inventory.negative-stock', title: 'Inventory has no negative current stock', severity: 'P1', blocking: true,
      ok: negativeRows.length === 0, count: negativeRows.length,
      sample: negativeRows.map((r) => ({ tenantId: r.tenantId || '', productCode: r.productCode || '', warehouseCode: r.warehouseCode || '', qty: r.qty }))
    },
    {
      id: 'inventory.duplicate-product-warehouse', title: 'Inventory product/warehouse identity is unique', severity: 'P0', blocking: true,
      ok: duplicateRows.length === 0, count: duplicateRows.length,
      sample: duplicateRows.map((r) => ({ ...r._id, count: r.count }))
    },
    {
      id: 'inventory.missing-identity', title: 'Inventory rows have product and warehouse identity', severity: 'P1', blocking: true,
      ok: Number(missingIdentity[0]?.count || 0) === 0, count: Number(missingIdentity[0]?.count || 0), sample: []
    }
  ];
}

async function ledgerIdentityCheck(db, collection, options = {}) {
  const sourceExpr = { $or: [nonEmpty('sourceId'), nonEmpty('refId'), nonEmpty('orderId'), nonEmpty('salesOrderId')] };
  const rows = await db.collection(collection).aggregate([
    { $match: activeMatch() },
    { $match: { $expr: { $not: [sourceExpr] } } },
    { $project: { _id: 1, id: 1, code: 1, sourceType: 1, category: 1, type: 1, idempotencyKey: 1 } },
    { $limit: 50 }
  ], { maxTimeMS: 120000 }).toArray();
  return {
    id: `${collection}.missing-source`,
    title: `${collection}: active rows have source identity`,
    severity: options.severity || 'P1',
    blocking: options.blocking !== false,
    ok: rows.length === 0,
    count: rows.length,
    sample: rows
  };
}

async function fundContractCheck(db) {
  const c = db.collection('fundLedgers');
  const invalidMatch = {
    ...activeMatch(),
    $expr: {
      $or: [
        { $not: [{ $in: [{ $toLower: asText('$fundType') }, ['cash', 'bank']] }] },
        { $not: [{ $in: [{ $toLower: asText('$direction') }, ['in', 'out']] }] },
        { $lte: [{ $convert: { input: '$amount', to: 'double', onError: 0, onNull: 0 } }, 0] },
        { $eq: [asText('$sourceType'), ''] },
        { $eq: [asText('$sourceId'), ''] },
        { $eq: [asText('$idempotencyKey'), ''] },
        { $ne: ['$accountingConfirmed', true] },
        {
          $and: [
            { $ne: [asText('$accountingStatus'), ''] },
            { $ne: [{ $toLower: asText('$accountingStatus') }, 'confirmed'] }
          ]
        }
      ]
    }
  };
  const rows = await c.find(invalidMatch, {
    projection: { _id: 1, id: 1, code: 1, fundType: 1, direction: 1, amount: 1, sourceType: 1, sourceId: 1, idempotencyKey: 1, accountingConfirmed: 1, accountingStatus: 1 }
  }).limit(50).toArray();
  const count = rows.length ? await c.countDocuments(invalidMatch, { limit: 10001 }) : 0;
  return {
    id: 'fund.contract', title: 'FundLedger canonical contract', severity: 'P0', blocking: true,
    ok: rows.length === 0, count, sample: rows
  };
}

async function staleIdempotencyCheck(db) {
  const cutoff = new Date(Date.now() - Number(process.env.QA_IDEMPOTENCY_STALE_MINUTES || 30) * 60 * 1000);
  const query = {
    status: { $in: ['pending', 'processing', 'in_progress', 'running'] },
    $or: [{ updatedAt: { $lt: cutoff } }, { updatedAt: null, createdAt: { $lt: cutoff } }]
  };
  const c = db.collection('idempotency_requests');
  const rows = await c.find(query, { projection: { _id: 1, key: 1, commandName: 1, status: 1, createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: 1 }).limit(50).toArray();
  const count = rows.length ? await c.countDocuments(query, { limit: 10001 }) : 0;
  return {
    id: 'idempotency.stale-inflight', title: 'No stale in-flight idempotency requests', severity: 'P2', blocking: false,
    ok: rows.length === 0, count, sample: rows, cutoff: cutoff.toISOString()
  };
}

async function indexChecks(db) {
  const expected = [
    ['stockTransactions', 'uniq_stock_tx_idempotency_key', true],
    ['fundLedgers', 'uniq_fund_ledger_idempotency_key', true],
    ['idempotency_requests', 'uniq_idempotency_requests_key', true]
  ];
  const results = [];
  for (const [collection, name, unique] of expected) {
    let indexes = [];
    try { indexes = await db.collection(collection).indexes(); } catch (_) {}
    const found = indexes.find((index) => index.name === name);
    results.push({
      id: `index.${collection}.${name}`,
      title: `${collection}: required index ${name}`,
      severity: 'P0', blocking: true,
      ok: Boolean(found && (!unique || found.unique === true)),
      count: found ? 0 : 1,
      sample: found ? [] : [{ expected: name, unique }]
    });
  }
  return results;
}

function normalizeCheck(check) {
  return {
    ...check,
    status: check.ok ? 'PASS' : (check.blocking === false ? 'WARN' : 'FAIL')
  };
}

async function runForensics(db) {
  const collections = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((row) => row.name));
  const missingCollections = CORE_COLLECTIONS.filter((name) => !collections.has(name));
  const checks = [];
  if (missingCollections.length) {
    checks.push(normalizeCheck({
      id: 'database.core-collections', title: 'Core forensic collections exist', severity: 'P1', blocking: true,
      ok: false, count: missingCollections.length, sample: missingCollections
    }));
    return { checks, missingCollections };
  }

  const duplicateChecks = await Promise.all([
    duplicateKeyCheck(db, 'stockTransactions', 'idempotencyKey', { id: 'stock.idempotency-duplicate', title: 'StockTransaction idempotency keys are unique' }),
    duplicateKeyCheck(db, 'arLedgers', 'idempotencyKey', { id: 'ar.idempotency-duplicate', title: 'ArLedger active idempotency keys are unique', match: activeMatch() }),
    duplicateKeyCheck(db, 'fundLedgers', 'idempotencyKey', { id: 'fund.idempotency-duplicate', title: 'FundLedger active idempotency keys are unique', match: activeMatch() }),
    duplicateKeyCheck(db, 'idempotency_requests', 'key', { id: 'request.idempotency-duplicate', title: 'Request idempotency keys are unique' })
  ]);
  checks.push(...duplicateChecks.map(normalizeCheck));
  checks.push(...(await inventoryChecks(db)).map(normalizeCheck));
  checks.push(normalizeCheck(await ledgerIdentityCheck(db, 'arLedgers', { severity: 'P1' })));
  checks.push(normalizeCheck(await ledgerIdentityCheck(db, 'fundLedgers', { severity: 'P1' })));
  checks.push(normalizeCheck(await fundContractCheck(db)));
  checks.push(normalizeCheck(await staleIdempotencyCheck(db)));
  checks.push(...(await indexChecks(db)).map(normalizeCheck));

  return { checks, missingCollections: [] };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const uri = getUri();
  if (!uri) {
    console.error('QA_DB_URI_MISSING: set QA_MONGO_URI (preferred) or MONGO_URI.');
    process.exit(3);
  }

  const mongoose = require('mongoose');
  const startedAt = new Date();
  try {
    await mongoose.connect(uri, {
      autoIndex: false,
      maxPoolSize: 3,
      minPoolSize: 0,
      serverSelectionTimeoutMS: Number(process.env.QA_DB_SERVER_SELECTION_TIMEOUT_MS || 10000),
      socketTimeoutMS: Number(process.env.QA_DB_SOCKET_TIMEOUT_MS || 120000),
      readPreference: process.env.QA_DB_READ_PREFERENCE || 'secondaryPreferred',
      appName: 'mkpro-qa-read-only-forensics'
    });
    const { checks, missingCollections } = await runForensics(mongoose.connection.db);
    const summary = checks.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, { PASS: 0, FAIL: 0, WARN: 0 });
    const blockingFailures = checks.filter((row) => row.status === 'FAIL' && row.blocking !== false).length;
    const report = {
      schemaVersion: 1,
      audit: 'mkpro-db-read-only-forensics',
      readOnly: true,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      database: mongoose.connection.name,
      missingCollections,
      summary: { ...summary, blockingFailures, ok: blockingFailures === 0 },
      checks
    };
    console.log(JSON.stringify(report, null, 2));
    if (blockingFailures) process.exitCode = 2;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`QA_DB_FORENSICS_FAILED: ${error.stack || error.message}`);
    process.exit(1);
  });
}

module.exports = {
  getUri,
  activeMatch,
  duplicateKeyCheck,
  inventoryChecks,
  fundContractCheck,
  staleIdempotencyCheck,
  indexChecks,
  runForensics,
  normalizeCheck
};
