const flexModel = require('./_flexModel');

module.exports = flexModel('ArLedger', 'arLedgers', {
  id: String,
  code: String,
  type: String,
  date: String,
  account: String,
  customerId: String,
  customerCode: String,
  customerName: String,
  salesmanCode: String,
  salesmanName: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  orderId: String,
  orderCode: String,
  salesOrderId: String,
  salesOrderCode: String,
  refId: String,
  refCode: String,
  refType: String,
  amount: Number,
  debit: Number,
  credit: Number,
  note: String,
  status: String,
  source: String,

  // A4 - Cash in transit metadata
  method: String,
  paymentMethod: String,
  deliveryDate: String,
  masterOrderId: String,
  masterOrderCode: String,

  accountingConfirmed: Boolean,
  accountingStatus: String,
  createdAt: String,
  updatedAt: String
});
