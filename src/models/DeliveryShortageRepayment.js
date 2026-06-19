const flexModel = require('./_flexModel');

module.exports = flexModel('DeliveryShortageRepayment', 'deliveryShortageRepayments', {
  id: String,
  code: String,
  shortageId: String,
  shortageCode: String,
  sourceSubmissionId: String,
  sourceSubmissionCode: String,
  deliveryDate: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  repaymentDate: String,
  fundType: String, // cash | bank - quỹ thực nhận khoản nộp bù
  amount: Number,
  status: String, // pending | confirmed | cancelled
  fundPosted: Boolean,
  postedAt: String,
  confirmedAt: String,
  confirmedBy: String,
  note: String,
  createdBy: String,
  createdAt: String,
  updatedAt: String
});
