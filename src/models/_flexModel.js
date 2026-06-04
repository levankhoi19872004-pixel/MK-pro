const mongoose = require('mongoose');

function flexModel(modelName, collectionName, definition = {}) {
  const schema = new mongoose.Schema(definition, {
    strict: false,
    versionKey: false,
    timestamps: false
  });
  // Không khai báo index mặc định tại model.
  // Index được quản lý tập trung tại src/services/mongoIndexService.js
  // để tránh trùng index id/code trên nhiều collection.
  return mongoose.models[modelName] || mongoose.model(modelName, schema, collectionName);
}

module.exports = flexModel;
