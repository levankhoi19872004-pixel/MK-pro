const flexModel = require('./_flexModel');
module.exports = flexModel('ReturnOrder', 'returnOrders', {
  id: String,
  code: String,
  customerId: String,
  customerCode: String,
  customerName: String,

  // Các trường ngày/nhân sự được khai báo rõ để Mongoose strictQuery không loại bỏ bộ lọc.
  date: String,
  documentDate: String,
  deliveryDate: String,
  returnDate: String,
  salesStaffId: String,
  salesStaffCode: String,
  salesStaffName: String,
  salesmanCode: String,
  salesmanName: String,
  deliveryStaffId: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  deliveryCode: String,
  deliveryName: String,
  nvghCode: String,
  nvghName: String,
  nvbhCode: String,
  nvbhName: String,
  note: String,

  sourceOrderId: String,
  salesOrderId: String,
  salesOrderCode: String,
  orderId: String,
  orderCode: String,
  masterOrderId: String,
  masterOrderCode: String,
  items: Array,
  amount: Number,
  returnAmount: Number,
  status: String,
  returnStatus: String,

  // A5 - Return state machine
  returnState: String,
  stateChangedAt: String,
  stateChangedBy: String,
  stateHistory: Array,

  accountingStatus: String,
  accountingConfirmed: Boolean,
  accountingConfirmedAt: String,
  accountingBatchId: String,
  accountingConfirmedBy: String,
  accountingNote: String,

  arPosted: Boolean,
  arPostedAt: String,
  arLedgerId: String,

  createdAt: String,
  updatedAt: String
});
