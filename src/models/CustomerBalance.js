const flexModel = require('./_flexModel');

module.exports = flexModel('CustomerBalance', 'customerBalances', {
  id: String,
  customerId: String,
  customerCode: String,
  customerName: String,
  saleAmount: Number,
  returnAmount: Number,
  receiptAmount: Number,
  cashAmount: Number,
  bankAmount: Number,
  bonusAmount: Number,
  totalCredit: Number,
  currentDebt: Number,
  openOrderCount: Number,
  orderCount: Number,
  overdueCount: Number,
  lastDocumentDate: String,
  lastUpdatedFrom: String,
  debtZeroTolerance: Number,
  orderSnapshots: Array,
  updatedAt: String,
  createdAt: String
});
