const flexModel = require('./_flexModel');
module.exports = flexModel('Receipt', 'receipts', {
  id: String,
  code: String,
  customerId: String,
  customerCode: String,
  customerName: String,
  method: String,
  amount: Number,
  allocations: Array,
  orderId: String,
  orderCode: String,
  salesOrderId: String,
  salesOrderCode: String,
  status: String,
  createdAt: String,
  updatedAt: String
});
