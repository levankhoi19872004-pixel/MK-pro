'use strict';

/**
 * Read-only production/staging persistence verifier.
 * It never updates or deletes MongoDB data.
 */

const mongoose = require('mongoose');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

async function main() {
  const mongoUri = arg('--mongo-uri') || process.env.MONGO_URI || process.env.MONGODB_URI;
  const orderCode = arg('--order-code');
  if (!mongoUri || !orderCode) {
    throw new Error('Usage: node scripts/verify-phase247-mongo-persistence.js --mongo-uri <uri> --order-code <code>');
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const order = await db.collection('salesorders').findOne(
    { $or: [{ orderCode }, { code: orderCode }, { salesOrderCode: orderCode }] },
    { projection: { _id: 1, id: 1, orderCode: 1, code: 1, accountingConfirmed: 1, accountingStatus: 1, deliveryCloseout: 1 } }
  );
  if (!order) throw new Error(`SalesOrder not found: ${orderCode}`);

  const identities = [order._id, order.id, order.orderCode, order.code, orderCode].filter(Boolean);
  const allocations = await db.collection('orderpaymentallocations').find(
    { $or: [{ orderId: { $in: identities } }, { orderCode: { $in: identities } }, { salesOrderId: { $in: identities } }, { salesOrderCode: { $in: identities } }] },
    { projection: { _id: 1, orderId: 1, orderCode: 1, idempotencyKey: 1, finalDebtAmount: 1, debtAmount: 1 } }
  ).toArray();

  const allocationKeys = allocations.map((row) => row.idempotencyKey).filter(Boolean);
  const arLedgers = await db.collection('arledgers').find(
    { $or: [{ orderId: { $in: identities } }, { orderCode: { $in: identities } }, ...(allocationKeys.length ? [{ idempotencyKey: { $in: allocationKeys } }] : [])] },
    { projection: { _id: 1, orderId: 1, orderCode: 1, category: 1, ledgerType: 1, idempotencyKey: 1, accountingConfirmed: 1, accountingStatus: 1, active: 1 } }
  ).toArray();

  const fundLedgers = await db.collection('fundledgers').find(
    { $or: [{ orderId: { $in: identities } }, { orderCode: { $in: identities } }, ...(allocationKeys.length ? [{ idempotencyKey: { $in: allocationKeys } }] : [])] },
    { projection: { _id: 1, orderId: 1, orderCode: 1, idempotencyKey: 1, accountingConfirmed: 1, accountingStatus: 1, active: 1 } }
  ).toArray();

  const output = {
    readOnly: true,
    orderCode,
    salesOrder: {
      found: true,
      accountingConfirmed: order.accountingConfirmed === true,
      accountingStatus: order.accountingStatus || null
    },
    allocationCount: allocations.length,
    arLedgerCount: arLedgers.length,
    fundLedgerCount: fundLedgers.length,
    allocationIdempotencyKeys: allocationKeys,
    arIdempotencyKeys: arLedgers.map((row) => row.idempotencyKey).filter(Boolean),
    fundIdempotencyKeys: fundLedgers.map((row) => row.idempotencyKey).filter(Boolean)
  };
  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => { console.error(`[phase247-mongo-verify] ERROR ${error.message}`); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect().catch(() => {}); });
