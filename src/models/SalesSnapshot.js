const flexModel = require('./_flexModel');

module.exports = flexModel('SalesSnapshot', 'salesSnapshots', {
  id: String,
  date: String,
  customerId: String,
  customerCode: String,
  customerName: String,
  salesmanCode: String,
  salesmanName: String,
  salesStaffCode: String,
  salesStaffName: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  saleAmount: Number,
  returnAmount: Number,
  netSalesAmount: Number,
  receiptAmount: Number,
  currentDebt: Number,
  orderCount: Number,
  updatedAt: String,
  createdAt: String
});
