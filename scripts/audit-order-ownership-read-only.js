'use strict';

/** Phase250A read-only order ownership inspection. */
let mongoose;
let SalesOrder;

function loadDatabaseDependencies() {
  if (!mongoose) mongoose = require('mongoose');
  if (!SalesOrder) SalesOrder = require('../src/models/SalesOrder');
}

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function text(value) { return String(value || '').trim(); }
function variants(value) {
  const raw = text(value);
  return [...new Set([raw, raw.toUpperCase(), raw.toLowerCase()].filter(Boolean))];
}

function orderIdentityFilter(value) {
  const values = variants(value);
  return {
    $or: [
      { id: { $in: values } },
      { code: { $in: values } },
      { orderCode: { $in: values } },
      { salesOrderCode: { $in: values } }
    ]
  };
}

function ownerCode(order = {}) {
  return text(order.salesStaffCode || order.salesmanCode || order.nvbhCode || order.maNVBH || order.salesStaff?.code);
}

async function inspectOrder(orderRef, actorCode = '') {
  loadDatabaseDependencies();
  const order = await SalesOrder.findOne(orderIdentityFilter(orderRef))
    .select('id code orderCode salesOrderCode salesStaffCode salesStaffName salesmanCode salesmanName nvbhCode nvbhName maNVBH maNVBHName status lifecycleStatus deliveryStatus accountingStatus createdAt updatedAt')
    .read('secondaryPreferred')
    .lean();
  if (!order) return { found: false, orderRef, readOnly: true };
  const actualOwnerCode = ownerCode(order);
  return {
    found: true,
    readOnly: true,
    order: {
      id: text(order.id || order._id),
      code: text(order.code || order.orderCode || order.salesOrderCode),
      salesStaffCode: actualOwnerCode,
      salesStaffName: text(order.salesStaffName || order.salesmanName || order.nvbhName || order.maNVBHName),
      status: text(order.status),
      lifecycleStatus: text(order.lifecycleStatus),
      deliveryStatus: text(order.deliveryStatus),
      accountingStatus: text(order.accountingStatus),
      createdAt: order.createdAt || null,
      updatedAt: order.updatedAt || null
    },
    actor: actorCode ? { code: actorCode, matchesOwner: variants(actorCode).includes(actualOwnerCode) } : null
  };
}

async function ownershipDistribution(limit = 100) {
  loadDatabaseDependencies();
  return SalesOrder.aggregate([
    {
      $project: {
        ownerCode: {
          $trim: {
            input: {
              $convert: {
                input: { $ifNull: ['$salesStaffCode', { $ifNull: ['$salesmanCode', { $ifNull: ['$nvbhCode', '$maNVBH'] }] }] },
                to: 'string', onError: '', onNull: ''
              }
            }
          }
        }
      }
    },
    { $group: { _id: { $cond: [{ $eq: ['$ownerCode', ''] }, '<MISSING>', '$ownerCode'] }, orderCount: { $sum: 1 } } },
    { $sort: { orderCount: -1, _id: 1 } },
    { $limit: Math.max(1, Math.min(Number(limit) || 100, 1000)) }
  ]).option({ allowDiskUse: true, maxTimeMS: 120000 }).read('secondaryPreferred').exec();
}

async function main() {
  const uri = process.env.PHASE250A_MONGODB_URI || process.env.MONGODB_URI || process.env.MONGO_URI || '';
  if (!uri) {
    console.log('ORDER_OWNERSHIP_AUDIT_SKIPPED_NO_URI');
    console.log('No database connection was attempted.');
    console.log('Set PHASE250A_MONGODB_URI to a read-only MongoDB URI.');
    console.log('Examples: npm run audit:order-ownership -- --order=B0039112 --actor=33949');
    return;
  }

  loadDatabaseDependencies();
  const orderRef = argValue('order');
  const actorCode = argValue('actor');
  const limit = Number(argValue('limit', '100')) || 100;
  try {
    await mongoose.connect(uri, {
      autoIndex: false,
      maxPoolSize: 2,
      serverSelectionTimeoutMS: 10000,
      readPreference: 'secondaryPreferred',
      appName: 'mkpro-phase250a-read-only-audit'
    });
    const result = orderRef
      ? await inspectOrder(orderRef, actorCode)
      : { readOnly: true, generatedAt: new Date().toISOString(), distribution: await ownershipDistribution(limit) };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`ORDER_OWNERSHIP_AUDIT_FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { orderIdentityFilter, ownerCode, inspectOrder, ownershipDistribution };
