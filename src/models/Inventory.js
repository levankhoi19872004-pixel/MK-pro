const flexModel = require('./_flexModel');

// Phase 3.4: inventorySnapshots là tồn hiển thị nhanh.
// Nguồn gốc tồn kho vẫn là stockTransactions.
module.exports = flexModel('Inventory', 'inventorySnapshots', {
  productId: String,
  productCode: String,
  productName: String,
  warehouseId: String,
  warehouseCode: String,
  warehouseName: String,
  onHand: Number,
  reservedQty: Number,
  availableQty: Number,
  // Alias giữ tương thích frontend/API cũ, nhưng giá trị được sinh từ snapshot.
  qty: Number,
  quantity: Number,
  lastTransactionAt: String,
  updatedAt: String
});
