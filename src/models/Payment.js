const flexModel = require('./_flexModel');
module.exports = flexModel('PaymentJournal', 'journals', {
  id: String,
  code: String,
  type: String,
  amount: Number,
  refType: String,
  refId: String,
  note: String,
  createdAt: String
});
