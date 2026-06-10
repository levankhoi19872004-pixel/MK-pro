const { normalizeSearchText } = require('../utils/search.util');
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
  isActive: { type: Boolean, default: true },
  searchText: { type: String, default: '', trim: true }
}, { timestamps: true, strict: false, versionKey: false });

// Index được chuẩn hoá tập trung tại src/services/mongoIndexService.js.


customerSchema.pre('validate', function buildSearchText(next) {
  this.searchText = normalizeSearchText([this.code, this.customerCode, this.name, this.customerName, this.phone, this.address, this.area, this.route, this.staffCode, this.staffName].filter(Boolean).join(' '));
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
