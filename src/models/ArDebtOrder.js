const flexModel = require('./_flexModel');

module.exports = flexModel('ArDebtOrder', 'arDebtOrders', {
  id: String,
  customerCode: String,
  customerName: String,
  sourceType: String,
  sourceId: String,
  sourceCode: String,
  salesStaffCode: String,
  salesStaffName: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  masterOrderId: String,
  masterOrderCode: String,
  debit: Number,
  credit: Number,
  remainingDebt: Number,
  rawDebt: Number,
  orderCount: Number,
  ledgerCount: Number,
  ledgerIds: Array,
  lastDebtDate: String,
  status: String,
  rebuiltAt: String,
  readModelVersion: String
});
