const flexModel = require('./_flexModel');
module.exports = flexModel('MasterOrder', 'master_orders', {
  id: String,
  code: String,
  childOrderIds: Array,
  deliveryStaffName: String,
  deliveryDate: String,
  status: String,
  totalAmount: Number,
  createdAt: String,
  updatedAt: String
});
