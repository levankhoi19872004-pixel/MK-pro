const flexModel = require('./_flexModel');
module.exports = flexModel('Inventory', 'inventories', {
  productId: String,
  productCode: String,
  productName: String,
  warehouseId: String,
  warehouseCode: String,
  qty: Number,
  quantity: Number,
  availableQty: Number,
  updatedAt: String
});
