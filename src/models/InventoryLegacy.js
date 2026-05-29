const flexModel = require('./_flexModel');

// Compatibility model: một số bản cũ lưu tồn hiện tại ở collection `inventories`.
// Phase 3.4+ chuẩn là `inventorySnapshots`, nhưng search/list cần đọc cả hai
// để không hiển thị tồn = 0 khi dữ liệu cũ chưa được migrate/rebuild.
module.exports = flexModel('InventoryLegacy', 'inventories', {
  productId: String,
  productCode: String,
  productName: String,
  warehouseId: String,
  warehouseCode: String,
  warehouseName: String,
  onHand: Number,
  reservedQty: Number,
  availableQty: Number,
  qty: Number,
  quantity: Number,
  lastTransactionAt: String,
  updatedAt: String
});
