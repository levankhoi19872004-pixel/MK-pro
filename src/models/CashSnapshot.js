const flexModel = require('./_flexModel');

module.exports = flexModel('CashSnapshot', 'cashSnapshots', {
  id: String,
  date: String,
  cashAmount: Number,
  bankAmount: Number,
  receiptAmount: Number,
  returnAmount: Number,
  bonusAmount: Number,
  orderCount: Number,
  updatedAt: String,
  createdAt: String
});
