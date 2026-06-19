const flexModel = require('./_flexModel');

// Legacy/deprecated snapshot model. Không dùng làm nguồn đọc tồn chính.
// Luồng hiện tại đọc tồn qua `inventories`; ledger gốc là `stockTransactions`.
const LEGACY_SNAPSHOT_COLLECTION = ['inventory', 'Snapshots'].join('');

module.exports = flexModel('Inventory', LEGACY_SNAPSHOT_COLLECTION, {
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
