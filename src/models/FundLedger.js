const flexModel = require('./_flexModel');

module.exports = flexModel('FundLedger', 'fundLedgers', {
  id: String,
  code: String,
  date: String,
  fundType: String, // cash | bank
  direction: String, // in | out
  amount: Number,
  sourceType: String,
  sourceId: String,
  sourceCode: String,
  refType: String,
  refId: String,
  refCode: String,
  referenceType: String,
  referenceId: String,
  referenceCode: String,
  deliveryDate: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  customerCode: String,
  customerName: String,
  staffCode: String,
  staffName: String,
  note: String,
  status: String,
  createdBy: String,
  createdAt: String,
  updatedAt: String
});
