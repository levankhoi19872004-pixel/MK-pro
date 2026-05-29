const flexModel = require('./_flexModel');
module.exports = flexModel('SalesOrder', 'orders', {
  id: String,
  code: String,
  customerId: String,
  customerCode: String,
  customerName: String,
  staffName: String,
  deliveryStaffName: String,
  deliveryDate: String,
  source: String,
  status: String,
  items: Array,
  totalAmount: Number,
  paidAmount: Number,
  debtAmount: Number,
  createdAt: String,
  updatedAt: String
});
