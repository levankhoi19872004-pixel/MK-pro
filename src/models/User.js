const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  fullName: { type: String, default: '', trim: true },
  role: {
    type: String,
    enum: ['admin', 'manager', 'sales', 'warehouse', 'accountant', 'delivery'],
    default: 'sales'
  },
  staffCode: { type: String, default: '', trim: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
