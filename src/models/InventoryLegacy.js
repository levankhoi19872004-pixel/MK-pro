const flexModel = require('./_flexModel');

// Canonical current-stock model: `inventories` là bảng tồn hiện tại/cache chính.
// Nguồn ledger gốc của biến động tồn kho là `stockTransactions`.
// Các luồng hiển thị/check tồn phải đọc qua inventoryStock.service từ collection này.
module.exports = flexModel('InventoryLegacy', 'inventories', {
  tenantId: String,
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
  status: String,
  inventoryStatus: String,
  mergedToProductCode: String,
  mergedToWarehouseCode: String,
  mergedAt: String,
  mergeReason: String,
  lastTransactionAt: String,
  updatedAt: String
});
