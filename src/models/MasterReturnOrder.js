const flexModel = require('./_flexModel');

module.exports = flexModel('MasterReturnOrder', 'masterReturnOrders', {
  id: String,
  code: String,
  date: String,
  returnDate: String,
  deliveryStaffId: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  returnOrderIds: Array,
  status: String,
  totalQuantity: Number,
  totalAmount: Number,
  debtReduction: Number,
  createdAt: String,
  updatedAt: String
});
