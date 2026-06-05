const flexModel = require('./_flexModel');
module.exports = flexModel('FundTransfer', 'fundTransfers', {
  id: String,
  code: String,
  date: String,
  fromFund: String,
  toFund: String,
  amount: Number,
  bankName: String,
  accountNumber: String,
  note: String,
  status: String,
  fundPosted: Boolean,
  postedAt: String,
  createdBy: String,
  createdAt: String,
  updatedAt: String
});
