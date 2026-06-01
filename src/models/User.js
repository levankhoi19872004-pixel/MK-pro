const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  fullName: { type: String, default: '', trim: true },
  name: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  code: { type: String, default: '', trim: true },
  role: {
    type: String,
    enum: ['admin', 'manager', 'sales', 'warehouse', 'accountant', 'delivery'],
    default: 'sales'
  },
  staffCode: { type: String, default: '', trim: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: false });

userSchema.index({ staffCode: 1 }, { sparse: true });
userSchema.index({ code: 1 }, { sparse: true });
userSchema.index({ employeeCode: 1 }, { sparse: true });
userSchema.index({ role: 1, isActive: 1, staffCode: 1 });
userSchema.index({ role: 1, staffCode: 1 });

module.exports = mongoose.model('User', userSchema);
