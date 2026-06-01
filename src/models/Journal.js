const flexModel = require('./_flexModel');

module.exports = flexModel('Journal', 'journals', {
  id: String,
  code: String,
  type: String,
  date: String,
  customerCode: String,
  customerName: String,
  orderId: String,
  orderCode: String,
  refId: String,
  refCode: String,
  refType: String,
  amount: Number,
  debit: Number,
  credit: Number,
  note: String,
  createdAt: String,
  updatedAt: String
});
