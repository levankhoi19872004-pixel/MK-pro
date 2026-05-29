'use strict';

const Setting = require('../models/Setting');

function toClient(doc) {
  if (!doc) return null;
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const { _id, __v, ...clean } = raw;
  return clean;
}

async function findAll() {
  const rows = await Setting.find({}).sort({ key: 1 }).lean();
  return rows.map(toClient);
}

async function findByKey(key) {
  return toClient(await Setting.findOne({ key }).lean());
}

async function upsert(key, value, options = {}) {
  const doc = await Setting.findOneAndUpdate(
    { key },
    { key, value: value || {}, updatedAt: new Date().toISOString() },
    { upsert: true, new: true, setDefaultsOnInsert: true, session: options.session }
  ).lean();
  return toClient(doc);
}

async function remove(key, options = {}) {
  const result = await Setting.deleteOne({ key }, { session: options.session });
  return { deletedCount: result.deletedCount || 0 };
}

module.exports = { findAll, findByKey, upsert, remove };
