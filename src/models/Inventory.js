const flexModel = require('./_flexModel');

module.exports = flexModel('Inventory', 'inventories', {
  productId: String,
  productCode: String,
  productName: String,
  warehouseId: String,
  warehouseCode: String,
  warehouseName: String,
  qty: Number,
  quantity: Number,
  onHand: Number,
  reservedQty: Number,
  availableQty: Number,
  lastTransactionAt: String,
  updatedAt: String
});
