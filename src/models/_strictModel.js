'use strict';

const mongoose = require('mongoose');

function strictModel(modelName, collectionName, definition = {}, options = {}) {
  const schema = new mongoose.Schema(definition, {
    strict: 'throw',
    strictQuery: true,
    versionKey: false,
    timestamps: false,
    minimize: false,
    ...options
  });
  return mongoose.models[modelName] || mongoose.model(modelName, schema, collectionName);
}

module.exports = strictModel;
