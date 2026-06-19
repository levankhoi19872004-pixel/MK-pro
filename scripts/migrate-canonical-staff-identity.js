'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const WRITE_MODE = process.argv.includes('--write');
const BATCH_SIZE = Math.min(Math.max(Number(process.env.STAFF_IDENTITY_MIGRATION_BATCH_SIZE || 500), 1), 2000);

const TARGETS = Object.freeze([
  { collection: 'orders', sales: true, delivery: true },
  { collection: 'master_orders', sales: true, delivery: true },
  { collection: 'returnOrders', sales: true, delivery: true },
  { collection: 'masterReturnOrders', sales: true, delivery: true },
  { collection: 'arLedgers', sales: true, delivery: true, allocations: true },
  { collection: 'receipts', sales: true, delivery: true, allocations: true },
  { collection: 'debtCollections', sales: true, delivery: true, allocations: true },
  { collection: 'externalDebtOrders', sales: true, delivery: true },
  { collection: 'users', user: true }
]);

const SALES_CODE_FIELDS = ['salesStaffCode', 'salesmanCode', 'nvbhCode', 'salesPersonCode'];
const SALES_NAME_FIELDS = ['salesStaffName', 'salesmanName', 'nvbhName', 'salesPersonName'];
const DELIVERY_CODE_FIELDS = ['deliveryStaffCode', 'deliveryCode', 'nvghCode', 'shipperCode'];
const DELIVERY_NAME_FIELDS = ['deliveryStaffName', 'deliveryName', 'nvghName', 'shipperName'];
const LEGACY_FIELDS = [
  'salesmanCode', 'salesmanName', 'nvbhCode', 'nvbhName', 'salesPersonCode', 'salesPersonName',
  'deliveryCode', 'deliveryName', 'nvghCode', 'nvghName', 'shipperCode', 'shipperName'
];

function text(value) {
  return String(value || '').trim();
}

function first(row, fields) {
  for (const field of fields) {
    const value = text(row[field]);
    if (value) return value;
  }
  return '';
}

function canonicalPatch(row, target) {
  const $set = {};
  const $unset = {};

  if (target.user) {
    const role = text(row.role).toLowerCase();
    const businessCode = text(row.code || row.staffCode || row.employeeCode || row.maNhanVien);
    const businessName = text(row.fullName || row.name);
    if (role === 'sales') {
      if (businessCode && text(row.salesStaffCode) !== businessCode) $set.salesStaffCode = businessCode;
      if (businessName && text(row.salesStaffName) !== businessName) $set.salesStaffName = businessName;
    }
    if (role === 'delivery') {
      if (businessCode && text(row.deliveryStaffCode) !== businessCode) $set.deliveryStaffCode = businessCode;
      if (businessName && text(row.deliveryStaffName) !== businessName) $set.deliveryStaffName = businessName;
    }
    return { $set, $unset };
  }

  if (target.sales) {
    const code = first(row, SALES_CODE_FIELDS);
    const name = first(row, SALES_NAME_FIELDS);
    if (code && text(row.salesStaffCode) !== code) $set.salesStaffCode = code;
    if (name && text(row.salesStaffName) !== name) $set.salesStaffName = name;
  }

  if (target.delivery) {
    const code = first(row, DELIVERY_CODE_FIELDS);
    const name = first(row, DELIVERY_NAME_FIELDS);
    if (code && text(row.deliveryStaffCode) !== code) $set.deliveryStaffCode = code;
    if (name && text(row.deliveryStaffName) !== name) $set.deliveryStaffName = name;
  }

  for (const field of LEGACY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, field)) $unset[field] = '';
  }

  if (target.allocations && Array.isArray(row.allocations)) {
    let changed = false;
    const allocations = row.allocations.map((allocation) => {
      if (!allocation || typeof allocation !== 'object') return allocation;
      const nested = { ...allocation };
      const salesCode = first(nested, SALES_CODE_FIELDS);
      const salesName = first(nested, SALES_NAME_FIELDS);
      const deliveryCode = first(nested, DELIVERY_CODE_FIELDS);
      const deliveryName = first(nested, DELIVERY_NAME_FIELDS);
      if (salesCode) nested.salesStaffCode = salesCode;
      if (salesName) nested.salesStaffName = salesName;
      if (deliveryCode) nested.deliveryStaffCode = deliveryCode;
      if (deliveryName) nested.deliveryStaffName = deliveryName;
      for (const field of LEGACY_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(nested, field)) {
          delete nested[field];
          changed = true;
        }
      }
      return nested;
    });
    if (changed) $set.allocations = allocations;
  }

  return { $set, $unset };
}

function hasPatch(patch) {
  return Object.keys(patch.$set || {}).length > 0 || Object.keys(patch.$unset || {}).length > 0;
}

async function migrateTarget(db, target) {
  const existing = await db.listCollections({ name: target.collection }, { nameOnly: true }).toArray();
  if (!existing.length) return { collection: target.collection, exists: false, scanned: 0, changed: 0 };

  const collection = db.collection(target.collection);
  const cursor = collection.find({});
  let scanned = 0;
  let changed = 0;
  let operations = [];

  async function flush() {
    if (!operations.length) return;
    if (WRITE_MODE) await collection.bulkWrite(operations, { ordered: false });
    operations = [];
  }

  while (await cursor.hasNext()) {
    const row = await cursor.next();
    scanned += 1;
    const patch = canonicalPatch(row, target);
    if (!hasPatch(patch)) continue;
    changed += 1;
    const update = {};
    if (Object.keys(patch.$set).length) update.$set = patch.$set;
    if (Object.keys(patch.$unset).length) update.$unset = patch.$unset;
    operations.push({ updateOne: { filter: { _id: row._id }, update } });
    if (operations.length >= BATCH_SIZE) await flush();
  }

  await flush();
  return { collection: target.collection, exists: true, scanned, changed, mode: WRITE_MODE ? 'write' : 'dry-run' };
}

async function main() {
  await connectDB();
  const db = mongoose.connection.db;
  const results = [];
  for (const target of TARGETS) results.push(await migrateTarget(db, target));
  const summary = {
    ok: true,
    mode: WRITE_MODE ? 'write' : 'dry-run',
    scanned: results.reduce((sum, row) => sum + row.scanned, 0),
    changed: results.reduce((sum, row) => sum + row.changed, 0),
    results
  };
  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
