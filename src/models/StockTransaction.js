const flexModel = require('./_flexModel');

module.exports = flexModel('StockTransaction', 'stockTransactions', {
  id: String,
  date: String,
  productId: String,
  productCode: String,
  productName: String,
  warehouseId: String,
  warehouseCode: String,
  warehouseName: String,
  type: String,
  direction: String,
  quantity: Number,
  qty: Number,
  inQty: Number,
  outQty: Number,
  balanceQty: Number,
  refType: String,
  refId: String,
  refCode: String,
  note: String,
  createdAt: String,
  updatedAt: String
});
