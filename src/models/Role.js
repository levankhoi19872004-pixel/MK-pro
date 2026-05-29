const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, unique: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: false, versionKey: false });

module.exports = mongoose.models.Role || mongoose.model('Role', roleSchema, 'roles');
