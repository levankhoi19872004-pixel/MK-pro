const MongoStore = require('../models');
const { clampLimit } = require('../utils/queryGuard.util');

function stripMongoFields(row) {
  if (!row) return row;
  const { _id, __v, ...clean } = row;
  return clean;
}

function getModel(collectionKey) {
  const Model = MongoStore[collectionKey];
  if (!Model) throw new Error(`Chưa khai báo Mongo model cho collection key: ${collectionKey}`);
  return Model;
}

async function findAll(collectionKey, filter = {}, options = {}) {
  const Model = getModel(collectionKey);
  let query = Model.find(filter);
  if (options.projection) query = query.select(options.projection);
  query = query.lean();
  if (options.sort) query = query.sort(options.sort);
  if (options.skip) query = query.skip(Math.max(0, Number.parseInt(options.skip, 10) || 0));
  if (options.limit) query = query.limit(clampLimit(options.limit));
  if (options.session) query = query.session(options.session);
  const rows = await query;
  return rows.map(stripMongoFields);
}

async function count(collectionKey, filter = {}, options = {}) {
  let query = getModel(collectionKey).countDocuments(filter);
  if (options.session) query = query.session(options.session);
  return query;
}

async function replaceAll(collectionKey, rows = [], options = {}) {
  const Model = getModel(collectionKey);
  await Model.deleteMany({}, { session: options.session });
  if (Array.isArray(rows) && rows.length) await Model.insertMany(rows, { ordered: false, session: options.session });
  return { key: collectionKey, collection: Model.collection.name, count: rows.length };
}

async function upsertByIdentity(collectionKey, row, identityFields = ['id', 'code'], options = {}) {
  const Model = getModel(collectionKey);
  const filter = {};
  for (const field of identityFields) {
    if (row && row[field]) {
      filter[field] = row[field];
      break;
    }
  }
  if (!Object.keys(filter).length) throw new Error(`Không có khóa định danh để upsert ${collectionKey}`);
  await Model.findOneAndUpdate(filter, row, { upsert: true, new: true, setDefaultsOnInsert: true, session: options.session });
  return row;
}


async function deleteOneByIdentity(collectionKey, idOrCode, identityFields = ['id', 'code'], options = {}) {
  const Model = getModel(collectionKey);
  const value = String(idOrCode || '').trim();
  if (!value) throw new Error(`Không có khóa định danh để xóa ${collectionKey}`);
  const filter = { $or: identityFields.map((field) => ({ [field]: value })) };
  return Model.deleteOne(filter, { session: options.session });
}

module.exports = { MongoStore, stripMongoFields, getModel, findAll, count, replaceAll, upsertByIdentity, deleteOneByIdentity };
