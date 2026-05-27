const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  address: { type: String, default: '', trim: true },
  keeper: { type: String, default: '', trim: true },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Warehouse', warehouseSchema);
