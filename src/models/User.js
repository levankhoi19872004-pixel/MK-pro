const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  name: { type: String, default: '' },
  code: { type: String, default: '' },
  role: { type: String, enum: ['admin','sales','delivery','cashier','accountant','manager'], default: 'sales' },
  active: { type: Boolean, default: true },
  permissions: { type: [String], default: undefined }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
