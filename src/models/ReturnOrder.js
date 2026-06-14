const flexModel = require('./_flexModel');
module.exports = flexModel('ReturnOrder', 'returnOrders', {
  id: String,
  code: String,
  customerId: String,
  customerName: String,
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
