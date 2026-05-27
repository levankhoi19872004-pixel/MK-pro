const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  unit: { type: String, default: 'Thùng', trim: true },
  packing: { type: String, default: '', trim: true },
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
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
