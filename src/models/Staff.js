const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  code: { type: String, default: '', trim: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  position: { type: String, default: '', trim: true },
  department: { type: String, default: '', trim: true },
  isSalesman: { type: Boolean, default: false },
  isDelivery: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: false, versionKey: false });

module.exports = mongoose.model('Staff', staffSchema);
