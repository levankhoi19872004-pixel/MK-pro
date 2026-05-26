const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
const DB_NAME = process.env.DB_NAME || process.env.MONGO_DB_NAME || 'kho_minh_khai_v43';

let client = null;
let db = null;

async function connectMongo() {
  if (db) return db;
  if (!MONGO_URI) {
    console.warn('⚠️ Chưa cấu hình MONGO_URI/MONGODB_URI. Server sẽ chạy fallback bằng file JSON local.');
    return null;
  }

  client = new MongoClient(MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000
  });

  await client.connect();
  db = client.db(DB_NAME);
  console.log(`✅ MongoDB connected: ${DB_NAME}`);
  return db;
}

function getMongoDb() {
  return db;
}

async function closeMongo() {
  if (client) await client.close();
  client = null;
  db = null;
}

module.exports = {
  connectMongo,
  getMongoDb,
  closeMongo,
  DB_NAME
};
