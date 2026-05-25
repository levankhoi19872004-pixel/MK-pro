const mongoose = require('mongoose');

const DataStoreSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  data: { type: Object, default: {} }
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('DataStore', DataStoreSchema);
