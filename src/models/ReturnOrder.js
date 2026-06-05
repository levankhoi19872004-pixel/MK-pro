const flexModel = require('./_flexModel');
module.exports = flexModel('ReturnOrder', 'returnOrders', {
  id: String,
  code: String,
  customerId: String,
  customerName: String,
  sourceOrderId: String,
  items: Array,
  amount: Number,
  status: String,
  createdAt: String
});
