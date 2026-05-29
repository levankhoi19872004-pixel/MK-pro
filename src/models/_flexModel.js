const mongoose = require('mongoose');

function flexModel(modelName, collectionName, definition = {}) {
  const schema = new mongoose.Schema(definition, {
    strict: false,
    versionKey: false,
    timestamps: false
  });
  schema.index({ id: 1 });
  schema.index({ code: 1 });
  return mongoose.models[modelName] || mongoose.model(modelName, schema, collectionName);
}

module.exports = flexModel;
