const flexModel = require('./_flexModel');
module.exports = flexModel('Bankbook', 'bankbooks', {
  id: String,
  code: String,
  type: String,
  amount: Number,
  bankName: String,
  accountNumber: String,
  source: String,
  refType: String,
  refId: String,
  note: String,
  createdAt: String
});
