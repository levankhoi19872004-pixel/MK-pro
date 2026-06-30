#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const DeliveryCloseoutCorrection = require('../src/models/DeliveryCloseoutCorrection');
const DeliveryCloseoutVersion = require('../src/models/DeliveryCloseoutVersion');
const ArLedger = require('../src/models/ArLedger');

async function createIndexes() {
  await DeliveryCloseoutCorrection.collection.createIndex({ correctionCode: 1 }, { unique: true, sparse: true, name: 'uniq_deliveryCloseoutCorrections_correctionCode' });
  await DeliveryCloseoutCorrection.collection.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true, name: 'uniq_deliveryCloseoutCorrections_idempotencyKey' });
  await DeliveryCloseoutCorrection.collection.createIndex({ originalCloseoutId: 1 }, { name: 'idx_deliveryCloseoutCorrections_originalCloseoutId' });
  await DeliveryCloseoutCorrection.collection.createIndex({ newCloseoutId: 1 }, { name: 'idx_deliveryCloseoutCorrections_newCloseoutId' });
  await DeliveryCloseoutCorrection.collection.createIndex({ deliveryDate: 1, deliveryStaffCode: 1 }, { name: 'idx_deliveryCloseoutCorrections_deliveryDate_deliveryStaff' });
  await DeliveryCloseoutCorrection.collection.createIndex({ customerCode: 1, salesOrderCode: 1 }, { name: 'idx_deliveryCloseoutCorrections_customer_order' });

  await DeliveryCloseoutVersion.collection.createIndex({ originalCloseoutId: 1, closeoutVersion: 1 }, { unique: true, sparse: true, name: 'uniq_deliveryCloseoutVersions_original_version' });
  await DeliveryCloseoutVersion.collection.createIndex({ correctionId: 1 }, { unique: true, sparse: true, name: 'uniq_deliveryCloseoutVersions_correctionId' });
  await DeliveryCloseoutVersion.collection.createIndex({ correctionOfCloseoutId: 1 }, { name: 'idx_deliveryCloseoutVersions_correctionOfCloseoutId' });
  await DeliveryCloseoutVersion.collection.createIndex({ deliveryDate: 1, deliveryStaffCode: 1 }, { name: 'idx_deliveryCloseoutVersions_deliveryDate_deliveryStaff' });
  await DeliveryCloseoutVersion.collection.createIndex({ customerCode: 1, salesOrderCode: 1 }, { name: 'idx_deliveryCloseoutVersions_customer_order' });

  await ArLedger.collection.createIndex({ idempotencyKey: 1, category: 1 }, { sparse: true, name: 'idx_arLedgers_idempotencyKey_category' });
  await ArLedger.collection.createIndex({ sourceType: 1, sourceId: 1, category: 1 }, { name: 'idx_arLedgers_source_category' });

  return { ok: true, collections: ['deliveryCloseoutCorrections', 'deliveryCloseoutVersions', 'arLedgers'] };
}

async function main() {
  await connectDB();
  const result = await createIndexes();
  console.log('DELIVERY_CLOSEOUT_CORRECTION_INDEXES_OK');
  console.log(JSON.stringify(result, null, 2));
  await mongoose.connection.close();
}

if (require.main === module) main().catch(async (err) => {
  console.error('DELIVERY_CLOSEOUT_CORRECTION_INDEXES_FAIL');
  console.error(err && err.stack ? err.stack : err);
  try { await mongoose.connection.close(); } catch (_) {}
  process.exit(1);
});

module.exports = { createIndexes };
