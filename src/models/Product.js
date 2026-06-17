const { normalizeSearchText } = require('../utils/search.util');
const mongoose = require('mongoose');
const { normalizePickingZone, pickingZoneFrom, PICKING_ZONES } = require('../utils/pickingZone.util');



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
  // Khu bốc hàng chỉ dùng để phân chia phiếu in đơn tổng HC/PC.
  // Không tham gia quản lý tồn kho; tồn vật lý luôn thuộc kho MAIN.
  pickingZone: {
    type: String,
    enum: Object.values(PICKING_ZONES),
    trim: true
  },
  // Các field cũ chỉ giữ để đọc dữ liệu lịch sử trong giai đoạn chuyển tiếp.
  // Code mới không được dùng chúng để xác định kho tồn.
  warehouseCode: { type: String, trim: true },
  warehouseName: { type: String, trim: true },
  printGroup: { type: String, trim: true },
  printGroupName: { type: String, trim: true },
  // Products là danh mục: không lưu tồn thực tế tại đây.
  // minStock/maxStock chỉ là ngưỡng cảnh báo, không phải số tồn.
  minStock: { type: Number, default: 0 },
  maxStock: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  searchText: { type: String, default: '', trim: true }
}, { timestamps: true, strict: false, versionKey: false });

// Index được chuẩn hoá tập trung tại src/services/mongoIndexService.js.


productSchema.pre('validate', function buildSearchText(next) {
  this.pickingZone = normalizePickingZone(pickingZoneFrom(this), PICKING_ZONES.HC);
  this.searchText = normalizeSearchText([this.code, this.sku, this.productCode, this.name, this.productName, this.barcode, this.category, this.brand, this.pickingZone, this.packing, this.unit, this.baseUnit].filter(Boolean).join(' '));
  next();
});

module.exports = mongoose.model('Product', productSchema);
