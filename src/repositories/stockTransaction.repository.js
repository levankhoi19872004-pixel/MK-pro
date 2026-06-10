'use strict';

const StockTransaction = require('../models/StockTransaction');

function withOptionalSession(query, session) {
  return query && typeof query.session === 'function' ? query.session(session || null) : query;
}

async function maybeLean(result) {
  return typeof result?.lean === 'function' ? result.lean() : result;
}

function isDuplicateKeyError(err) {
  return err && (err.code === 11000 || String(err.message || '').includes('E11000'));
}

async function findByIdempotencyKey(idempotencyKey, options = {}) {
  if (!idempotencyKey) return null;
  const query = StockTransaction.findOne({ idempotencyKey });
  return maybeLean(withOptionalSession(query, options.session));
}

async function insertOnceByIdempotencyKey(doc = {}, options = {}) {
  if (!doc.idempotencyKey) {
    const rows = await StockTransaction.create([doc], options);
    return rows[0];
  }

  // Giữ tương thích với test in-memory/mocked model: chỉ mock findOne/create,
  // không cần Mongo connection thật. Ở production vẫn an toàn nhờ unique index
  // idempotencyKey và bắt duplicate key khi có race condition.
  const existing = await findByIdempotencyKey(doc.idempotencyKey, options);
  if (existing) return existing;

  try {
    const now = doc.updatedAt || new Date().toISOString();
    const rows = await StockTransaction.create([{ ...doc, updatedAt: now }], options);
    return rows[0];
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const duplicate = await findByIdempotencyKey(doc.idempotencyKey, options);
    if (duplicate) return duplicate;
    throw err;
  }
}

function insertMany(rows = [], options = {}) {
  return StockTransaction.insertMany(rows, options);
}

function updateMany(filter = {}, update = {}, options = {}) {
  return StockTransaction.updateMany(filter, update, options);
}

function aggregateBalance(match = {}) {
  return StockTransaction.aggregate([
    { $match: { status: { $nin: ['void', 'cancelled', 'canceled', 'deleted'] }, ...match } },
    { $group: { _id: '$productCode', balance: { $sum: { $ifNull: ['$quantity', '$qty'] } } } }
  ]);
}

module.exports = { insertOnceByIdempotencyKey, insertMany, updateMany, aggregateBalance };
