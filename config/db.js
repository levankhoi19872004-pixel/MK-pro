'use strict';

const { defaultData, normalizeData } = require('../data/defaultData');
const { syncAccountsToStaff } = require('../utils/accounts');
const { rebuildMasterOrders, rebuildDebts } = require('../services/orderDebtService');
const { rebuildPaymentsFromOrders } = require('../services/paymentService');

const MONGO_URI = String(process.env.MONGO_URI || process.env.DATABASE_URL || '').trim();
const DB_NAME = process.env.MONGO_DB_NAME || 'kho_minh_khai';
const COLLECTION_NAME = process.env.MONGO_COLLECTION || 'kho_data';
const SINGLE_DOC_ID = 'main';

let client = null;
let collection = null;
let memoryData = defaultData();

function usingMongo() {
  return /^mongodb(\+srv)?:\/\//i.test(MONGO_URI);
}

function getDBStatus() {
  return {
    success: true,
    storage: usingMongo() ? 'mongodb' : 'memory',
    mongoUriConfigured: Boolean(MONGO_URI),
    mongoUriLooksValid: usingMongo(),
    dbName: DB_NAME,
    collectionName: COLLECTION_NAME,
    documentId: SINGLE_DOC_ID,
    connected: Boolean(collection)
  };
}

function prepareData(data) {
  const fixed = normalizeData(data);
  syncAccountsToStaff(fixed);
  fixed.masterOrders = rebuildMasterOrders(fixed.orders, fixed.masterOrders);
  fixed.payments = rebuildPaymentsFromOrders(fixed);
  fixed.debts = rebuildDebts(fixed);
  return fixed;
}

function getMemoryData() {
  return prepareData(memoryData);
}

function setMemoryData(data) {
  memoryData = prepareData(data);
  return memoryData;
}

async function getCollection() {
  if (!usingMongo()) return null;
  if (collection) return collection;
  const { MongoClient } = require('mongodb');
  client = new MongoClient(MONGO_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
  await client.connect();
  collection = client.db(DB_NAME).collection(COLLECTION_NAME);

  // ❌ ĐÃ XOÁ DÒNG GÂY LỖI
  // await collection.createIndex({ _id: 1 }, { unique: true });

  return collection;
}

async function initDB() {
  if (!usingMongo()) {
    console.warn('Chua co MONGO_URI hop le - dang chay tam bang RAM, deploy/restart se mat du lieu.');
    memoryData = prepareData(memoryData);
    return;
  }

  const col = await getCollection();
  const existing = await col.findOne({ _id: SINGLE_DOC_ID });
  if (!existing) {
    await col.insertOne({ _id: SINGLE_DOC_ID, data: prepareData(defaultData()), updatedAt: new Date() });
  } else {
    await col.updateOne(
      { _id: SINGLE_DOC_ID },
      { $set: { data: prepareData(existing.data), updatedAt: new Date() } }
    );
  }
  console.log('MONGODB READY:', DB_NAME + '.' + COLLECTION_NAME);
}

async function readKhoData() {
  if (!usingMongo()) return getMemoryData();
  const col = await getCollection();
  const doc = await col.findOne({ _id: SINGLE_DOC_ID });
  if (!doc) {
    const data = prepareData(defaultData());
    await col.insertOne({ _id: SINGLE_DOC_ID, data, updatedAt: new Date() });
    return data;
  }
  return prepareData(doc.data);
}

async function saveKhoData(data) {
  const fixed = prepareData(data);
  if (!usingMongo()) {
    memoryData = fixed;
    return { success: true, data: fixed, storage: 'memory' };
  }
  const col = await getCollection();
  await col.updateOne(
    { _id: SINGLE_DOC_ID },
    { $set: { data: fixed, updatedAt: new Date() } },
    { upsert: true }
  );
  return { success: true, data: fixed, storage: 'mongodb' };
}

async function getKhoRow() {
  const data = await readKhoData();
  return { id: SINGLE_DOC_ID, data };
}

async function closeDB() {
  if (client) await client.close();
  client = null;
  collection = null;
}

module.exports = {
  initDB,
  readKhoData,
  getKhoRow,
  saveKhoData,
  getMemoryData,
  setMemoryData,
  usingMongo,
  getDBStatus,
  closeDB
};