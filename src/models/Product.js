const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  code: { type: String, default: '', trim: true },
  name: { type: String, default: '', trim: true },
  unit: { type: String, default: 'Thùng', trim: true },
  baseUnit: { type: String, default: '', trim: true },
  conversionRate: { type: Number, default: 1 },
  packing: { type: String, default: '', trim: true },
  units: [{
    name: { type: String, trim: true },
    ratio: { type: Number, default: 1 },
    isBase: { type: Boolean, default: false },
    isDefaultSale: { type: Boolean, default: false }
  }],
  barcode: { type: String, default: '', trim: true },
  category: { type: String, default: '', trim: true },
  brand: { type: String, default: '', trim: true },
  costPrice: { type: Number, default: 0 },
  salePrice: { type: Number, default: 0 },
  minStock: { type: Number, default: 0 },
  maxStock: { type: Number, default: 0 },
  openingStock: { type: Number, default: 0 },
  availableStock: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: false, versionKey: false });

// Phase 2.6: index cho danh sách, tìm kiếm và autocomplete Mongo.
productSchema.index({ code: 1 });
productSchema.index({ name: 1 });
productSchema.index({ barcode: 1 }, { sparse: true });
productSchema.index({ category: 1 });
productSchema.index({ isActive: 1, code: 1 });

module.exports = mongoose.model('Product', productSchema);
