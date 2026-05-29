const MongoStore = require('../models');

function stripMongoFields(row) {
  if (!row) return row;
  const { _id, __v, ...clean } = row;
  return clean;
}

async function countCollections(keys) {
  const result = {};
  for (const key of keys) {
    const Model = MongoStore[key];
    if (Model) result[key] = await Model.countDocuments();
  }
  return result;
}

async function replaceCollection(key, rows) {
  const Model = MongoStore[key];
  if (!Model) return { key, count: 0, skipped: true };
  await Model.deleteMany({});
  if (rows && rows.length) await Model.insertMany(rows, { ordered: false });
  return { key, collection: Model.collection.name, count: rows ? rows.length : 0 };
}

async function readCollection(key) {
  const Model = MongoStore[key];
  if (!Model) return [];
  const rows = await Model.find({}).lean();
  return rows.map(stripMongoFields);
}

module.exports = { MongoStore, stripMongoFields, countCollections, replaceCollection, readCollection };
