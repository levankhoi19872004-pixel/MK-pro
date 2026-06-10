const flexModel = require('./_flexModel');

module.exports = flexModel('DeliveryCashSubmission', 'deliveryCashSubmissions', {
  id: String,
  code: String,
  deliveryDate: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  reportCashAmount: Number,
  reportBankAmount: Number,
  reportCurrentOrderCashAmount: Number,
  reportCurrentOrderBankAmount: Number,
  reportOldDebtCashAmount: Number,
  reportOldDebtBankAmount: Number,
  submittedCashAmount: Number,
  submittedBankAmount: Number,
  differenceCashAmount: Number,
  differenceBankAmount: Number,
  orderCodes: [String],
  orderIds: [String],
  status: String, // pending | confirmed | cancelled
  matchStatus: String, // matched | mismatch
  fundPosted: Boolean,
  postedAt: String,
  confirmedAt: String,
  confirmedBy: String,
  note: String,
  createdBy: String,
  createdAt: String,
  updatedAt: String
});
