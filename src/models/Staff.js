const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  id: { type: String, default: '', trim: true, index: true },
  code: { type: String, default: '', trim: true },
  username: { type: String, default: '', trim: true },
  password: { type: String, default: '' },
  name: { type: String, required: true, trim: true },
  fullName: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  position: { type: String, default: '', trim: true },
  department: { type: String, default: '', trim: true },
  role: { type: String, default: 'sales', trim: true, index: true },
  roleLabel: { type: String, default: '', trim: true },
  isSalesman: { type: Boolean, default: false },
  isDelivery: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: false, versionKey: false });

staffSchema.index({ code: 1 }, { unique: true, sparse: true });
staffSchema.index({ username: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.Staff || mongoose.model('Staff', staffSchema);
