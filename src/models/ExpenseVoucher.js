const flexModel = require('./_flexModel');
module.exports = flexModel('ExpenseVoucher', 'expenseVouchers', {
  id: String,
  code: String,
  date: String,
  fundType: String,
  amount: Number,
  expenseType: String,
  receiverName: String,
  note: String,
  status: String,
  fundPosted: Boolean,
  postedAt: String,
  createdBy: String,
  createdAt: String,
  updatedAt: String
});
