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
  // Kho mặc định dùng để chia phiếu nhặt hàng/in đơn tổng cho NPP có nhiều kho.
  warehouseCode: { type: String, default: 'KHO_HC', trim: true },
  warehouseName: { type: String, default: 'KHO HC', trim: true },
  // Products là danh mục: không lưu tồn thực tế tại đây.
  // minStock/maxStock chỉ là ngưỡng cảnh báo, không phải số tồn.
  minStock: { type: Number, default: 0 },
  maxStock: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  searchText: { type: String, default: '', trim: true }
}, { timestamps: true, strict: false, versionKey: false });

// Phase 2.6: index cho danh sách, tìm kiếm và autocomplete Mongo.
productSchema.index({ code: 1 });
productSchema.index({ name: 1 });
productSchema.index({ barcode: 1 }, { sparse: true });
productSchema.index({ category: 1 });
productSchema.index({ warehouseCode: 1, code: 1 });
productSchema.index({ isActive: 1, code: 1 });
productSchema.index({ isActive: 1, category: 1 });
productSchema.index({ warehouseCode: 1, code: 1 });
productSchema.index({ searchText: 1 });
productSchema.index({ searchText: 'text' });


productSchema.pre('validate', function buildSearchText(next) {
  this.searchText = normalizeSearchText([this.code, this.sku, this.productCode, this.name, this.productName, this.barcode, this.category, this.brand, this.warehouseCode, this.warehouseName, this.packing, this.unit, this.baseUnit].filter(Boolean).join(' '));
  next();
});

module.exports = mongoose.model('Product', productSchema);
