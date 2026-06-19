const flexModel = require('./_flexModel');

module.exports = flexModel('DeliveryCashShortage', 'deliveryCashShortages', {
  id: String,
  code: String,
  sourceSubmissionId: String,
  sourceSubmissionCode: String,
  deliveryDate: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  fundType: String, // cash | bank
  reasonType: String,
  responsibleType: String, // delivery_staff | customer | pending | adjustment
  originalShortageAmount: Number,
  settledAmount: Number,
  adjustedAmount: Number,
  pendingRepaymentAmount: Number,
  outstandingAmount: Number,
  status: String, // open | partial | settled | pending_reconciliation | customer_outstanding | adjusted | disputed | cancelled
  note: String,
  classifiedBy: String,
  classifiedAt: String,
  createdBy: String,
  createdAt: String,
  updatedAt: String
});
