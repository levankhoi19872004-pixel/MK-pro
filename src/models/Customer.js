const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  code: { type: String, default: '', trim: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  area: { type: String, default: '', trim: true },
  route: { type: String, default: '', trim: true },
  staffCode: { type: String, default: '', trim: true },
  staffName: { type: String, default: '', trim: true },
  openingDebt: { type: Number, default: 0 },
  debtLimit: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: false, versionKey: false });

// Phase 2.6: index cho phân trang, tìm kiếm khách hàng và phân tuyến bán hàng/giao hàng.
customerSchema.index({ code: 1 });
customerSchema.index({ name: 1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ staffCode: 1 });
customerSchema.index({ route: 1 });
customerSchema.index({ isActive: 1, code: 1 });

module.exports = mongoose.model('Customer', customerSchema);
