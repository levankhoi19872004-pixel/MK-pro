const mongoose = require('mongoose');

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}


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
  isActive: { type: Boolean, default: true },
  searchText: { type: String, default: '', trim: true }
}, { timestamps: true, strict: false, versionKey: false });

// Phase 2.6: index cho phân trang, tìm kiếm khách hàng và phân tuyến bán hàng/giao hàng.
customerSchema.index({ code: 1 });
customerSchema.index({ name: 1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ staffCode: 1 });
customerSchema.index({ route: 1 });
customerSchema.index({ isActive: 1, code: 1 });
customerSchema.index({ staffCode: 1, route: 1, isActive: 1 });
customerSchema.index({ searchText: 1 });
customerSchema.index({ searchText: 'text' });


customerSchema.pre('validate', function buildSearchText(next) {
  this.searchText = normalizeSearchText([this.code, this.customerCode, this.name, this.customerName, this.phone, this.address, this.area, this.route, this.staffCode, this.staffName].filter(Boolean).join(' '));
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
