const fs = require('fs');
const path = require('path');
const { connectMongo, getMongoDb } = require('../config/mongo');

const DATA_DOC_ID = 'kho_v43_main_data';
const COLLECTION_NAME = 'app_data';

let dataCache = null;
let usingMongo = false;
let dataFilePath = '';
let normalizeFn = (data) => data;
let createEmptyFn = () => ({});
let ensureDefaultsFn = (data) => data;
let saveQueue = Promise.resolve();

function ensureJsonFile() {
  if (!dataFilePath) return;
  const dataDir = path.dirname(dataFilePath);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFilePath)) fs.writeFileSync(dataFilePath, JSON.stringify(createEmptyFn(), null, 2), 'utf8');
}

function readJsonFile() {
  ensureJsonFile();
  const raw = fs.readFileSync(dataFilePath, 'utf8');
  const data = raw ? JSON.parse(raw) : createEmptyFn();
  return normalizeFn(ensureDefaultsFn(data));
}

function writeJsonFile(data) {
  ensureJsonFile();
  fs.writeFileSync(dataFilePath, JSON.stringify(normalizeFn(data), null, 2), 'utf8');
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data || createEmptyFn()));
}

async function initDataStore(options) {
  dataFilePath = options.dataFilePath;
  normalizeFn = options.normalizeData;
  createEmptyFn = options.createEmptyData;
  ensureDefaultsFn = options.ensureDefaultStaffAccounts;

  const db = await connectMongo();
  usingMongo = Boolean(db);

  if (!usingMongo) {
    dataCache = readJsonFile();
    return { usingMongo: false, message: 'JSON fallback' };
  }

  const collection = db.collection(COLLECTION_NAME);
  await collection.createIndex({ updatedAt: -1 });

  const existed = await collection.findOne({ _id: DATA_DOC_ID });
  if (existed && existed.data) {
    dataCache = normalizeFn(ensureDefaultsFn(existed.data));
    await collection.updateOne(
      { _id: DATA_DOC_ID },
      { $set: { data: cloneData(dataCache), updatedAt: new Date() } }
    );
    return { usingMongo: true, migratedFromJson: false };
  }

  dataCache = readJsonFile();
  await collection.updateOne(
    { _id: DATA_DOC_ID },
    {
      $set: {
        data: cloneData(dataCache),
        createdAt: new Date(),
        updatedAt: new Date(),
        schemaVersion: 'V43'
      }
    },
    { upsert: true }
  );

  return { usingMongo: true, migratedFromJson: true };
}

function readDataSync() {
  if (!dataCache) {
    dataCache = readJsonFile();
  }
  return normalizeFn(ensureDefaultsFn(dataCache));
}

function writeDataSync(data) {
  const normalized = normalizeFn(ensureDefaultsFn(data));
  dataCache = normalized;

  if (!usingMongo) {
    writeJsonFile(normalized);
    return;
  }

  const db = getMongoDb();
  if (!db) {
    writeJsonFile(normalized);
    return;
  }

  const snapshot = cloneData(normalized);
  saveQueue = saveQueue
    .then(() => db.collection(COLLECTION_NAME).updateOne(
      { _id: DATA_DOC_ID },
      {
        $set: {
          data: snapshot,
          updatedAt: new Date(),
          schemaVersion: 'V43'
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    ))
    .catch((err) => {
      console.error('❌ Mongo save error:', err.message);
      try {
        writeJsonFile(snapshot);
        console.warn('⚠️ Đã ghi fallback vào kho-data.json do Mongo lỗi.');
      } catch (fileErr) {
        console.error('❌ JSON fallback save error:', fileErr.message);
      }
    });
}

async function flushDataStore() {
  await saveQueue;
}

function getDataStoreStatus() {
  return {
    mode: usingMongo ? 'mongo' : 'json',
    collection: COLLECTION_NAME,
    documentId: DATA_DOC_ID
  };
}

module.exports = {
  initDataStore,
  readDataSync,
  writeDataSync,
  flushDataStore,
  getDataStoreStatus
};
