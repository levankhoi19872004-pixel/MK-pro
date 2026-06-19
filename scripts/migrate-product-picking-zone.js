'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { normalizePickingZone, pickingZoneFrom, PICKING_ZONES } = require('../src/utils/pickingZone.util');

const WRITE_MODE = process.argv.includes('--write');
const BATCH_SIZE = Math.min(Math.max(Number(process.env.PICKING_ZONE_MIGRATION_BATCH_SIZE || 500), 1), 2000);

async function main() {
  await connectDB();
  const collection = mongoose.connection.db.collection('products');
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
    const product = await cursor.next();
    scanned += 1;
    const zone = normalizePickingZone(pickingZoneFrom(product), PICKING_ZONES.HC);
    if (product.pickingZone === zone) continue;
    changed += 1;
    operations.push({
      updateOne: {
        filter: { _id: product._id },
        update: { $set: { pickingZone: zone } }
      }
    });
    if (operations.length >= BATCH_SIZE) await flush();
  }

  await flush();
  console.log(JSON.stringify({
    ok: true,
    mode: WRITE_MODE ? 'write' : 'dry-run',
    collection: 'products',
    scanned,
    changed
  }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
