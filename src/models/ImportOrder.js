const flexModel = require('./_flexModel');
module.exports = flexModel('ImportOrder', 'imports', {
  id: String,
  code: String,
  supplierId: String,
  supplierName: String,
  warehouseId: String,
  status: String,
  items: Array,
  totalAmount: Number,
  createdAt: String,
  updatedAt: String
});
