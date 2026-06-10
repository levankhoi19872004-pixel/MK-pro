const flexModel = require('./_flexModel');

// Legacy/deprecated snapshot model: `inventorySnapshots` không còn là nguồn đọc tồn chính.
// Luồng hiện tại đọc tồn qua `inventories`; ledger gốc là `stockTransactions`.
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
  // Alias giữ tương thích dữ liệu snapshot cũ.
  qty: Number,
  quantity: Number,
  lastTransactionAt: String,
  updatedAt: String
});
