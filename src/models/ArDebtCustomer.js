const flexModel = require('./_flexModel');

module.exports = flexModel('ArDebtCustomer', 'arDebtCustomers', {
  id: String,
  customerCode: String,
  customerName: String,
  salesStaffCode: String,
  salesStaffName: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  debit: Number,
  credit: Number,
  remainingDebt: Number,
  rawDebt: Number,
  orderCount: Number,
  ledgerCount: Number,
  lastDebtDate: String,
  status: String,
  rebuiltAt: String,
  readModelVersion: String
});
