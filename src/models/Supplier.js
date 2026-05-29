const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  code: { type: String, default: '', trim: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  taxCode: { type: String, default: '', trim: true },
  openingDebt: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: false, versionKey: false });

module.exports = mongoose.model('Supplier', supplierSchema);
