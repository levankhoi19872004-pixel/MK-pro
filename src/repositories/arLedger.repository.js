'use strict';

const ArLedger = require('../models/ArLedger');

async function insertOnceByIdempotencyKey(doc = {}, options = {}) {
  const key = doc.idempotencyKey || `${doc.refType || doc.sourceType || doc.type}:${doc.refId || doc.sourceId || doc.id}:${doc.type || doc.entryType || ''}`;
  return ArLedger.findOneAndUpdate(
    { idempotencyKey: key },
    { $setOnInsert: { ...doc, idempotencyKey: key } },
    { upsert: true, new: true, session: options.session }
  );
}

function findBalance(match = {}) {
  return aggregateBalance(match);
}

function aggregateBalance(match = {}) {
  return ArLedger.aggregate([
    { $match: { status: { $nin: ['void', 'cancelled', 'canceled', 'deleted'] }, ...match } },
    { $group: { _id: '$customerId', debit: { $sum: { $ifNull: ['$debit', 0] } }, credit: { $sum: { $ifNull: ['$credit', 0] } }, balance: { $sum: { $subtract: [{ $ifNull: ['$debit', 0] }, { $ifNull: ['$credit', 0] }] } } } }
  ]);
}

module.exports = { insertOnceByIdempotencyKey, findBalance, aggregateBalance };
